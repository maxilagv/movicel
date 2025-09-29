const { Pool } = require('pg');
require('dotenv').config();

// Prefer DATABASE_URL, else build from PG* env vars
const connectionString = process.env.DATABASE_URL;

const shouldUseSSL = (() => {
  if (process.env.PGSSL === 'true') return true;
  if (!connectionString) return false;
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    if (sslMode && sslMode.toLowerCase() === 'require') return true;
  } catch (_) {
    if (/sslmode=require/i.test(connectionString)) return true;
  }
  return false;
})();

const sslConfig = shouldUseSSL ? { rejectUnauthorized: false } : undefined;

const pool = connectionString
  ? new Pool({ connectionString, ssl: sslConfig })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: sslConfig,
    });

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };

