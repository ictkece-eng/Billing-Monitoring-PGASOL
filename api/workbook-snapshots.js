import { ensureWorkbookSnapshotsTable, getPool } from './_db.js';
import { readJsonBody } from './_body.js';

const SNAPSHOT_KEYS = new Set(['dashboard', 'workflow']);
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

export default async function handler(req, res) {
  try {
    const pool = getPool();
    await ensureWorkbookSnapshotsTable(pool);

    if (req.method === 'GET') {
      const [rows] = await pool.query(
        'SELECT snapshot_key, payload FROM app_workbook_snapshots WHERE snapshot_key IN (?, ?)',
        ['dashboard', 'workflow']
      );
      const snapshots = {};
      for (const row of rows || []) {
        snapshots[String(row.snapshot_key)] = JSON.parse(String(row.payload));
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, snapshots }));
      return;
    }

    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT');
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    const body = await readJsonBody(req);
    const key = String(body?.key || '');
    if (!SNAPSHOT_KEYS.has(key) || body?.payload === undefined) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: 'Key dan payload workbook tidak valid' }));
      return;
    }
    const payload = JSON.stringify(body.payload);
    if (Buffer.byteLength(payload, 'utf8') > MAX_SNAPSHOT_BYTES) {
      res.statusCode = 413;
      res.end(JSON.stringify({ ok: false, error: 'Data workbook melebihi batas ukuran 4 MB' }));
      return;
    }

    await pool.query(
      `INSERT INTO app_workbook_snapshots (snapshot_key, payload)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
      [key, payload]
    );
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  }
}
