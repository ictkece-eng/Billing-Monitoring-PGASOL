import crypto from 'crypto';
import { ensureBudgetRecordsTable, getPool } from '../_db.js';
import { readJsonBody } from '../_body.js';

const toSha256Hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }

  try {
    const body = await readJsonBody(req);
    const fingerprints = body?.fingerprints;

    if (!Array.isArray(fingerprints)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Body harus { fingerprints: string[] }' }));
      return;
    }

    // Prevent abuse: cap per request.
    const MAX = 5000;
    const list = fingerprints.slice(0, MAX).map(String);

    const pool = getPool();
    await ensureBudgetRecordsTable(pool);

    const ids = list.map(toSha256Hex);
    const found = new Set();

    // Chunk IN() query for safety.
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      if (part.length === 0) continue;
      const placeholders = part.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT id FROM budget_records WHERE id IN (${placeholders})`,
        part
      );
      for (const r of rows || []) {
        if (r?.id) found.add(String(r.id));
      }
    }

    const exists = ids.map((id) => found.has(id));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, exists }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
