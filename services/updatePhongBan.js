const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');

const excelFile = process.argv[2];

if (!excelFile) {
    console.error('Cach dung: node services/updatePhongBan.js <duong-dan-file.xlsx>');
    process.exit(1);
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'crm_db',
    password: process.env.DB_PASSWORD || '123456',
    port: parseInt(process.env.DB_PORT, 10) || 5432
});

function normalizeHeader(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function getCellText(row, columnNumber) {
    return String(row.getCell(columnNumber).text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function findHeaderColumn(headerRow, expectedHeader) {
    const normalizedExpected = normalizeHeader(expectedHeader);
    let matchedColumn = null;

    headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        if (normalizeHeader(cell.text) === normalizedExpected) {
            matchedColumn = columnNumber;
        }
    });

    return matchedColumn;
}

async function main() {
    const workbook = new ExcelJS.Workbook();
    const resolvedFile = path.resolve(excelFile);
    await workbook.xlsx.readFile(resolvedFile);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('File Excel khong co worksheet.');
    }

    const headerRow = worksheet.getRow(1);
    const hoTenColumn = findHeaderColumn(headerRow, 'Cán bộ quản lý');
    const phongBanColumn = findHeaderColumn(headerRow, 'Phòng nghiệp vụ');

    if (!hoTenColumn || !phongBanColumn) {
        throw new Error(
            'Khong tim thay day du cot "Can bo quan ly" va "Phong nghiep vu" trong dong dau tien.'
        );
    }

    const result = {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0
    };
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
            const row = worksheet.getRow(rowNumber);
            const hoTen = getCellText(row, hoTenColumn);
            const phongBan = getCellText(row, phongBanColumn);

            if (!hoTen || !phongBan) {
                result.skipped += 1;
                continue;
            }

            const existing = await client.query(
                `SELECT id
                 FROM can_bo_quan_ly
                 WHERE LOWER(TRIM(ho_ten)) = LOWER(TRIM($1))
                 ORDER BY id
                 LIMIT 1`,
                [hoTen]
            );

            if (!existing.rows[0]) {
                await client.query(
                    `INSERT INTO can_bo_quan_ly (ho_ten, phong_ban)
                     VALUES ($1, $2)`,
                    [hoTen, phongBan]
                );
                result.inserted += 1;
                continue;
            }

            const updated = await client.query(
                `UPDATE can_bo_quan_ly
                 SET phong_ban = $1
                 WHERE id = $2
                   AND phong_ban IS DISTINCT FROM $1
                 RETURNING id`,
                [phongBan, existing.rows[0].id]
            );

            if (updated.rowCount > 0) {
                result.updated += 1;
            } else {
                result.unchanged += 1;
            }
        }

        await client.query('COMMIT');
        console.log(`Da cap nhat phong ban tu: ${resolvedFile}`);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

main()
    .catch(error => {
        console.error(`Loi cap nhat phong ban: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
