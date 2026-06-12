const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const ExcelJS = require('exceljs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const pgSession = require('connect-pg-simple')(session);
const { requireLogin, requireRole } = require('./middleware/auth');

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== CẤU HÌNH DATABASE ====================
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'crm_db',
    password: '123456',
    port: 5432,
});

const sessionSecret = process.env.SESSION_SECRET || 'crm-agribank-development-secret-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
}

app.use(session({
    store: new pgSession({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    }),
    name: 'crm.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000
    }
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

pool.connect()
    .then(() => console.log('✅ Kết nối PostgreSQL thành công!'))
    .catch(err => console.error('❌ Lỗi kết nối DB:', err));


// ==================== 1. DASHBOARD ====================
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { error: null, username: '' });
});

app.post('/login', async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const returnTo = req.session.returnTo || '/';

    try {
        const result = await pool.query(`
            SELECT id, username, password_hash, full_name, role, can_bo_quan_ly_id
            FROM users
            WHERE username = $1
        `, [username]);
        const account = result.rows[0];
        const isValid = account && await bcrypt.compare(password, account.password_hash);

        if (!isValid) {
            return res.status(401).render('login', {
                error: 'Tên đăng nhập hoặc mật khẩu không chính xác',
                username
            });
        }

        req.session.regenerate(err => {
            if (err) return res.status(500).send('Không thể tạo phiên đăng nhập');

            req.session.user = {
                id: account.id,
                username: account.username,
                full_name: account.full_name || account.username,
                role: account.role,
                can_bo_quan_ly_id: account.can_bo_quan_ly_id
            };

            req.session.save(saveErr => {
                if (saveErr) return res.status(500).send('Không thể lưu phiên đăng nhập');
                res.redirect(returnTo);
            });
        });
    } catch (err) {
        console.error('Lỗi đăng nhập:', err);
        res.status(500).render('login', {
            error: 'Không thể đăng nhập lúc này',
            username
        });
    }
});

app.post('/logout', requireLogin, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('crm.sid');
        res.redirect('/login');
    });
});

app.use(requireLogin);

function requireAssignedVip(vipIdResolver) {
    return async (req, res, next) => {
        if (req.session.user.role !== 'can_bo') return next();

        const canBoId = req.session.user.can_bo_quan_ly_id;
        const vipId = parseInt(vipIdResolver(req), 10);
        if (!canBoId || !Number.isInteger(vipId)) {
            return res.status(403).json({ error: 'VIP chưa được phân công cho tài khoản này' });
        }

        try {
            const result = await pool.query(`
                SELECT 1
                FROM vip
                WHERE id = $1 AND can_bo_quan_ly_id = $2
            `, [vipId, canBoId]);

            if (result.rowCount > 0) return next();
            return res.status(403).json({ error: 'Bạn không có quyền truy cập VIP này' });
        } catch (err) {
            next(err);
        }
    };
}

app.get('/', async (req, res) => {
    try {
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentDay = today.getDate();
        const isCanBo = req.session.user.role === 'can_bo';
        const assignedCanBoId = req.session.user.can_bo_quan_ly_id || -1;
        const requestedKhPage = parseInt(req.query.khPage, 10) || 1;
        const requestedVipPage = parseInt(req.query.vipPage, 10) || 1;
        const requestedLimit = parseInt(req.query.limit, 10) || 20;
        const limit = requestedLimit === 50 ? 50 : 20;

        const [khachHangCountResult, vipCountResult] = await Promise.all([
            pool.query(isCanBo ? `
                SELECT COUNT(*)::int AS total
                FROM khach_hang kh
                WHERE EXTRACT(MONTH FROM kh.ngay_thanh_lap) = $1
                  AND EXISTS (
                      SELECT 1 FROM vip v
                      WHERE v.khach_hang_id = kh.id
                        AND v.can_bo_quan_ly_id = $2
                  )
            ` : `
                SELECT COUNT(*)::int AS total
                FROM khach_hang
                WHERE EXTRACT(MONTH FROM ngay_thanh_lap) = $1
            `, isCanBo ? [currentMonth, assignedCanBoId] : [currentMonth]),
            pool.query(isCanBo ? `
                SELECT COUNT(*)::int AS total
                FROM vip
                WHERE EXTRACT(MONTH FROM ngay_sinh) = $1
                  AND can_bo_quan_ly_id = $2
            ` : `
                SELECT COUNT(*)::int AS total
                FROM vip
                WHERE EXTRACT(MONTH FROM ngay_sinh) = $1
            `, isCanBo ? [currentMonth, assignedCanBoId] : [currentMonth])
        ]);

        const totalKhachHang = khachHangCountResult.rows[0].total;
        const totalVip = vipCountResult.rows[0].total;
        const totalKhPages = Math.max(1, Math.ceil(totalKhachHang / limit));
        const totalVipPages = Math.max(1, Math.ceil(totalVip / limit));
        const khPage = Math.min(Math.max(requestedKhPage, 1), totalKhPages);
        const vipPage = Math.min(Math.max(requestedVipPage, 1), totalVipPages);
        const khOffset = (khPage - 1) * limit;
        const vipOffset = (vipPage - 1) * limit;

        // Doanh nghiệp kỷ niệm thành lập trong tháng
        const khachHangResult = await pool.query(isCanBo ? `
            SELECT kh.*,
                (EXTRACT(DAY FROM kh.ngay_thanh_lap) = $2) AS la_hom_nay
            FROM khach_hang kh
            WHERE EXTRACT(MONTH FROM kh.ngay_thanh_lap) = $1
              AND EXISTS (
                  SELECT 1 FROM vip v
                  WHERE v.khach_hang_id = kh.id
                    AND v.can_bo_quan_ly_id = $3
              )
            ORDER BY la_hom_nay DESC, EXTRACT(DAY FROM kh.ngay_thanh_lap) ASC
            LIMIT $4 OFFSET $5
        ` : `
            SELECT *,
                (EXTRACT(DAY FROM ngay_thanh_lap) = $2) AS la_hom_nay
            FROM khach_hang
            WHERE EXTRACT(MONTH FROM ngay_thanh_lap) = $1
            ORDER BY la_hom_nay DESC, EXTRACT(DAY FROM ngay_thanh_lap) ASC
            LIMIT $3 OFFSET $4
        `, isCanBo
            ? [currentMonth, currentDay, assignedCanBoId, limit, khOffset]
            : [currentMonth, currentDay, limit, khOffset]);

        // VIP sinh nhật trong tháng
        const vipResult = await pool.query(isCanBo ? `
            SELECT v.*, cv.ten_chuc_vu AS chuc_vu, kh.ten_khach_hang,
                (EXTRACT(DAY FROM v.ngay_sinh) = $2) AS la_hom_nay
            FROM vip v
            LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
            LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
            WHERE EXTRACT(MONTH FROM v.ngay_sinh) = $1
              AND v.can_bo_quan_ly_id = $3
            ORDER BY la_hom_nay DESC, EXTRACT(DAY FROM v.ngay_sinh) ASC
            LIMIT $4 OFFSET $5
        ` : `
            SELECT v.*, cv.ten_chuc_vu AS chuc_vu, kh.ten_khach_hang,
                (EXTRACT(DAY FROM v.ngay_sinh) = $2) AS la_hom_nay
            FROM vip v
            LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
            LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
            WHERE EXTRACT(MONTH FROM v.ngay_sinh) = $1
            ORDER BY la_hom_nay DESC, EXTRACT(DAY FROM v.ngay_sinh) ASC
            LIMIT $3 OFFSET $4
        `, isCanBo
            ? [currentMonth, currentDay, assignedCanBoId, limit, vipOffset]
            : [currentMonth, currentDay, limit, vipOffset]);

        // Biểu đồ: sinh nhật VIP theo 12 tháng
        const birthdayResult = await pool.query(isCanBo ? `
            SELECT EXTRACT(MONTH FROM ngay_sinh) AS thang, COUNT(*) AS so_luong
            FROM vip
            WHERE ngay_sinh IS NOT NULL
              AND can_bo_quan_ly_id = $1
            GROUP BY EXTRACT(MONTH FROM ngay_sinh)
        ` : `
            SELECT EXTRACT(MONTH FROM ngay_sinh) AS thang, COUNT(*) AS so_luong
            FROM vip
            WHERE ngay_sinh IS NOT NULL
            GROUP BY EXTRACT(MONTH FROM ngay_sinh)
        `, isCanBo ? [assignedCanBoId] : []);

        const dataThangSinh = Array(12).fill(0);
        birthdayResult.rows.forEach(row => {
            const m = parseInt(row.thang);
            if (m >= 1 && m <= 12) dataThangSinh[m - 1] = parseInt(row.so_luong);
        });

        // Biểu đồ: phân bố chức vụ VIP
        const chucVuResult = await pool.query(isCanBo ? `
            SELECT cv.ten_chuc_vu AS nhan_dan, COUNT(v.id) AS so_luong
            FROM vip v
            LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
            WHERE v.can_bo_quan_ly_id = $1
            GROUP BY cv.ten_chuc_vu, v.chuc_vu_id
            ORDER BY v.chuc_vu_id ASC
        ` : `
            SELECT cv.ten_chuc_vu AS nhan_dan, COUNT(v.id) AS so_luong
            FROM vip v
            LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
            GROUP BY cv.ten_chuc_vu, v.chuc_vu_id
            ORDER BY v.chuc_vu_id ASC
        `, isCanBo ? [assignedCanBoId] : []);

        res.render('index', {
            thang: currentMonth,
            danhSachKhachHang: khachHangResult.rows,
            danhSachVip: vipResult.rows,
            dataThangSinh: dataThangSinh,
            dataChucVu: chucVuResult.rows,
            khPage,
            vipPage,
            limit,
            totalKhPages,
            totalVipPages,
            totalKhachHang,
            totalVip
        });

    } catch (err) {
        console.error('Lỗi dashboard:', err);
        res.status(500).send('Lỗi máy chủ: ' + err.message);
    }
});


// ==================== 2. QUẢN LÝ KHÁCH HÀNG & VIP ====================
app.get('/khach-hang', async (req, res) => {
    try {
        const requestedPage = parseInt(req.query.page, 10) || 1;
        const requestedLimit = parseInt(req.query.limit, 10) || 20;
        const limit = requestedLimit === 50 ? 50 : 20;
        const keyword = String(req.query.keyword || '').trim();
        const chucVu = String(req.query.chucVu || 'all');
        const isCanBo = req.session.user.role === 'can_bo';
        const assignedCanBoId = req.session.user.can_bo_quan_ly_id;

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
        if (isCanBo) {
            if (assignedCanBoId) {
                filterParams.push(assignedCanBoId);
                whereParts.push(`v.can_bo_quan_ly_id = $${filterParams.length}`);
            } else {
                whereParts.push('FALSE');
            }
        }
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
        const scopedKhachHangSql = isCanBo ? `
            SELECT DISTINCT kh.id, kh.ten_khach_hang, kh.ngay_thanh_lap, kh.ma_kh
            FROM khach_hang kh
            JOIN vip v ON v.khach_hang_id = kh.id
            WHERE v.can_bo_quan_ly_id = $1
            ORDER BY kh.id DESC
            LIMIT $2 OFFSET $3
        ` : 'SELECT id, ten_khach_hang, ngay_thanh_lap, ma_kh FROM khach_hang ORDER BY id DESC LIMIT $1 OFFSET $2';
        const scopedKhachHangParams = isCanBo
            ? [assignedCanBoId || -1, limit, offset]
            : [limit, offset];
        const scopedOptionsSql = isCanBo ? `
            SELECT DISTINCT kh.id, kh.ten_khach_hang
            FROM khach_hang kh
            JOIN vip v ON v.khach_hang_id = kh.id
            WHERE v.can_bo_quan_ly_id = $1
            ORDER BY kh.ten_khach_hang ASC
        ` : 'SELECT id, ten_khach_hang FROM khach_hang ORDER BY ten_khach_hang ASC';
        const scopedCountKhSql = isCanBo ? `
            SELECT COUNT(DISTINCT kh.id)::int AS total
            FROM khach_hang kh
            JOIN vip v ON v.khach_hang_id = kh.id
            WHERE v.can_bo_quan_ly_id = $1
        ` : 'SELECT COUNT(*)::int AS total FROM khach_hang';
        const scopedCountVipSql = isCanBo
            ? 'SELECT COUNT(*)::int AS total FROM vip WHERE can_bo_quan_ly_id = $1'
            : 'SELECT COUNT(*)::int AS total FROM vip';
        const [
            khachHangResult,
            khachHangOptionsResult,
            tongKhachHangResult,
            tongVipResult,
            suKienKhachHangResult,
            suKienVipResult
        ] = await Promise.all([
            pool.query(scopedKhachHangSql, scopedKhachHangParams),
            pool.query(scopedOptionsSql, isCanBo ? [assignedCanBoId || -1] : []),
            pool.query(scopedCountKhSql, isCanBo ? [assignedCanBoId || -1] : []),
            pool.query(scopedCountVipSql, isCanBo ? [assignedCanBoId || -1] : []),
            pool.query(isCanBo ? `
                SELECT DISTINCT kh.id, kh.ten_khach_hang, kh.ngay_thanh_lap
                FROM khach_hang kh
                JOIN vip v ON v.khach_hang_id = kh.id
                WHERE kh.ngay_thanh_lap IS NOT NULL
                  AND v.can_bo_quan_ly_id = $1
            ` : `
                SELECT id, ten_khach_hang, ngay_thanh_lap
                FROM khach_hang
                WHERE ngay_thanh_lap IS NOT NULL
            `, isCanBo ? [assignedCanBoId || -1] : []),
            pool.query(isCanBo ? `
                SELECT v.id, v.ho_ten, v.ngay_sinh, kh.ten_khach_hang
                FROM vip v
                LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
                WHERE v.ngay_sinh IS NOT NULL
                  AND v.can_bo_quan_ly_id = $1
            ` : `
                SELECT v.id, v.ho_ten, v.ngay_sinh, kh.ten_khach_hang
                FROM vip v
                LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
                WHERE v.ngay_sinh IS NOT NULL
            `, isCanBo ? [assignedCanBoId || -1] : [])
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

        let lichSuRows = [];
        if (vipIds.length > 0) {
            const lichSuResult = await pool.query(`
                SELECT ls.*, v.ho_ten AS ten_vip, cv.ten_chuc_vu AS chuc_vu, kh.ten_khach_hang
                FROM lich_su_cham_soc ls
                LEFT JOIN vip v ON ls.vip_id = v.id
                LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
                LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
                WHERE ls.vip_id = ANY($1::int[])
                ORDER BY ls.ngay_lien_he DESC, ls.created_at DESC
            `, [vipIds]);
            lichSuRows = lichSuResult.rows;
        }

        const tongKH = tongKhachHangResult.rows[0].total;
        const tongVip = tongVipResult.rows[0].total;

        res.render('khach-hang', {
            listKhachHang: khachHangOptionsResult.rows,
            listKhachHangPage: khachHangResult.rows,
            listVip: vipResult.rows,
            listChucVu: chucVuResult.rows,
            thongKe: { tongKH, tongVip },
            listLichSu: lichSuRows,
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

// Thêm mới: 1 khách hàng + nhiều VIP cùng lúc
app.post('/khach-hang/add-all', requireRole('admin'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { ten_khach_hang, ngay_thanh_lap } = req.body;
        const khResult = await client.query(
            'INSERT INTO khach_hang (ten_khach_hang, ngay_thanh_lap) VALUES ($1, $2) RETURNING id',
            [ten_khach_hang, ngay_thanh_lap || null]
        );
        const newKhachHangId = khResult.rows[0].id;

        // Hỗ trợ nhiều VIP: ho_ten có thể là mảng hoặc string
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

// Cập nhật khách hàng
app.post('/khach-hang/update', requireRole('admin'), async (req, res) => {
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

// Xóa khách hàng (cascade xóa VIP liên quan)
app.get('/khach-hang/delete/:id', requireRole('admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM vip WHERE khach_hang_id = $1', [req.params.id]);
        await pool.query('DELETE FROM khach_hang WHERE id = $1', [req.params.id]);
        res.redirect('/khach-hang?toast=Đã%20xóa%20doanh%20nghiệp%20thành%20công!&type=warning');
    } catch (err) {
        console.error('Lỗi xóa KH:', err);
        res.status(500).send('Lỗi xóa: ' + err.message);
    }
});

// Cập nhật VIP
app.post('/khach-hang/vip/update', requireRole('admin'), async (req, res) => {
    const { id, ho_ten, khach_hang_id, chuc_vu_id, ngay_sinh, so_dien_thoai, ghi_chu } = req.body;
    try {
        await pool.query(
            'UPDATE vip SET ho_ten = $1, khach_hang_id = $2, chuc_vu_id = $3, ngay_sinh = $4, so_dien_thoai = $5, ghi_chu = $6 WHERE id = $7',
            [ho_ten, khach_hang_id, chuc_vu_id, ngay_sinh || null, so_dien_thoai, ghi_chu || null, id]
        );
        res.redirect('/khach-hang?toast=Đã%20cập%20nhật%20VIP%20thành%20công!&type=success');
    } catch (err) {
        console.error('Lỗi cập nhật VIP:', err);
        res.status(500).send('Lỗi cập nhật VIP: ' + err.message);
    }
});

// Xóa VIP
app.get('/khach-hang/vip/delete/:id', requireRole('admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM vip WHERE id = $1', [req.params.id]);
        res.redirect('/khach-hang?toast=Đã%20xóa%20VIP%20thành%20công!&type=warning');
    } catch (err) {
        console.error('Lỗi xóa VIP:', err);
        res.status(500).send('Lỗi xóa VIP: ' + err.message);
    }
});

// NOTE: /export-excel route removed per UI simplification request.

app.post('/lich-su/add',
    requireRole('admin', 'can_bo'),
    requireAssignedVip(req => req.body.vip_id),
    async (req, res) => {
    const { vip_id, ngay_lien_he, noi_dung, qua_tang, nguoi_phu_trach } = req.body;
    try {
        await pool.query(
            `INSERT INTO lich_su_cham_soc (vip_id, ngay_lien_he, noi_dung, qua_tang, nguoi_phu_trach)
             VALUES ($1, $2, $3, $4, $5)`,
            [vip_id, ngay_lien_he, noi_dung, qua_tang || null, nguoi_phu_trach]
        );
        res.redirect('/khach-hang?toast=Đã%20thêm%20lịch%20sử%20chăm%20sóc!&type=success');
    } catch (err) {
        console.error('Lỗi thêm lịch sử:', err);
        res.status(500).send('Lỗi: ' + err.message);
    }
});

app.post('/lich-su/update',
    requireRole('admin', 'can_bo'),
    requireAssignedVip(req => req.body.vip_id),
    async (req, res) => {
    const { id, vip_id, ngay_lien_he, noi_dung, qua_tang, nguoi_phu_trach } = req.body;
    try {
        await pool.query(
            `UPDATE lich_su_cham_soc
             SET vip_id=$1, ngay_lien_he=$2, noi_dung=$3, qua_tang=$4, nguoi_phu_trach=$5
             WHERE id=$6`,
            [vip_id, ngay_lien_he, noi_dung, qua_tang || null, nguoi_phu_trach, id]
        );
        res.redirect('/khach-hang?toast=Đã%20cập%20nhật%20lịch%20sử%20thành%20công!&type=success');
    } catch (err) {
        console.error('Lỗi cập nhật lịch sử:', err);
        res.status(500).send('Lỗi: ' + err.message);
    }
});

app.get('/lich-su/delete/:id', requireRole('admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM lich_su_cham_soc WHERE id = $1', [req.params.id]);
        res.redirect('/khach-hang?toast=Đã%20xóa%20lịch%20sử%20thành%20công!&type=warning');
    } catch (err) {
        console.error('Lỗi xóa lịch sử:', err);
        res.status(500).send('Lỗi: ' + err.message);
    }
});

// API: Lấy thông tin VIP chi tiết + lịch sử chăm sóc
app.get('/api/vip/:id',
    requireAssignedVip(req => req.params.id),
    async (req, res) => {
    try {
        // Lấy thông tin VIP + công ty + chức vụ
        const vipResult = await pool.query(`
            SELECT v.id, v.ho_ten, NULL::text AS email, v.ngay_sinh, v.ghi_chu, v.so_dien_thoai, v.khach_hang_id, v.chuc_vu_id,
                   cv.ten_chuc_vu AS chuc_vu,
                   kh.id AS kh_id, kh.ten_khach_hang, kh.ngay_thanh_lap
            FROM vip v
            LEFT JOIN chuc_vu cv ON v.chuc_vu_id = cv.id
            LEFT JOIN khach_hang kh ON v.khach_hang_id = kh.id
            WHERE v.id = $1
        `, [req.params.id]);
 
        if (vipResult.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy VIP' });
        }

        // Lấy lịch sử chăm sóc
        const lichSuResult = await pool.query(`
            SELECT id, ngay_lien_he, noi_dung, qua_tang, nguoi_phu_trach, created_at
            FROM lich_su_cham_soc
            WHERE vip_id = $1
            ORDER BY ngay_lien_he DESC, created_at DESC
        `, [req.params.id]);

        res.json({
            vip: vipResult.rows[0],
            lichSu: lichSuResult.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
 

// Xem danh sách
async function renderCanBoQuanLy(req, res) {
    try {
        const requestedPage = parseInt(req.query.page, 10) || 1;
        const requestedLimit = parseInt(req.query.limit, 10) || 20;
        const limit = requestedLimit === 50 ? 50 : 20;
        const routeCanBoId = req.params.id ? parseInt(req.params.id, 10) : null;
        const queryCanBoId = req.query.canBo ? parseInt(req.query.canBo, 10) : null;
        let canBoId = Number.isInteger(routeCanBoId)
            ? routeCanBoId
            : (Number.isInteger(queryCanBoId) ? queryCanBoId : null);
        const isCanBo = req.session.user.role === 'can_bo';
        if (isCanBo) {
            canBoId = req.session.user.can_bo_quan_ly_id || -1;
        }
        const status = ['binh-thuong', 'can-cham-soc', 'qua-han'].includes(req.query.status)
            ? req.query.status
            : 'all';
        const monthValue = /^\d{4}-\d{2}$/.test(String(req.query.month || ''))
            ? String(req.query.month)
            : new Date().toISOString().slice(0, 7);
        const monthStart = `${monthValue}-01`;

        const canBoResult = await pool.query(`
            SELECT id, ho_ten, phong_ban, so_dien_thoai, email
            FROM can_bo_quan_ly
            ${isCanBo ? 'WHERE id = $1' : ''}
            ORDER BY ho_ten ASC
        `, isCanBo ? [canBoId] : []);

        if (canBoId !== -1 && canBoId && !canBoResult.rows.some(canBo => canBo.id === canBoId)) {
            return res.status(404).send('Không tìm thấy cán bộ quản lý');
        }

        const officerCondition = canBoId ? 'v.can_bo_quan_ly_id = $1' : 'TRUE';
        const officerParams = canBoId ? [canBoId] : [];
        const historyOfficerCondition = canBoId
            ? 'COALESCE(ls.can_bo_quan_ly_id, v.can_bo_quan_ly_id) = $2'
            : 'TRUE';
        const summaryParams = canBoId ? [monthStart, canBoId] : [monthStart];

        const summaryResult = await pool.query(`
            SELECT
                COUNT(DISTINCT v.khach_hang_id)::int AS total_doanh_nghiep,
                COUNT(DISTINCT v.id)::int AS total_vip,
                COUNT(DISTINCT v.id) FILTER (
                    WHERE latest.ngay_cham_soc_gan_nhat = CURRENT_DATE - INTERVAL '30 days'
                )::int AS can_cham_soc_hom_nay,
                COUNT(DISTINCT v.id) FILTER (
                    WHERE latest.ngay_cham_soc_gan_nhat IS NOT NULL
                      AND CURRENT_DATE - latest.ngay_cham_soc_gan_nhat > 90
                )::int AS qua_han
            FROM vip v
            LEFT JOIN (
                SELECT vip_id, MAX(ngay_lien_he) AS ngay_cham_soc_gan_nhat
                FROM lich_su_cham_soc
                GROUP BY vip_id
            ) latest ON latest.vip_id = v.id
            WHERE ${officerCondition}
        `, officerParams);

        const careCountResult = await pool.query(`
            SELECT COUNT(ls.id)::int AS total
            FROM lich_su_cham_soc ls
            JOIN vip v ON v.id = ls.vip_id
            WHERE ls.ngay_lien_he >= $1::date
              AND ls.ngay_lien_he < ($1::date + INTERVAL '1 month')
              AND ${historyOfficerCondition}
        `, summaryParams);

        const birthdayResult = await pool.query(`
            SELECT
                v.id,
                v.ho_ten,
                v.ngay_sinh,
                kh.ten_khach_hang,
                CASE
                    WHEN MAKE_DATE(
                        EXTRACT(YEAR FROM CURRENT_DATE)::int,
                        EXTRACT(MONTH FROM v.ngay_sinh)::int,
                        EXTRACT(DAY FROM v.ngay_sinh)::int
                    ) >= CURRENT_DATE
                    THEN MAKE_DATE(
                        EXTRACT(YEAR FROM CURRENT_DATE)::int,
                        EXTRACT(MONTH FROM v.ngay_sinh)::int,
                        EXTRACT(DAY FROM v.ngay_sinh)::int
                    )
                    ELSE MAKE_DATE(
                        EXTRACT(YEAR FROM CURRENT_DATE)::int + 1,
                        EXTRACT(MONTH FROM v.ngay_sinh)::int,
                        EXTRACT(DAY FROM v.ngay_sinh)::int
                    )
                END AS sinh_nhat_sap_toi
            FROM vip v
            LEFT JOIN khach_hang kh ON kh.id = v.khach_hang_id
            WHERE v.ngay_sinh IS NOT NULL
              AND ${officerCondition}
            ORDER BY sinh_nhat_sap_toi ASC, v.ho_ten ASC
        `, officerParams);
        const birthdays = birthdayResult.rows.filter(row => {
            const birthday = new Date(row.sinh_nhat_sap_toi);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return Math.round((birthday - today) / 86400000) <= 7;
        });

        const statusExpression = `
            CASE
                WHEN latest.ngay_cham_soc_gan_nhat IS NULL THEN 'can-cham-soc'
                WHEN CURRENT_DATE - latest.ngay_cham_soc_gan_nhat <= 30 THEN 'binh-thuong'
                WHEN CURRENT_DATE - latest.ngay_cham_soc_gan_nhat <= 90 THEN 'can-cham-soc'
                ELSE 'qua-han'
            END
        `;
        const statusCondition = status === 'all'
            ? 'TRUE'
            : `${statusExpression} = $${officerParams.length + 1}`;
        const workParams = status === 'all'
            ? [...officerParams]
            : [...officerParams, status];

        const workCountResult = await pool.query(`
            SELECT COUNT(*)::int AS total
            FROM vip v
            LEFT JOIN (
                SELECT vip_id, MAX(ngay_lien_he) AS ngay_cham_soc_gan_nhat
                FROM lich_su_cham_soc
                GROUP BY vip_id
            ) latest ON latest.vip_id = v.id
            WHERE ${officerCondition}
              AND ${statusCondition}
        `, workParams);

        const totalRows = workCountResult.rows[0].total;
        const totalPages = Math.max(1, Math.ceil(totalRows / limit));
        const page = Math.min(Math.max(requestedPage, 1), totalPages);
        const offset = (page - 1) * limit;
        const dataParams = [...workParams, limit, offset];

        const workResult = await pool.query(`
            SELECT
                v.id,
                v.ho_ten,
                kh.ten_khach_hang,
                cb.ho_ten AS can_bo_quan_ly,
                latest.ngay_cham_soc_gan_nhat,
                CASE
                    WHEN latest.ngay_cham_soc_gan_nhat IS NULL THEN NULL
                    ELSE CURRENT_DATE - latest.ngay_cham_soc_gan_nhat
                END AS so_ngay_chua_cham_soc,
                ${statusExpression} AS trang_thai
            FROM vip v
            LEFT JOIN khach_hang kh ON kh.id = v.khach_hang_id
            LEFT JOIN can_bo_quan_ly cb ON cb.id = v.can_bo_quan_ly_id
            LEFT JOIN (
                SELECT vip_id, MAX(ngay_lien_he) AS ngay_cham_soc_gan_nhat
                FROM lich_su_cham_soc
                GROUP BY vip_id
            ) latest ON latest.vip_id = v.id
            WHERE ${officerCondition}
              AND ${statusCondition}
            ORDER BY
                CASE ${statusExpression}
                    WHEN 'qua-han' THEN 1
                    WHEN 'can-cham-soc' THEN 2
                    ELSE 3
                END,
                latest.ngay_cham_soc_gan_nhat ASC NULLS FIRST,
                v.id DESC
            LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
        `, dataParams);

        const selectedCanBo = canBoId
            ? canBoResult.rows.find(canBo => canBo.id === canBoId)
            : null;
        const summary = summaryResult.rows[0];

        res.render('cbql', {
            listCanBo: canBoResult.rows,
            selectedCanBo,
            canBoId,
            month: monthValue,
            status,
            summary: {
                totalDoanhNghiep: summary.total_doanh_nghiep,
                totalVip: summary.total_vip,
                chamSocTrongThang: careCountResult.rows[0].total,
                canChamSocHomNay: summary.can_cham_soc_hom_nay,
                quaHan: summary.qua_han,
                sinhNhatSapToi: birthdays.length
            },
            birthdays,
            workItems: workResult.rows,
            page,
            limit,
            totalPages,
            totalRows
        });
    } catch (err) {
        console.error('Lỗi nhật ký cán bộ quản lý:', err);
        res.status(500).send('Lỗi tải nhật ký cán bộ quản lý: ' + err.message);
    }
}

app.get('/cbql', renderCanBoQuanLy);
app.get('/cbql/:id', renderCanBoQuanLy);

// ==================== QUAN LY TAI KHOAN ====================
app.get('/users', requireRole('admin'), async (req, res) => {
    try {
        const [usersResult, canBoResult] = await Promise.all([
            pool.query(`
                SELECT
                    u.id,
                    u.username,
                    u.full_name,
                    u.role,
                    u.can_bo_quan_ly_id,
                    u.created_at,
                    cb.ho_ten AS can_bo_quan_ly
                FROM users u
                LEFT JOIN can_bo_quan_ly cb ON cb.id = u.can_bo_quan_ly_id
                ORDER BY u.created_at DESC, u.id DESC
            `),
            pool.query(`
                SELECT id, ho_ten, phong_ban
                FROM can_bo_quan_ly
                ORDER BY ho_ten ASC
            `)
        ]);

        res.render('users', {
            users: usersResult.rows,
            listCanBo: canBoResult.rows,
            message: req.query.message || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error('Loi tai trang quan ly tai khoan:', err);
        res.status(500).send('Loi tai trang quan ly tai khoan: ' + err.message);
    }
});

app.post('/users', requireRole('admin'), async (req, res) => {
    const client = await pool.connect();
    try {
        const username = String(req.body.username || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const fullName = String(req.body.full_name || '').trim() || null;
        const role = String(req.body.role || '');
        let canBoQuanLyId = req.body.can_bo_quan_ly_id
            ? parseInt(req.body.can_bo_quan_ly_id, 10)
            : null;

        if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
            return res.redirect('/users?error=Ten dang nhap khong hop le');
        }
        if (password.length < 8) {
            return res.redirect('/users?error=Mat khau phai co it nhat 8 ky tu');
        }
        if (!['admin', 'truong_phong', 'can_bo'].includes(role)) {
            return res.redirect('/users?error=Vai tro khong hop le');
        }
        if (role === 'can_bo' && !Number.isInteger(canBoQuanLyId) && !fullName) {
            return res.redirect('/users?error=Tai khoan can bo can co ho ten hoac ho so can bo');
        }

        const passwordHash = await bcrypt.hash(password, 12);
        await client.query('BEGIN');

        if (role === 'can_bo' && !Number.isInteger(canBoQuanLyId)) {
            const canBoResult = await client.query(`
                INSERT INTO can_bo_quan_ly (ho_ten, phong_ban, so_dien_thoai, email)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [
                fullName,
                String(req.body.phong_ban || '').trim() || null,
                String(req.body.so_dien_thoai || '').trim() || null,
                String(req.body.email || '').trim() || null
            ]);
            canBoQuanLyId = canBoResult.rows[0].id;
        }

        await client.query(`
            INSERT INTO users (username, password_hash, full_name, role, can_bo_quan_ly_id)
            VALUES ($1, $2, $3, $4, $5)
        `, [username, passwordHash, fullName, role, role === 'can_bo' ? canBoQuanLyId : null]);

        await client.query('COMMIT');
        res.redirect('/users?message=Da tao tai khoan');
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.redirect('/users?error=Ten dang nhap hoac can bo da duoc su dung');
        }
        console.error('Loi tao tai khoan:', err);
        res.redirect('/users?error=Khong the tao tai khoan');
    } finally {
        client.release();
    }
});

app.post('/users/:id/password', requireRole('admin'), async (req, res) => {
    try {
        const password = String(req.body.password || '');
        if (password.length < 8) {
            return res.redirect('/users?error=Mat khau phai co it nhat 8 ky tu');
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [passwordHash, req.params.id]
        );
        if (result.rowCount === 0) {
            return res.redirect('/users?error=Khong tim thay tai khoan');
        }
        res.redirect('/users?message=Da cap nhat mat khau');
    } catch (err) {
        console.error('Loi cap nhat mat khau:', err);
        res.redirect('/users?error=Khong the cap nhat mat khau');
    }
});

app.post('/users/:id/delete', requireRole('admin'), async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (userId === req.session.user.id) {
        return res.redirect('/users?error=Khong the xoa tai khoan dang dang nhap');
    }

    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        if (result.rowCount === 0) {
            return res.redirect('/users?error=Khong tim thay tai khoan');
        }
        res.redirect('/users?message=Da xoa tai khoan');
    } catch (err) {
        console.error('Loi xoa tai khoan:', err);
        res.redirect('/users?error=Khong the xoa tai khoan');
    }
});

app.get('/chuc-vu', requireRole('admin', 'truong_phong'), async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM chuc_vu ORDER BY id ASC');
        res.render('chuc-vu', {
            listChucVu: result.rows,
            thongBao: req.query.msg || null
        });
    } catch (err) {
        console.error('Lỗi trang chức vụ:', err);
        res.status(500).send('Lỗi: ' + err.message);
    }
});

// Thêm mới
app.post('/chuc-vu/add', requireRole('admin'), async (req, res) => {
    const { ten_chuc_vu } = req.body;
    try {
        await pool.query(
            'INSERT INTO chuc_vu (ten_chuc_vu) VALUES ($1)',
            [ten_chuc_vu.trim()]
        );
        res.redirect('/chuc-vu?msg=Đã thêm chức vụ mới thành công!');
    } catch (err) {
        console.error('Lỗi thêm chức vụ:', err);
        res.status(500).send('Lỗi: ' + err.message);
    }
});

// Cập nhật
app.post('/chuc-vu/update', requireRole('admin'), async (req, res) => {
    const { id, ten_chuc_vu } = req.body;
    try {
        await pool.query(
            'UPDATE chuc_vu SET ten_chuc_vu = $1 WHERE id = $2',
            [ten_chuc_vu.trim(), id]
        );
        res.redirect('/chuc-vu?msg=Đã cập nhật chức vụ thành công!');
    } catch (err) {
        console.error('Lỗi cập nhật chức vụ:', err);
        res.status(500).send('Lỗi: ' + err.message);
    }
});

// Xóa
app.get('/chuc-vu/delete/:id', requireRole('admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM chuc_vu WHERE id = $1', [req.params.id]);
        res.redirect('/chuc-vu?msg=Đã xóa chức vụ thành công!');
    } catch (err) {
        console.error('Lỗi xóa chức vụ:', err);
        res.status(500).send('Lỗi: ' + err.message);
    }
});

// ==================== IMPORT EXCEL ====================
const multer = require('multer');
const upload = multer({ 
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file Excel (.xlsx, .xls)'));
        }
    }
});
 
function parseExcelDate(val) {
    if (!val) return null;
    if (typeof val === 'number') {
        const date = new Date((val - 25569) * 86400 * 1000);
        return date.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        }
    }
    if (str.match(/^\d{4}-\d{2}-\d{2}/)) return str.substring(0,10);
    return null;
}
 
app.post('/import-excel', requireRole('admin'), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Vui lòng chọn file Excel!' });
 
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    const results = { them_moi: 0, cap_nhat: 0, loi: 0, chi_tiet: [] };
    const client = await pool.connect();
 
    try {
        await client.query('BEGIN');
 
        // Đọc header
        const headerRow = sheet.getRow(1);
        const headers = {};
        headerRow.eachCell((cell, col) => {
            headers[String(cell.value || '').trim().toLowerCase()] = col;
        });
 
        function getCellByKey(row, ...keys) {
            for (const key of keys) {
                for (const [h, col] of Object.entries(headers)) {
                    if (h.includes(key)) {
                        const v = row.getCell(col).value;
                        return v != null ? String(v).trim() : null;
                    }
                }
            }
            return null;
        }
 
        function getDateByKey(row, ...keys) {
            for (const key of keys) {
                for (const [h, col] of Object.entries(headers)) {
                    if (h.includes(key)) {
                        return parseExcelDate(row.getCell(col).value);
                    }
                }
            }
            return null;
        }
 
        // Lấy chức vụ từ DB
        const cvRes = await client.query('SELECT id, ten_chuc_vu FROM chuc_vu');
        const cvMap = {};
        cvRes.rows.forEach(cv => { cvMap[cv.ten_chuc_vu.toLowerCase().trim()] = cv.id; });
 
        function findCV(ten) {
            if (!ten) return null;
            const l = ten.toLowerCase().trim();
            if (cvMap[l]) return cvMap[l];
            for (const [name, id] of Object.entries(cvMap)) {
                if (l.includes(name) || name.includes(l)) return id;
            }
            return null;
        }
 
        for (let r = 2; r <= sheet.rowCount; r++) {
            const row = sheet.getRow(r);
            const maKH = getCellByKey(row, 'mã kh', 'ma kh', 'makh');
            if (!maKH) continue;
 
            const tenKH       = getCellByKey(row, 'tên kh', 'ten kh', 'tên khách', 'tenkh');
            const ngayTL      = getDateByKey(row, 'thành lập', 'thanh lap', 'ngày tl');
            const tenLD       = getCellByKey(row, 'tên lãnh đạo', 'ten lanh dao', 'lãnh đạo');
            const ngaySinhLD  = getDateByKey(row, 'sinh lãnh', 'sinh lanh');
            const sdtLD       = getCellByKey(row, 'điện thoại lãnh', 'thoai lanh', 'sdt lanh');
            const tenKT       = getCellByKey(row, 'tên kế toán', 'ten ke toan', 'kế toán');
            const ngaySinhKT  = getDateByKey(row, 'sinh kế', 'sinh ke');
            const sdtKT       = getCellByKey(row, 'điện thoại kế', 'thoai ke', 'sdt ke');
            const tenCBQL     = getCellByKey(row, 'cán bộ', 'can bo', 'cbql', 'quản lý');
            const ngaySinhCBQL = getDateByKey(row, 'sinh cán', 'sinh can', 'sinh quản');
            const sdtCBQL     = getCellByKey(row, 'điện thoại cán', 'thoai can', 'sdt can', 'sdt cbql');
 
            try {
                const existKH = await client.query('SELECT id FROM khach_hang WHERE ma_kh=$1', [maKH]);
                let khId;
 
                if (existKH.rows.length > 0) {
                    khId = existKH.rows[0].id;
                    await client.query(
                        'UPDATE khach_hang SET ten_khach_hang=$1, ngay_thanh_lap=$2 WHERE id=$3',
                        [tenKH, ngayTL, khId]
                    );
                    await client.query('DELETE FROM vip WHERE khach_hang_id=$1', [khId]);
                    results.cap_nhat++;
                } else {
                    const ins = await client.query(
                        'INSERT INTO khach_hang (ma_kh, ten_khach_hang, ngay_thanh_lap) VALUES ($1,$2,$3) RETURNING id',
                        [maKH, tenKH, ngayTL]
                    );
                    khId = ins.rows[0].id;
                    results.them_moi++;
                }
 
                const vipList = [
                    { ten: tenLD,   ngay: ngaySinhLD,   sdt: sdtLD,   cvKey: ['lãnh đạo','giám đốc','hiệu trưởng'] },
                    { ten: tenKT,   ngay: ngaySinhKT,   sdt: sdtKT,   cvKey: ['kế toán','ke toan'] },
                    { ten: tenCBQL, ngay: ngaySinhCBQL, sdt: sdtCBQL, cvKey: ['quản lý','trưởng phòng','cán bộ'] },
                ];
 
                for (const vip of vipList) {
                    if (!vip.ten) continue;
                    let cvId = null;
                    for (const k of vip.cvKey) { cvId = findCV(k); if (cvId) break; }
                    await client.query(
                        'INSERT INTO vip (khach_hang_id, chuc_vu_id, ho_ten, ngay_sinh, so_dien_thoai) VALUES ($1,$2,$3,$4,$5)',
                        [khId, cvId, vip.ten, vip.ngay, vip.sdt]
                    );
                }
 
                results.chi_tiet.push({
                    dong: r, maKH, tenKH,
                    trang_thai: existKH.rows.length > 0 ? 'Cập nhật' : 'Thêm mới'
                });
            } catch (e) {
                results.loi++;
                results.chi_tiet.push({ dong: r, maKH, tenKH, trang_thai: 'Lỗi', loi: e.message });
            }
        }
 
        await client.query('COMMIT');
        res.json({ success: true, ...results });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 CRM đang chạy tại: http://localhost:${PORT}`);
});
