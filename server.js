const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const ExcelJS = require('exceljs');
const bcrypt = require('bcrypt');
const createDashboardRouter = require('./routes/dashboard');
const createKhachHangRouter = require('./routes/khachHang');
const createLichSuRouter = require('./routes/lichSu');
const createVipRouter = require('./routes/vip');

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

pool.connect()
    .then(() => console.log('✅ Kết nối PostgreSQL thành công!'))
    .catch(err => console.error('❌ Lỗi kết nối DB:', err));

app.use(createDashboardRouter({ pool }));

// ==================== 1. DASHBOARD ====================

app.use(createKhachHangRouter({ pool }));
app.use(createVipRouter({ pool }));
app.use(createLichSuRouter({ pool }));

// NOTE: /export-excel route removed per UI simplification request.

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
        const isCanBo = false;
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

// ==================== QUAN LY TAI KHOAN ====================
app.get('/users', async (req, res) => {
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

app.post('/users', async (req, res) => {
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

app.post('/users/:id/password', async (req, res) => {
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

app.post('/users/:id/delete', async (req, res) => {
    const userId = parseInt(req.params.id, 10);

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

app.use('/chuc-vu', (req, res) => {
    res.status(404).send('Trang quan ly chuc vu da duoc go bo');
});

app.get('/chuc-vu', async (req, res) => {
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
app.post('/chuc-vu/add', async (req, res) => {
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
app.post('/chuc-vu/update', async (req, res) => {
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
app.get('/chuc-vu/delete/:id', async (req, res) => {
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
 
app.post('/import-excel', upload.single('file'), async (req, res) => {
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

        function normalizeExcelText(value) {
            return String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .toLowerCase()
                .trim();
        }
 
        function getCellByKey(row, ...keys) {
            for (const key of keys) {
                for (const [h, col] of Object.entries(headers)) {
                    if (normalizeExcelText(h).includes(normalizeExcelText(key))) {
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
                    if (normalizeExcelText(h).includes(normalizeExcelText(key))) {
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

        async function findOrCreateCV(keys, fallbackName) {
            for (const key of keys) {
                const existingId = findCV(key);
                if (existingId) return existingId;
            }

            const existing = await client.query(
                'SELECT id FROM chuc_vu WHERE LOWER(TRIM(ten_chuc_vu)) = LOWER(TRIM($1)) LIMIT 1',
                [fallbackName]
            );
            if (existing.rows[0]) {
                const id = existing.rows[0].id;
                cvMap[fallbackName.toLowerCase().trim()] = id;
                return id;
            }

            const inserted = await client.query(
                'INSERT INTO chuc_vu (ten_chuc_vu) VALUES ($1) RETURNING id',
                [fallbackName]
            );
            const id = inserted.rows[0].id;
            cvMap[fallbackName.toLowerCase().trim()] = id;
            return id;
        }

        async function findOrCreateCanBo(hoTen, phongBan) {
            if (!hoTen) return null;

            const existing = await client.query(
                'SELECT id FROM can_bo_quan_ly WHERE LOWER(TRIM(ho_ten)) = LOWER(TRIM($1)) LIMIT 1',
                [hoTen]
            );
            if (existing.rows[0]) {
                await client.query(
                    `UPDATE can_bo_quan_ly
                     SET phong_ban = $1
                     WHERE id = $2
                       AND $1 IS NOT NULL
                       AND phong_ban IS DISTINCT FROM $1`,
                    [phongBan || null, existing.rows[0].id]
                );
                return existing.rows[0].id;
            }

            const inserted = await client.query(
                'INSERT INTO can_bo_quan_ly (ho_ten, phong_ban) VALUES ($1, $2) RETURNING id',
                [hoTen, phongBan || null]
            );
            return inserted.rows[0].id;
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
            const tenCBQL     = getCellByKey(row, 'can bo quan ly');
            const phongBan    = getCellByKey(row, 'phong nghiep vu');
 
            try {
                const canBoId = await findOrCreateCanBo(tenCBQL, phongBan);
                const existKH = await client.query('SELECT id FROM khach_hang WHERE ma_kh=$1', [maKH]);
                let khId;
 
                if (existKH.rows.length > 0) {
                    khId = existKH.rows[0].id;
                    await client.query(
                        'UPDATE khach_hang SET ten_khach_hang=$1, ngay_thanh_lap=$2, can_bo_id=$3 WHERE id=$4',
                        [tenKH, ngayTL, canBoId, khId]
                    );
                    await client.query('DELETE FROM vip WHERE khach_hang_id=$1', [khId]);
                    results.cap_nhat++;
                } else {
                    const ins = await client.query(
                        'INSERT INTO khach_hang (ma_kh, ten_khach_hang, ngay_thanh_lap, can_bo_id) VALUES ($1,$2,$3,$4) RETURNING id',
                        [maKH, tenKH, ngayTL, canBoId]
                    );
                    khId = ins.rows[0].id;
                    results.them_moi++;
                }
 
                const vipList = [
                    { ten: tenLD,   ngay: ngaySinhLD,   sdt: sdtLD,   cvKey: ['lãnh đạo','giám đốc','hiệu trưởng'] },
                    { ten: tenKT,   ngay: ngaySinhKT,   sdt: sdtKT,   cvKey: ['kế toán','ke toan'] },
                ];
 
                const fallbackRoles = ['Giám đốc', 'Kế toán'];
                for (const [vipIndex, vip] of vipList.entries()) {
                    if (!vip.ten) continue;
                    const cvId = await findOrCreateCV(vip.cvKey, fallbackRoles[vipIndex]);
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
