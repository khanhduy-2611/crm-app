const express = require('express');

module.exports = function createKhachHangRouter({ pool }) {
    const router = express.Router();

    router.get('/khach-hang', async (req, res) => {
        try {
            const requestedPage = parseInt(req.query.page, 10) || 1;
            const requestedLimit = parseInt(req.query.limit, 10) || 20;
            const limit = requestedLimit === 50 ? 50 : 20;
            const keyword = String(req.query.keyword || '').trim();
            const chucVu = 'all';

            const chucVuResult = await pool.query('SELECT * FROM chuc_vu ORDER BY id ASC');
            const capCao = ['giám đốc', 'phó giám đốc', 'tổng giám đốc', 'chủ tịch', 'phó chủ tịch', 'hiệu trưởng', 'phó hiệu trưởng', 'hiệu phó', 'lãnh đạo', 'bí thư', 'phó bí thư', 'viện trưởng'];
            const capGiua = ['trưởng phòng', 'phó trưởng phòng', 'trưởng ban', 'trưởng bộ phận', 'trưởng nhóm', 'quản lý', 'tổ trưởng', 'trưởng khoa', 'trưởng chi nhánh'];
            const getCap = (ten) => {
                const normalized = String(ten || '').toLowerCase();
                if (capCao.some(key => normalized.includes(key))) return 'cap1';
                if (capGiua.some(key => normalized.includes(key))) return 'cap2';
                return 'cap3';
            };

            const vipMatchParts = [];
            const filterParams = [];
            if (keyword) {
                filterParams.push(`%${keyword}%`);
                vipMatchParts.push(`(
                    kh.ten_khach_hang ILIKE $${filterParams.length}
                    OR COALESCE(kh.ma_kh, '') ILIKE $${filterParams.length}
                    OR v.ho_ten ILIKE $${filterParams.length}
                    OR COALESCE(v.so_dien_thoai, '') ILIKE $${filterParams.length}
                )`);
            }

            if (chucVu.startsWith('cv-')) {
                const chucVuId = parseInt(chucVu.replace('cv-', ''), 10);
                if (Number.isInteger(chucVuId)) {
                    filterParams.push(chucVuId);
                    vipMatchParts.push(`v.chuc_vu_id = $${filterParams.length}`);
                }
            } else if (['cap1', 'cap2', 'cap3'].includes(chucVu)) {
                const ids = chucVuResult.rows
                    .filter(cv => getCap(cv.ten_chuc_vu) === chucVu)
                    .map(cv => cv.id);
                filterParams.push(ids);
                const idCondition = `v.chuc_vu_id = ANY($${filterParams.length}::int[])`;
                vipMatchParts.push(chucVu === 'cap3'
                    ? `(${idCondition} OR v.chuc_vu_id IS NULL)`
                    : idCondition);
            }

            const customerWhereClause = vipMatchParts.length
                ? `WHERE EXISTS (
                    SELECT 1
                    FROM vip v
                    LEFT JOIN chuc_vu filter_cv ON filter_cv.id = v.chuc_vu_id
                    WHERE v.khach_hang_id = kh.id
                      AND LOWER(TRIM(COALESCE(filter_cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                      AND ${vipMatchParts.join(' AND ')}
                )`
                : '';
            const totalResult = await pool.query(`
                SELECT COUNT(*)::int AS total
                FROM khach_hang kh
                ${customerWhereClause}
            `, filterParams);

            const totalFilteredKhachHang = totalResult.rows[0].total;
            const totalPages = Math.max(1, Math.ceil(totalFilteredKhachHang / limit));
            const page = Math.min(Math.max(requestedPage, 1), totalPages);
            const offset = (page - 1) * limit;

            const customerParams = [...filterParams, limit, offset];
            const customerResult = await pool.query(`
                SELECT
                    kh.*,
                    COALESCE(kh.ma_kh, 'KH' || LPAD(kh.id::text, 3, '0')) AS ma_kh,
                    cb.ho_ten AS can_bo_cham_soc,
                    cb.phong_ban
                FROM khach_hang kh
                LEFT JOIN can_bo_quan_ly cb ON kh.can_bo_id = cb.id
                ${customerWhereClause}
                ORDER BY kh.id DESC
                LIMIT $${customerParams.length - 1} OFFSET $${customerParams.length}
            `, customerParams);
            const customerIds = customerResult.rows.map(customer => customer.id);

            let vipRows = [];
            if (customerIds.length > 0) {
                const vipResult = await pool.query(`
                    SELECT
                        v.*,
                        cv.ten_chuc_vu AS chuc_vu,
                        cb.ho_ten AS can_bo_quan_ly,
                        cb.phong_ban AS phong_ban_can_bo,
                        COALESCE(care.lich_su_count, 0)::int AS lich_su_count,
                        care.last_care_date
                    FROM vip v
                    LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
                    LEFT JOIN can_bo_quan_ly cb ON cb.id = v.can_bo_quan_ly_id
                    LEFT JOIN (
                        SELECT
                            vip_id,
                            COUNT(*)::int AS lich_su_count,
                            MAX(ngay_lien_he) AS last_care_date
                        FROM lich_su_cham_soc
                        WHERE vip_id IN (
                            SELECT id FROM vip WHERE khach_hang_id = ANY($1::int[])
                        )
                        GROUP BY vip_id
                    ) care ON care.vip_id = v.id
                    WHERE v.khach_hang_id = ANY($1::int[])
                      AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                    ORDER BY v.khach_hang_id, v.id DESC
                `, [customerIds]);
                vipRows = vipResult.rows;
            }

            const normalizeRole = value => String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .toLowerCase();
            const rolePriority = value => {
                const role = normalizeRole(value);
                const priorities = [
                    ['tong giam doc', 10],
                    ['pho giam doc', 30],
                    ['giam doc', 20],
                    ['hieu truong', 40],
                    ['pho hieu truong', 50],
                    ['hieu pho', 50],
                    ['lanh dao', 60],
                    ['ke toan truong', 70],
                    ['ke toan', 80],
                    ['nhan vien', 90],
                    ['chuyen vien', 100]
                ];
                return priorities.find(([key]) => role.includes(key))?.[1] || 999;
            };
            const getVipGroup = value => {
                const role = normalizeRole(value);
                if (role.includes('ke toan')) return 'ke_toan';

                const leadershipKeys = [
                    'giam doc',
                    'chu tich',
                    'hieu truong',
                    'hieu pho',
                    'lanh dao',
                    'bi thu',
                    'vien truong',
                    'truong phong',
                    'truong ban',
                    'truong bo phan',
                    'truong nhom',
                    'quan ly',
                    'to truong',
                    'truong khoa',
                    'truong chi nhanh'
                ];
                return leadershipKeys.some(key => role.includes(key)) ? 'lanh_dao' : 'khac';
            };
            const getRoleColorGroup = value => {
                const role = normalizeRole(value);
                const topLeadershipKeys = [
                    'lanh dao',
                    'giam doc',
                    'hieu truong',
                    'hieu pho',
                    'chu tich',
                    'bi thu',
                    'vien truong'
                ];
                if (topLeadershipKeys.some(key => role.includes(key))) return 'cap-cao';

                const managementKeys = [
                    'ke toan',
                    'quan ly',
                    'truong phong',
                    'pho truong phong'
                ];
                if (managementKeys.some(key => role.includes(key))) return 'quan-ly';

                return 'khac';
            };
            const vipByCustomer = new Map();
            vipRows.forEach(vip => {
                if (!vipByCustomer.has(vip.khach_hang_id)) vipByCustomer.set(vip.khach_hang_id, []);
                vipByCustomer.get(vip.khach_hang_id).push(vip);
            });
            const listKhachHangGrouped = customerResult.rows.map(customer => {
                const dsVip = (vipByCustomer.get(customer.id) || [])
                    .filter(vip => normalizeRole(vip.chuc_vu).trim() !== 'quan ly')
                    .sort((a, b) => rolePriority(a.chuc_vu) - rolePriority(b.chuc_vu) || b.id - a.id);
                return {
                    ...customer,
                    ds_vip: dsVip.map(vip => ({
                        ...vip,
                        nhom_hien_thi: getVipGroup(vip.chuc_vu),
                        nhom_mau_chuc_vu: getRoleColorGroup(vip.chuc_vu)
                    })),
                    lich_su_count: dsVip.reduce((sum, vip) => sum + Number(vip.lich_su_count || 0), 0),
                    ghi_chu_count: dsVip.filter(vip => String(vip.ghi_chu || '').trim()).length
                };
            });

            const scopedOptionsSql = `
                SELECT
                    kh.id,
                    kh.ten_khach_hang,
                    cb.ho_ten AS can_bo_cham_soc,
                    cb.phong_ban
                FROM khach_hang kh
                LEFT JOIN can_bo_quan_ly cb ON cb.id = kh.can_bo_id
                ORDER BY kh.ten_khach_hang ASC
            `;
            const scopedCountKhSql = 'SELECT COUNT(*)::int AS total FROM khach_hang';
            const scopedCountVipSql = `
                SELECT COUNT(*)::int AS total
                FROM vip v
                LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                WHERE LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
            `;
            const [
                khachHangOptionsResult,
                tongKhachHangResult,
                tongVipResult,
                suKienKhachHangResult,
                suKienVipResult
            ] = await Promise.all([
                pool.query(scopedOptionsSql),
                pool.query(scopedCountKhSql),
                pool.query(scopedCountVipSql),
                pool.query(`
                    SELECT
                        kh.id,
                        kh.ten_khach_hang,
                        kh.ngay_thanh_lap,
                        cb.ho_ten AS can_bo_cham_soc,
                        cb.phong_ban
                    FROM khach_hang kh
                    LEFT JOIN can_bo_quan_ly cb ON cb.id = kh.can_bo_id
                    WHERE kh.ngay_thanh_lap IS NOT NULL
                `),
                pool.query(`
                    SELECT v.id, v.ho_ten, v.ngay_sinh, kh.ten_khach_hang
                    FROM vip v
                    LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
                    LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                    WHERE v.ngay_sinh IS NOT NULL
                      AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
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
                listKhachHangGrouped,
                listChucVu: chucVuResult.rows,
                thongKe: { tongKH, tongVip },
                page,
                limit,
                totalPages,
                totalKhachHang: tongKH,
                totalVip: tongVip,
                totalFilteredKhachHang,
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
            await client.query(
                `UPDATE khach_hang
                 SET ma_kh = COALESCE(ma_kh, 'KH' || LPAD(id::text, 3, '0'))
                 WHERE id = $1`,
                [newKhachHangId]
            );

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
