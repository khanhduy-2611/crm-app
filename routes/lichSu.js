const express = require('express');

module.exports = function createLichSuRouter({ pool }) {
    const router = express.Router();

    router.get(
        '/api/lich-su/:vipId',
        async (req, res) => {
            try {
                const result = await pool.query(`
                    SELECT ls.id, ls.vip_id, ls.ngay_lien_he, ls.noi_dung,
                           ls.qua_tang, ls.nguoi_phu_trach, ls.created_at,
                           v.ho_ten AS ten_vip
                    FROM lich_su_cham_soc ls
                    JOIN vip v ON v.id = ls.vip_id
                    WHERE ls.vip_id = $1
                    ORDER BY ls.ngay_lien_he DESC, ls.created_at DESC
                `, [req.params.vipId]);

                res.json({ lichSu: result.rows });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        }
    );

    router.post(
        '/lich-su/add',
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
        }
    );

    router.post(
        '/lich-su/update',
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
        }
    );

    router.get('/lich-su/delete/:id', async (req, res) => {
        try {
            await pool.query('DELETE FROM lich_su_cham_soc WHERE id = $1', [req.params.id]);
            res.redirect('/khach-hang?toast=Đã%20xóa%20lịch%20sử%20thành%20công!&type=warning');
        } catch (err) {
            console.error('Lỗi xóa lịch sử:', err);
            res.status(500).send('Lỗi: ' + err.message);
        }
    });

    return router;
};
