const express = require('express');

module.exports = function createDashboardRouter({ pool }) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const scopedCanBoId = null;
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const limit = Number.parseInt(req.query.limit, 10) === 50 ? 50 : 20;
        const requestedKhPage = Math.max(Number.parseInt(req.query.khPage, 10) || 1, 1);
        const requestedVipPage = Math.max(Number.parseInt(req.query.vipPage, 10) || 1, 1);

        const companyScope = scopedCanBoId === null
            ? ''
            : `AND EXISTS (
                SELECT 1
                FROM vip scoped_vip
                WHERE scoped_vip.khach_hang_id = kh.id
                  AND scoped_vip.can_bo_quan_ly_id = $3
            )`;
        const vipScope = scopedCanBoId === null
            ? ''
            : 'AND v.can_bo_quan_ly_id = $3';
        const countParams = scopedCanBoId === null
            ? [currentMonth, currentDay]
            : [currentMonth, currentDay, scopedCanBoId];

        try {
            const [companyCountResult, vipCountResult] = await Promise.all([
                pool.query(`
                    SELECT COUNT(*)::int AS total
                    FROM khach_hang kh
                    WHERE kh.ngay_thanh_lap IS NOT NULL
                      AND EXTRACT(MONTH FROM kh.ngay_thanh_lap) = $1
                      AND EXTRACT(DAY FROM kh.ngay_thanh_lap) >= $2
                      ${companyScope}
                `, countParams),
                pool.query(`
                    SELECT COUNT(*)::int AS total
                    FROM vip v
                    LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                    WHERE v.ngay_sinh IS NOT NULL
                      AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                      AND EXTRACT(MONTH FROM v.ngay_sinh) = $1
                      AND EXTRACT(DAY FROM v.ngay_sinh) >= $2
                      ${vipScope}
                `, countParams)
            ]);

            const totalKhachHang = companyCountResult.rows[0].total;
            const totalVip = vipCountResult.rows[0].total;
            const tongTrangKhachHang = Math.max(Math.ceil(totalKhachHang / limit), 1);
            const tongTrangVip = Math.max(Math.ceil(totalVip / limit), 1);
            const khPage = Math.min(requestedKhPage, tongTrangKhachHang);
            const vipPage = Math.min(requestedVipPage, tongTrangVip);
            const companyParams = [...countParams, limit, (khPage - 1) * limit];
            const vipParams = [...countParams, limit, (vipPage - 1) * limit];
            const dayParamIndex = 2;
            const limitParamIndex = countParams.length + 1;
            const offsetParamIndex = countParams.length + 2;

            const [companyResult, vipResult, birthdayResult, anniversaryResult] = await Promise.all([
                pool.query(`
                    SELECT
                        kh.id,
                        kh.ten_khach_hang,
                        kh.ngay_thanh_lap,
                        cb.ho_ten AS can_bo_cham_soc,
                        cb.phong_ban,
                        (EXTRACT(DAY FROM kh.ngay_thanh_lap) = $${dayParamIndex}) AS la_hom_nay
                    FROM khach_hang kh
                    LEFT JOIN can_bo_quan_ly cb ON cb.id = kh.can_bo_id
                    WHERE kh.ngay_thanh_lap IS NOT NULL
                      AND EXTRACT(MONTH FROM kh.ngay_thanh_lap) = $1
                      AND EXTRACT(DAY FROM kh.ngay_thanh_lap) >= $${dayParamIndex}
                      ${companyScope}
                    ORDER BY la_hom_nay DESC,
                             EXTRACT(DAY FROM kh.ngay_thanh_lap),
                             kh.ten_khach_hang
                    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
                `, companyParams),
                pool.query(`
                    SELECT
                        v.id,
                        v.ho_ten,
                        v.ngay_sinh,
                        v.so_dien_thoai,
                        kh.ten_khach_hang,
                        cv.ten_chuc_vu,
                        (EXTRACT(DAY FROM v.ngay_sinh) = $${dayParamIndex}) AS la_hom_nay
                    FROM vip v
                    LEFT JOIN khach_hang kh ON kh.id = v.khach_hang_id
                    LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                    WHERE v.ngay_sinh IS NOT NULL
                      AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                      AND EXTRACT(MONTH FROM v.ngay_sinh) = $1
                      AND EXTRACT(DAY FROM v.ngay_sinh) >= $${dayParamIndex}
                      ${vipScope}
                    ORDER BY la_hom_nay DESC,
                             EXTRACT(DAY FROM v.ngay_sinh),
                             v.ho_ten
                    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
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
                    WHERE next_birthday BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
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
                    WHERE next_anniversary BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
                    ORDER BY next_anniversary, ten_khach_hang
                    LIMIT 20
                `)
            ]);

            res.render('index', {
                thang: currentMonth,
                danhSachKhachHang: companyResult.rows,
                danhSachVip: vipResult.rows,
                birthdays: birthdayResult.rows,
                anniversaries: anniversaryResult.rows,
                khPage,
                vipPage,
                tongTrangKhachHang,
                tongTrangVip,
                totalKhachHang,
                totalVip,
                limit
            });
        } catch (err) {
            console.error('Lỗi dashboard:', err);
            res.status(500).send('Lỗi máy chủ: ' + err.message);
        }
    });

    return router;
};
