BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) NOT NULL,
    can_bo_quan_ly_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (role IN ('admin', 'truong_phong', 'can_bo')),
    CONSTRAINT users_can_bo_quan_ly_id_fkey
        FOREIGN KEY (can_bo_quan_ly_id)
        REFERENCES can_bo_quan_ly(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role
    ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_can_bo_quan_ly_id
    ON users(can_bo_quan_ly_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_can_bo_unique
    ON users(can_bo_quan_ly_id)
    WHERE can_bo_quan_ly_id IS NOT NULL;

COMMIT;
