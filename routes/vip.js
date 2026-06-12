const express = require('express');

module.exports = function createVipRouter({ pool }) {
    const router = express.Router();

    // Cap nhat VIP
    router.post('/khach-hang/vip/update', async (req, res) => {
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

    // Xoa VIP
    router.get('/khach-hang/vip/delete/:id', async (req, res) => {
        try {
            await pool.query('DELETE FROM vip WHERE id = $1', [req.params.id]);
            res.redirect('/khach-hang?toast=Đã%20xóa%20VIP%20thành%20công!&type=warning');
        } catch (err) {
            console.error('Lỗi xóa VIP:', err);
            res.status(500).send('Lỗi xóa VIP: ' + err.message);
        }
    });

    // API: Lay thong tin VIP chi tiet + lich su cham soc
    router.get(
        '/api/vip/:id',
        async (req, res) => {
            try {
                // Lay thong tin VIP + cong ty + chuc vu
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

                // Lay lich su cham soc
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
        }
    );

    return router;
};
