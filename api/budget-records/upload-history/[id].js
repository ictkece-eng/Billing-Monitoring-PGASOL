import { ensureUploadHistoryTables, getPool } from '../../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.statusCode = 405;
    res.setHeader('Allow', 'DELETE');
    res.end('Method Not Allowed');
    return;
  }

  const id = String(req.query?.id || '').trim();
  if (!id) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'id wajib' }));
    return;
  }

  try {
    const pool = getPool();
    await ensureUploadHistoryTables(pool);

    const [r1] = await pool.query('DELETE FROM budget_upload_batch_items WHERE upload_id = ?', [id]);
    const [r2] = await pool.query('DELETE FROM budget_upload_batches WHERE id = ?', [id]);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: true,
        deletedItems: Number(r1?.affectedRows || 0),
        deletedBatches: Number(r2?.affectedRows || 0),
      })
    );
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
