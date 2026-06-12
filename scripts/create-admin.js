const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const username = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');
const fullName = String(process.env.ADMIN_FULL_NAME || 'Quan tri he thong').trim();

if (!username || password.length < 8) {
    console.error('Can dat ADMIN_USERNAME va ADMIN_PASSWORD (toi thieu 8 ky tu).');
    process.exit(1);
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'crm_db',
    password: process.env.DB_PASSWORD || '123456',
    port: parseInt(process.env.DB_PORT, 10) || 5432
});

async function main() {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(`
        INSERT INTO users (username, password_hash, full_name, role)
        VALUES ($1, $2, $3, 'admin')
        ON CONFLICT (username)
        DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            full_name = EXCLUDED.full_name,
            role = 'admin',
            can_bo_quan_ly_id = NULL
    `, [username, passwordHash, fullName]);
    console.log(`Da tao/cap nhat tai khoan admin: ${username}`);
}

main()
    .catch(err => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
