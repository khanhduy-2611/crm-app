const express = require('express');

module.exports = function createDashboardRouter({ pool }) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const scopedCanBoId = null;
        const now = new Date();
        const requestedKhPage = Math.max(Number.parseInt(req.query.khPage, 10) || 1, 1);
        const requestedVipPage = Math.max(Number.parseInt(req.query.vipPage, 10) || 1, 1);
        const windowSizeDays = 7;
        const khStartDay = (requestedKhPage - 1) * windowSizeDays;
        const vipStartDay = (requestedVipPage - 1) * windowSizeDays;
        const khEndDay = khStartDay + windowSizeDays - 1;
        const vipEndDay = vipStartDay + windowSizeDays - 1;

        const companyScope = scopedCanBoId === null
            ? ''
            : `AND EXISTS (
                SELECT 1
                FROM vip scoped_vip
                WHERE scoped_vip.khach_hang_id = kh.id
                  AND scoped_vip.can_bo_quan_ly_id = $1
            )`;
        const vipScope = scopedCanBoId === null
            ? ''
            : 'AND v.can_bo_quan_ly_id = $1';
        const countParams = scopedCanBoId === null ? [] : [scopedCanBoId];

        try {
            const [companyCountResult, vipCountResult, companyMaxResult, vipMaxResult] = await Promise.all([
                pool.query(`
                    WITH anniversary_candidates AS (
                        SELECT
                            kh.id,
                            CASE
                                WHEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                ) >= CURRENT_DATE
                                THEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                )
                                ELSE TO_DATE(
                                    (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                )
                            END AS next_anniversary
                        FROM khach_hang kh
                        WHERE kh.ngay_thanh_lap IS NOT NULL
                          ${companyScope}
                    )
                    SELECT COUNT(*)::int AS total
                    FROM (
                        SELECT (next_anniversary - CURRENT_DATE)::int AS days_left
                        FROM anniversary_candidates
                    ) events
                    WHERE days_left BETWEEN $${countParams.length + 1} AND $${countParams.length + 2}
                `, [...countParams, khStartDay, khEndDay]),
                pool.query(`
                    WITH birthday_candidates AS (
                        SELECT
                            v.id,
                            CASE
                                WHEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                ) >= CURRENT_DATE
                                THEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                )
                                ELSE TO_DATE(
                                    (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                )
                            END AS next_birthday
                        FROM vip v
                        LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                        WHERE v.ngay_sinh IS NOT NULL
                          AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                          ${vipScope}
                    )
                    SELECT COUNT(*)::int AS total
                    FROM (
                        SELECT (next_birthday - CURRENT_DATE)::int AS days_left
                        FROM birthday_candidates
                    ) events
                    WHERE days_left BETWEEN $${countParams.length + 1} AND $${countParams.length + 2}
                `, [...countParams, vipStartDay, vipEndDay]),
                pool.query(`
                    WITH anniversary_candidates AS (
                        SELECT
                            kh.id,
                            CASE
                                WHEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                ) >= CURRENT_DATE
                                THEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                )
                                ELSE TO_DATE(
                                    (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                )
                            END AS next_anniversary
                        FROM khach_hang kh
                        WHERE kh.ngay_thanh_lap IS NOT NULL
                          ${companyScope}
                    )
                    SELECT COALESCE(MAX((next_anniversary - CURRENT_DATE)::int), 0)::int AS max_days_left
                    FROM anniversary_candidates
                    WHERE next_anniversary >= CURRENT_DATE
                `, countParams),
                pool.query(`
                    WITH birthday_candidates AS (
                        SELECT
                            v.id,
                            CASE
                                WHEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                ) >= CURRENT_DATE
                                THEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                )
                                ELSE TO_DATE(
                                    (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                )
                            END AS next_birthday
                        FROM vip v
                        LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                        WHERE v.ngay_sinh IS NOT NULL
                          AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                          ${vipScope}
                    )
                    SELECT COALESCE(MAX((next_birthday - CURRENT_DATE)::int), 0)::int AS max_days_left
                    FROM birthday_candidates
                    WHERE next_birthday >= CURRENT_DATE
                `, countParams)
            ]);

            const tongTrangKhachHang = Math.max(Math.ceil((companyMaxResult.rows[0].max_days_left + 1) / windowSizeDays), 1);
            const tongTrangVip = Math.max(Math.ceil((vipMaxResult.rows[0].max_days_left + 1) / windowSizeDays), 1);
            const khPage = Math.min(requestedKhPage, tongTrangKhachHang);
            const vipPage = Math.min(requestedVipPage, tongTrangVip);
            const companyStartDay = (khPage - 1) * windowSizeDays;
            const companyEndDay = companyStartDay + windowSizeDays - 1;
            const vipWindowStartDay = (vipPage - 1) * windowSizeDays;
            const vipWindowEndDay = vipWindowStartDay + windowSizeDays - 1;
            const companyParams = [...countParams, companyStartDay, companyEndDay];
            const vipParams = [...countParams, vipWindowStartDay, vipWindowEndDay];
            const startDayParamIndex = countParams.length + 1;
            const endDayParamIndex = countParams.length + 2;

            const [companyResult, vipResult, birthdayResult, anniversaryResult] = await Promise.all([
                pool.query(`
                    WITH anniversary_candidates AS (
                        SELECT
                            kh.id,
                            kh.ten_khach_hang,
                            kh.ngay_thanh_lap,
                            cb.ho_ten AS can_bo_cham_soc,
                            cb.phong_ban,
                            CASE
                                WHEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                ) >= CURRENT_DATE
                                THEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                )
                                ELSE TO_DATE(
                                    (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-' ||
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int || '-' ||
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int,
                                    'YYYY-MM-DD'
                                )
                            END AS next_anniversary
                        FROM khach_hang kh
                        LEFT JOIN can_bo_quan_ly cb ON cb.id = kh.can_bo_id
                        WHERE kh.ngay_thanh_lap IS NOT NULL
                          ${companyScope}
                    )
                    SELECT
                        *,
                        (next_anniversary = CURRENT_DATE) AS la_hom_nay,
                        (next_anniversary - CURRENT_DATE)::int AS days_left
                    FROM anniversary_candidates
                    WHERE (next_anniversary - CURRENT_DATE)::int BETWEEN $${startDayParamIndex} AND $${endDayParamIndex}
                    ORDER BY next_anniversary, ten_khach_hang
                `, companyParams),
                pool.query(`
                    WITH birthday_candidates AS (
                        SELECT
                            v.id,
                            v.ho_ten,
                            v.ngay_sinh,
                            v.so_dien_thoai,
                            kh.ten_khach_hang,
                            cv.ten_chuc_vu,
                            CASE
                                WHEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                ) >= CURRENT_DATE
                                THEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                )
                                ELSE TO_DATE(
                                    (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                )
                            END AS next_birthday
                        FROM vip v
                        LEFT JOIN khach_hang kh ON kh.id = v.khach_hang_id
                        LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                        WHERE v.ngay_sinh IS NOT NULL
                          AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                          ${vipScope}
                    )
                    SELECT
                        *,
                        (next_birthday = CURRENT_DATE) AS la_hom_nay,
                        (next_birthday - CURRENT_DATE)::int AS days_left
                    FROM birthday_candidates
                    WHERE (next_birthday - CURRENT_DATE)::int BETWEEN $${startDayParamIndex} AND $${endDayParamIndex}
                    ORDER BY next_birthday, ho_ten
                `, vipParams),
                pool.query(`
                    WITH birthday_candidates AS (
                        SELECT
                            v.id,
                            v.ho_ten,
                            kh.ten_khach_hang,
                            CASE
                                WHEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                ) >= CURRENT_DATE
                                THEN TO_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                )
                                ELSE TO_DATE(
                                    (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-' ||
                                    EXTRACT(MONTH FROM v.ngay_sinh)::int || '-' ||
                                    EXTRACT(DAY FROM v.ngay_sinh)::int,
                                    'YYYY-MM-DD'
                                )
                            END AS next_birthday
                        FROM vip v
                        LEFT JOIN khach_hang kh ON kh.id = v.khach_hang_id
                        LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                        WHERE v.ngay_sinh IS NOT NULL
                          AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                          AND ($1::int IS NULL OR v.can_bo_quan_ly_id = $1)
                    )
                    SELECT
                        id,
                        ho_ten,
                        ten_khach_hang,
                        next_birthday,
                        (next_birthday - CURRENT_DATE)::int AS days_left
                    FROM birthday_candidates
                    WHERE next_birthday BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
                    ORDER BY next_birthday, ho_ten
                    LIMIT 20
                `, [scopedCanBoId]),
                pool.query(`
                    WITH anniversary_candidates AS (
                        SELECT
                            kh.id,
                            kh.ten_khach_hang,
                            CASE
                                WHEN MAKE_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int,
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int,
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int
                                ) >= CURRENT_DATE
                                THEN MAKE_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int,
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int,
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int
                                )
                                ELSE MAKE_DATE(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::int + 1,
                                    EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int,
                                    EXTRACT(DAY FROM kh.ngay_thanh_lap)::int
                                )
                            END AS next_anniversary
                        FROM khach_hang kh
                        WHERE kh.ngay_thanh_lap IS NOT NULL
                    )
                    SELECT
                        id,
                        ten_khach_hang,
                        next_anniversary,
                        (next_anniversary - CURRENT_DATE)::int AS days_left
                    FROM anniversary_candidates
                    WHERE next_anniversary BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
                    ORDER BY next_anniversary, ten_khach_hang
                    LIMIT 20
                `)
            ]);

            res.render('index', {
                danhSachKhachHang: companyResult.rows,
                danhSachVip: vipResult.rows,
                birthdays: birthdayResult.rows,
                anniversaries: anniversaryResult.rows,
                khPage,
                vipPage,
                tongTrangKhachHang,
                tongTrangVip,
                totalKhachHang: companyResult.rows.length,
                totalVip: vipResult.rows.length
            });
        } catch (err) {
            console.error('Lỗi dashboard:', err);
            res.status(500).send('Lỗi máy chủ: ' + err.message);
        }
    });

    return router;
};
