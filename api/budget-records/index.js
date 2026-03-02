import { getPool } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end('Method Not Allowed');
    return;
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, status, namaUser, tim, periode,
              CAST(nilaiTagihan AS SIGNED) AS nilaiTagihan,
              noRO, tglBAST, noBAST, status2, emailSoftCopy, saNo, tglKirimJKT, reviewerVendor, keterangan
         FROM budget_records
         ORDER BY updated_at DESC`
    );

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, records: rows || [] }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
