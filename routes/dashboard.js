const express = require('express');

module.exports = function createDashboardRouter({ pool }) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const scopedCanBoId = null;

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
        const scopeParams = scopedCanBoId === null ? [] : [scopedCanBoId];

        const sevenDayWindow = `
            SELECT generate_series(
                CURRENT_DATE,
                CURRENT_DATE + INTERVAL '6 days',
                INTERVAL '1 day'
            )::date AS event_date
        `;

        try {
            const [companyResult, vipResult] = await Promise.all([
                pool.query(`
                    WITH date_window AS (
                        ${sevenDayWindow}
                    )
                    SELECT
                        kh.id,
                        kh.ten_khach_hang,
                        kh.ngay_thanh_lap,
                        cb.ho_ten AS can_bo_cham_soc,
                        cb.phong_ban,
                        dw.event_date AS next_anniversary,
                        (dw.event_date = CURRENT_DATE) AS la_hom_nay,
                        (dw.event_date - CURRENT_DATE)::int AS days_left
                    FROM khach_hang kh
                    JOIN date_window dw
                      ON EXTRACT(MONTH FROM kh.ngay_thanh_lap)::int = EXTRACT(MONTH FROM dw.event_date)::int
                     AND EXTRACT(DAY FROM kh.ngay_thanh_lap)::int = EXTRACT(DAY FROM dw.event_date)::int
                    LEFT JOIN can_bo_quan_ly cb ON cb.id = kh.can_bo_id
                    WHERE kh.ngay_thanh_lap IS NOT NULL
                      ${companyScope}
                    ORDER BY dw.event_date, kh.ten_khach_hang
                `, scopeParams),
                pool.query(`
                    WITH date_window AS (
                        ${sevenDayWindow}
                    )
                    SELECT
                        v.id,
                        v.ho_ten,
                        v.ngay_sinh,
                        v.so_dien_thoai,
                        kh.ten_khach_hang,
                        cv.ten_chuc_vu,
                        dw.event_date AS next_birthday,
                        (dw.event_date = CURRENT_DATE) AS la_hom_nay,
                        (dw.event_date - CURRENT_DATE)::int AS days_left
                    FROM vip v
                    JOIN date_window dw
                      ON EXTRACT(MONTH FROM v.ngay_sinh)::int = EXTRACT(MONTH FROM dw.event_date)::int
                     AND EXTRACT(DAY FROM v.ngay_sinh)::int = EXTRACT(DAY FROM dw.event_date)::int
                    LEFT JOIN khach_hang kh ON kh.id = v.khach_hang_id
                    LEFT JOIN chuc_vu cv ON cv.id = v.chuc_vu_id
                    WHERE v.ngay_sinh IS NOT NULL
                      AND LOWER(TRIM(COALESCE(cv.ten_chuc_vu, ''))) <> LOWER('Quản lý')
                      ${vipScope}
                    ORDER BY dw.event_date, v.ho_ten
                `, scopeParams)
            ]);

            res.render('index', {
                danhSachKhachHang: companyResult.rows,
                danhSachVip: vipResult.rows,
                birthdays: vipResult.rows,
                anniversaries: companyResult.rows,
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
