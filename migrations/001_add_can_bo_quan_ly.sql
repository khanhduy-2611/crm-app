BEGIN;

CREATE TABLE IF NOT EXISTS can_bo_quan_ly (
    id SERIAL PRIMARY KEY,
    ho_ten VARCHAR(150) NOT NULL,
    phong_ban VARCHAR(150),
    so_dien_thoai VARCHAR(20),
    email VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE vip
    ADD COLUMN IF NOT EXISTS can_bo_quan_ly_id INTEGER;

ALTER TABLE lich_su_cham_soc
    ADD COLUMN IF NOT EXISTS can_bo_quan_ly_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vip_can_bo_quan_ly_id_fkey'
    ) THEN
        ALTER TABLE vip
            ADD CONSTRAINT vip_can_bo_quan_ly_id_fkey
            FOREIGN KEY (can_bo_quan_ly_id)
            REFERENCES can_bo_quan_ly(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'lich_su_cham_soc_can_bo_quan_ly_id_fkey'
    ) THEN
        ALTER TABLE lich_su_cham_soc
            ADD CONSTRAINT lich_su_cham_soc_can_bo_quan_ly_id_fkey
            FOREIGN KEY (can_bo_quan_ly_id)
            REFERENCES can_bo_quan_ly(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vip_can_bo_quan_ly_id
    ON vip(can_bo_quan_ly_id);

CREATE INDEX IF NOT EXISTS idx_vip_khach_hang_id
    ON vip(khach_hang_id);

CREATE INDEX IF NOT EXISTS idx_vip_ngay_sinh
    ON vip(ngay_sinh);

CREATE INDEX IF NOT EXISTS idx_lich_su_vip_ngay_lien_he
    ON lich_su_cham_soc(vip_id, ngay_lien_he DESC);

CREATE INDEX IF NOT EXISTS idx_lich_su_can_bo_ngay_lien_he
    ON lich_su_cham_soc(can_bo_quan_ly_id, ngay_lien_he DESC);

COMMIT;
