import { ensureBudgetRecordsTable, ensureUploadHistoryTables, getPool } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.statusCode = 405;
    res.setHeader('Allow', 'DELETE');
    res.end('Method Not Allowed');
    return;
  }

  // Small safety latch to avoid accidental calls.
  // Frontend will call with ?confirm=1.
  const confirm = String(req.query?.confirm ?? '').trim();
  if (confirm !== '1') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: false,
        error: 'Konfirmasi diperlukan. Panggil endpoint ini dengan query ?confirm=1',
      })
    );
    return;
  }

  const pool = getPool();

  try {
    await ensureBudgetRecordsTable(pool);
    await ensureUploadHistoryTables(pool);

    // Use transaction so we never end up with half-deleted state.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [r1] = await conn.query('DELETE FROM budget_upload_batch_items');
      const [r2] = await conn.query('DELETE FROM budget_upload_batches');
      const [r3] = await conn.query('DELETE FROM budget_records');

      await conn.commit();

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          deletedItems: Number(r1?.affectedRows || 0),
          deletedBatches: Number(r2?.affectedRows || 0),
          deletedRecords: Number(r3?.affectedRows || 0),
        })
      );
    } catch (e) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
      throw e;
    } finally {
      try {
        conn.release();
      } catch {
        // ignore
      }
    }
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
