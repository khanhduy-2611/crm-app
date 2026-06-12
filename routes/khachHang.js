const express = require('express');

module.exports = function createKhachHangRouter({ pool }) {
    const router = express.Router();

    router.get('/khach-hang', async (req, res) => {
        try {
            const requestedPage = parseInt(req.query.page, 10) || 1;
            const requestedLimit = parseInt(req.query.limit, 10) || 20;
            const limit = requestedLimit === 50 ? 50 : 20;
            const keyword = String(req.query.keyword || '').trim();
            const chucVu = String(req.query.chucVu || 'all');

            const chucVuResult = await pool.query('SELECT * FROM chuc_vu ORDER BY id ASC');
            const capCao = ['giám đốc', 'phó giám đốc', 'tổng giám đốc', 'chủ tịch', 'phó chủ tịch', 'hiệu trưởng', 'phó hiệu trưởng', 'hiệu phó', 'lãnh đạo', 'bí thư', 'phó bí thư', 'viện trưởng'];
            const capGiua = ['trưởng phòng', 'phó trưởng phòng', 'trưởng ban', 'trưởng bộ phận', 'trưởng nhóm', 'quản lý', 'tổ trưởng', 'trưởng khoa', 'trưởng chi nhánh'];
            const getCap = (ten) => {
                const normalized = String(ten || '').toLowerCase();
                if (capCao.some(key => normalized.includes(key))) return 'cap1';
                if (capGiua.some(key => normalized.includes(key))) return 'cap2';
                return 'cap3';
            };

            const whereParts = [];
            const filterParams = [];
            if (keyword) {
                filterParams.push(`%${keyword}%`);
                whereParts.push(`(
                    v.ho_ten ILIKE $${filterParams.length}
                    OR COALESCE(v.so_dien_thoai, '') ILIKE $${filterParams.length}
                    OR COALESCE(kh.ten_khach_hang, '') ILIKE $${filterParams.length}
                )`);
            }

            if (chucVu.startsWith('cv-')) {
                const chucVuId = parseInt(chucVu.replace('cv-', ''), 10);
                if (Number.isInteger(chucVuId)) {
                    filterParams.push(chucVuId);
                    whereParts.push(`v.chuc_vu_id = $${filterParams.length}`);
                }
            } else if (['cap1', 'cap2', 'cap3'].includes(chucVu)) {
                const ids = chucVuResult.rows
                    .filter(cv => getCap(cv.ten_chuc_vu) === chucVu)
                    .map(cv => cv.id);
                filterParams.push(ids);
                const idCondition = `v.chuc_vu_id = ANY($${filterParams.length}::int[])`;
                whereParts.push(chucVu === 'cap3'
                    ? `(${idCondition} OR v.chuc_vu_id IS NULL)`
                    : idCondition);
            }

            const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
            const totalResult = await pool.query(`
                SELECT COUNT(*)::int AS total
                FROM vip v
                LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
                LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
                ${whereClause}
            `, filterParams);

            const totalFilteredVip = totalResult.rows[0].total;
            const totalPages = Math.max(1, Math.ceil(totalFilteredVip / limit));
            const page = Math.min(Math.max(requestedPage, 1), totalPages);
            const offset = (page - 1) * limit;

            const vipParams = [...filterParams, limit, offset];
            const vipResult = await pool.query(`
                SELECT v.*, cv.ten_chuc_vu AS chuc_vu, kh.ten_khach_hang
                FROM vip v
                LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
                LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
                ${whereClause}
                ORDER BY v.id DESC
                LIMIT $${vipParams.length - 1} OFFSET $${vipParams.length}
            `, vipParams);

            const vipIds = vipResult.rows.map(vip => vip.id);
            if (vipIds.length > 0) {
                const careResult = await pool.query(`
                    SELECT vip_id,
                           COUNT(*)::int AS lich_su_count,
                           MAX(ngay_lien_he) AS last_care_date
                    FROM lich_su_cham_soc
                    WHERE vip_id = ANY($1::int[])
                    GROUP BY vip_id
                `, [vipIds]);
                const careByVip = new Map(careResult.rows.map(row => [row.vip_id, row]));

                vipResult.rows.forEach(vip => {
                    const care = careByVip.get(vip.id);
                    vip.lich_su_count = care?.lich_su_count || 0;
                    vip.last_care_date = care?.last_care_date || null;
                });
            }

            const scopedKhachHangSql = 'SELECT id, ten_khach_hang, ngay_thanh_lap, ma_kh FROM khach_hang ORDER BY id DESC LIMIT $1 OFFSET $2';
            const scopedKhachHangParams = [limit, offset];
            const scopedOptionsSql = 'SELECT id, ten_khach_hang FROM khach_hang ORDER BY ten_khach_hang ASC';
            const scopedCountKhSql = 'SELECT COUNT(*)::int AS total FROM khach_hang';
            const scopedCountVipSql = 'SELECT COUNT(*)::int AS total FROM vip';
            const [
                khachHangResult,
                khachHangOptionsResult,
                tongKhachHangResult,
                tongVipResult,
                suKienKhachHangResult,
                suKienVipResult
            ] = await Promise.all([
                pool.query(scopedKhachHangSql, scopedKhachHangParams),
                pool.query(scopedOptionsSql),
                pool.query(scopedCountKhSql),
                pool.query(scopedCountVipSql),
                pool.query(`
                    SELECT id, ten_khach_hang, ngay_thanh_lap
                    FROM khach_hang
                    WHERE ngay_thanh_lap IS NOT NULL
                `),
                pool.query(`
                    SELECT v.id, v.ho_ten, v.ngay_sinh, kh.ten_khach_hang
                    FROM vip v
                    LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
                    WHERE v.ngay_sinh IS NOT NULL
                `)
            ]);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const getUpcomingDate = (dateValue) => {
                const original = new Date(dateValue);
                let upcoming = new Date(today.getFullYear(), original.getMonth(), original.getDate());
                if (upcoming < today) {
                    upcoming = new Date(today.getFullYear() + 1, original.getMonth(), original.getDate());
                }
                return upcoming;
            };
            const buildEvent = (type, id, title, subtitle, dateValue) => {
                const eventDate = getUpcomingDate(dateValue);
                const daysLeft = Math.round((eventDate - today) / 86400000);
                return {
                    type,
                    id,
                    title,
                    subtitle,
                    date: eventDate,
                    daysLeft
                };
            };

            const suKien = [
                ...suKienKhachHangResult.rows.map(kh => buildEvent(
                    'khach-hang',
                    kh.id,
                    kh.ten_khach_hang,
                    'Kỷ niệm ngày thành lập',
                    kh.ngay_thanh_lap
                )),
                ...suKienVipResult.rows.map(vip => buildEvent(
                    'vip',
                    vip.id,
                    vip.ho_ten,
                    vip.ten_khach_hang || 'Chưa có doanh nghiệp',
                    vip.ngay_sinh
                ))
            ]
                .filter(event => event.daysLeft >= 0 && event.daysLeft <= 7)
                .sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title, 'vi'));

            const suKienHomNay = suKien.filter(event => event.daysLeft === 0);
            const suKienSapToi = suKien.filter(event => event.daysLeft > 0);

            const tongKH = tongKhachHangResult.rows[0].total;
            const tongVip = tongVipResult.rows[0].total;

            res.render('khach-hang', {
                listKhachHang: khachHangOptionsResult.rows,
                listKhachHangPage: khachHangResult.rows,
                listVip: vipResult.rows,
                listChucVu: chucVuResult.rows,
                thongKe: { tongKH, tongVip },
                page,
                limit,
                totalPages,
                totalKhachHang: tongKH,
                totalVip: tongVip,
                totalFilteredVip,
                keyword,
                chucVu,
                suKienHomNay,
                suKienSapToi
            });
        } catch (err) {
            console.error('Lỗi trang khách hàng:', err);
            res.status(500).send('Lỗi tải dữ liệu: ' + err.message);
        }
    });

    router.post('/khach-hang/add-all', async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { ten_khach_hang, ngay_thanh_lap } = req.body;
            const khResult = await client.query(
                'INSERT INTO khach_hang (ten_khach_hang, ngay_thanh_lap) VALUES ($1, $2) RETURNING id',
                [ten_khach_hang, ngay_thanh_lap || null]
            );
            const newKhachHangId = khResult.rows[0].id;

            const ho_ten_arr = [].concat(req.body.ho_ten || []);
            const chuc_vu_id_arr = [].concat(req.body.chuc_vu_id || []);
            const ngay_sinh_arr = [].concat(req.body.ngay_sinh || []);
            const so_dien_thoai_arr = [].concat(req.body.so_dien_thoai || []);

            for (let i = 0; i < ho_ten_arr.length; i++) {
                const ht = ho_ten_arr[i]?.trim();
                if (!ht) continue;
                await client.query(
                    'INSERT INTO vip (khach_hang_id, chuc_vu_id, ho_ten, ngay_sinh, so_dien_thoai) VALUES ($1, $2, $3, $4, $5)',
                    [newKhachHangId, chuc_vu_id_arr[i] || null, ht, ngay_sinh_arr[i] || null, so_dien_thoai_arr[i] || null]
                );
            }

            await client.query('COMMIT');
            res.redirect('/khach-hang?toast=Đã%20thêm%20khách%20hàng%20và%20VIP%20thành%20công!&type=success');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Lỗi thêm mới:', err);
            res.status(500).send('Lỗi khi lưu dữ liệu: ' + err.message);
        } finally {
            client.release();
        }
    });

    router.post('/khach-hang/update', async (req, res) => {
        const { id, ten_khach_hang, ngay_thanh_lap } = req.body;
        try {
            await pool.query(
                'UPDATE khach_hang SET ten_khach_hang = $1, ngay_thanh_lap = $2 WHERE id = $3',
                [ten_khach_hang, ngay_thanh_lap || null, id]
            );
            res.redirect('/khach-hang?toast=Đã%20cập%20nhật%20doanh%20nghiệp%20thành%20công!&type=success');
        } catch (err) {
            console.error('Lỗi cập nhật KH:', err);
            res.status(500).send('Lỗi cập nhật: ' + err.message);
        }
    });

    router.get('/khach-hang/delete/:id', async (req, res) => {
        try {
            await pool.query('DELETE FROM vip WHERE khach_hang_id = $1', [req.params.id]);
            await pool.query('DELETE FROM khach_hang WHERE id = $1', [req.params.id]);
            res.redirect('/khach-hang?toast=Đã%20xóa%20doanh%20nghiệp%20thành%20công!&type=warning');
        } catch (err) {
            console.error('Lỗi xóa KH:', err);
            res.status(500).send('Lỗi xóa: ' + err.message);
        }
    });

    return router;
};
