import { ensureUploadHistoryTables, getPool } from '../../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end('Method Not Allowed');
    return;
  }

  try {
    const limitRaw = Number(req.query?.limit ?? 50);
    const offsetRaw = Number(req.query?.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

    const pool = getPool();
    await ensureUploadHistoryTables(pool);

    const [rows] = await pool.query(
      `SELECT
         id,
         created_at AS createdAt,
         source,
         received,
         client_received AS clientReceived,
         client_sent_unique AS clientSentUnique,
         client_skipped_duplicates AS clientSkippedDuplicates,
         affected_rows AS affectedRows,
         note
       FROM budget_upload_batches
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, history: rows || [], limit, offset }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
