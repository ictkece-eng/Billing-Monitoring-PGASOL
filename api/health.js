import { getPool } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end('Method Not Allowed');
    return;
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, db: true, rows }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, db: false, error: String(e?.message || e) }));
  }
}
