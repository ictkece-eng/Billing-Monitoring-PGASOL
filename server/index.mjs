import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createPool } from './db.mjs';

const app = express();

const PORT = Number(process.env.TIDB_API_PORT || 5174);

// For local dev: allow Vite dev server origins.
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
    credentials: false,
  })
);
app.use(express.json({ limit: '25mb' }));

const pool = createPool();

let schemaEnsured = false;
let historySchemaEnsured = false;
const ensureBudgetRecordsTable = async () => {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_records (
      id VARCHAR(191) NOT NULL,
      status VARCHAR(32) NOT NULL,
      namaUser VARCHAR(255) NOT NULL,
      tim VARCHAR(255) NOT NULL,
      periode VARCHAR(64) NOT NULL,
      nilaiTagihan BIGINT NOT NULL,
      noRO VARCHAR(128) NULL,
      tglBAST VARCHAR(64) NULL,
      noBAST VARCHAR(128) NULL,
      status2 VARCHAR(255) NULL,
      emailSoftCopy VARCHAR(255) NULL,
      saNo VARCHAR(128) NULL,
      tglKirimJKT VARCHAR(64) NULL,
      reviewerVendor VARCHAR(255) NULL,
      keterangan TEXT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `);
  schemaEnsured = true;
};

const ensureUploadHistoryTables = async () => {
  if (historySchemaEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_upload_batches (
      id VARCHAR(64) NOT NULL,
      source VARCHAR(32) NULL,
      received INT NOT NULL,
      client_received INT NULL,
      client_sent_unique INT NULL,
      client_skipped_duplicates INT NULL,
      affected_rows INT NULL,
      note VARCHAR(255) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_upload_batch_items (
      upload_id VARCHAR(64) NOT NULL,
      record_id VARCHAR(191) NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (upload_id, record_id),
      KEY idx_record_id (record_id),
      KEY idx_upload_created (upload_id, created_at)
    )
  `);

  historySchemaEnsured = true;
};

const safeStr = (v) => (v === undefined || v === null ? '' : String(v));
const safeInt = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9\-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
};

const fingerprint = (r) => {
  // Should be stable across imports so we can safely upsert.
  const parts = [
    safeStr(r.namaUser).trim().toLowerCase(),
    safeStr(r.tim).trim().toLowerCase(),
    safeStr(r.periode).trim().toLowerCase(),
    String(safeInt(r.nilaiTagihan || 0)),
    safeStr(r.noRO).trim().toLowerCase(),
    safeStr(r.tglBAST).trim().toLowerCase(),
    safeStr(r.noBAST).trim().toLowerCase(),
    safeStr(r.status2).trim().toLowerCase(),
    safeStr(r.saNo).trim().toLowerCase(),
    safeStr(r.keterangan).trim().toLowerCase(),
  ].join('|');

  return crypto.createHash('sha256').update(parts).digest('hex');
};

const normalizeRecord = (r) => {
  const id = fingerprint(r);
  return {
    id,
    status: safeStr(r.status || 'On Progress').trim() || 'On Progress',
    namaUser: safeStr(r.namaUser || 'Unknown').trim() || 'Unknown',
    tim: safeStr(r.tim || 'No Team').trim() || 'No Team',
    periode: safeStr(r.periode || '-').trim() || '-',
    nilaiTagihan: safeInt(r.nilaiTagihan || 0),
    noRO: safeStr(r.noRO || '').trim(),
    tglBAST: safeStr(r.tglBAST || '').trim(),
    noBAST: safeStr(r.noBAST || '').trim(),
    status2: safeStr(r.status2 || '').trim(),
    emailSoftCopy: safeStr(r.emailSoftCopy || '').trim(),
    saNo: safeStr(r.saNo || '').trim(),
    tglKirimJKT: safeStr(r.tglKirimJKT || '').trim(),
    reviewerVendor: safeStr(r.reviewerVendor || '').trim(),
    keterangan: safeStr(r.keterangan || '').trim(),
  };
};

app.post('/api/budget-records/exist', async (req, res) => {
  const fingerprints = req.body?.fingerprints;
  if (!Array.isArray(fingerprints)) {
    res.status(400).json({ ok: false, error: 'Body harus { fingerprints: string[] }' });
    return;
  }

  try {
    await ensureBudgetRecordsTable();

    const MAX = 5000;
    const list = fingerprints.slice(0, MAX).map(String);
    const ids = list.map(s => crypto.createHash('sha256').update(String(s)).digest('hex'));
    const found = new Set();

    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      if (part.length === 0) continue;
      const placeholders = part.map(() => '?').join(',');
      const [rows] = await pool.query(`SELECT id FROM budget_records WHERE id IN (${placeholders})`, part);
      for (const r of rows || []) {
        if (r?.id) found.add(String(r.id));
      }
    }

    const exists = ids.map(id => found.has(id));
    res.json({ ok: true, exists });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, error: String(e?.message || e) });
  }
});

app.get('/api/budget-records', async (_req, res) => {
  try {
    await ensureBudgetRecordsTable();
    const [rows] = await pool.query(
      `SELECT id, status, namaUser, tim, periode, CAST(nilaiTagihan AS SIGNED) AS nilaiTagihan, noRO, tglBAST, noBAST, status2, emailSoftCopy, saNo, tglKirimJKT, reviewerVendor, keterangan
       FROM budget_records
       ORDER BY updated_at DESC`
    );
    res.json({ ok: true, records: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/api/budget-records/upload-history', async (req, res) => {
  try {
    await ensureUploadHistoryTables();
    const limitRaw = Number(req.query?.limit ?? 50);
    const offsetRaw = Number(req.query?.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

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
    res.json({ ok: true, history: rows || [], limit, offset });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete('/api/budget-records/upload-history/:id', async (req, res) => {
  const id = String(req.params?.id || '').trim();
  if (!id) {
    res.status(400).json({ ok: false, error: 'id wajib' });
    return;
  }

  try {
    await ensureUploadHistoryTables();
    const [r1] = await pool.query('DELETE FROM budget_upload_batch_items WHERE upload_id = ?', [id]);
    const [r2] = await pool.query('DELETE FROM budget_upload_batches WHERE id = ?', [id]);
    res.json({
      ok: true,
      deletedItems: Number(r1?.affectedRows || 0),
      deletedBatches: Number(r2?.affectedRows || 0),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/api/budget-records/upload', async (req, res) => {
  const input = req.body?.records;
  if (!Array.isArray(input)) {
    res.status(400).json({ ok: false, error: 'Body harus { records: BudgetRecord[] }' });
    return;
  }

  try {
    await ensureBudgetRecordsTable();
    const normalized = input.map(normalizeRecord);

    // Create an upload batch id early so we can write history even if chunking happens.
    const uploadBatchId = crypto.randomBytes(16).toString('hex');

    // Optional client metadata (non-breaking)
    const meta = req.body?.meta || {};
    const clientReceived = Number.isFinite(Number(meta.clientReceived)) ? Math.trunc(Number(meta.clientReceived)) : null;
    const clientSentUnique = Number.isFinite(Number(meta.clientSentUnique)) ? Math.trunc(Number(meta.clientSentUnique)) : null;
    const clientSkippedDuplicates = Number.isFinite(Number(meta.clientSkippedDuplicates)) ? Math.trunc(Number(meta.clientSkippedDuplicates)) : null;
    const note = meta.note ? String(meta.note).slice(0, 255) : null;

    // Chunk inserts to avoid max_allowed_packet issues.
    const CHUNK = 500;
    let inserted = 0;

    for (let i = 0; i < normalized.length; i += CHUNK) {
      const chunk = normalized.slice(i, i + CHUNK);
      if (chunk.length === 0) continue;

      const cols = [
        'id',
        'status',
        'namaUser',
        'tim',
        'periode',
        'nilaiTagihan',
        'noRO',
        'tglBAST',
        'noBAST',
        'status2',
        'emailSoftCopy',
        'saNo',
        'tglKirimJKT',
        'reviewerVendor',
        'keterangan',
      ];

      const placeholders = chunk
        .map(() => `(${cols.map(() => '?').join(',')})`)
        .join(',');

      const values = [];
      for (const r of chunk) {
        values.push(
          r.id,
          r.status,
          r.namaUser,
          r.tim,
          r.periode,
          r.nilaiTagihan,
          r.noRO,
          r.tglBAST,
          r.noBAST,
          r.status2,
          r.emailSoftCopy,
          r.saNo,
          r.tglKirimJKT,
          r.reviewerVendor,
          r.keterangan
        );
      }

      const sql = `INSERT INTO budget_records (${cols.join(',')}) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          status=VALUES(status),
          namaUser=VALUES(namaUser),
          tim=VALUES(tim),
          periode=VALUES(periode),
          nilaiTagihan=VALUES(nilaiTagihan),
          noRO=VALUES(noRO),
          tglBAST=VALUES(tglBAST),
          noBAST=VALUES(noBAST),
          status2=VALUES(status2),
          emailSoftCopy=VALUES(emailSoftCopy),
          saNo=VALUES(saNo),
          tglKirimJKT=VALUES(tglKirimJKT),
          reviewerVendor=VALUES(reviewerVendor),
          keterangan=VALUES(keterangan)`;

      const [result] = await pool.query(sql, values);
      // mysql2 returns OkPacket-like object with affectedRows.
      const affected = Number(result?.affectedRows || 0);
      inserted += affected;
    }

    // Non-breaking: try to write upload history, but never fail the upload if history logging fails.
    try {
      await ensureUploadHistoryTables();

      await pool.query(
        `INSERT INTO budget_upload_batches (
           id, source, received, client_received, client_sent_unique, client_skipped_duplicates, affected_rows, note
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          uploadBatchId,
          'web',
          normalized.length,
          clientReceived,
          clientSentUnique,
          clientSkippedDuplicates,
          inserted,
          note,
        ]
      );

      // Store which record IDs were included in this upload.
      // Use INSERT IGNORE to avoid issues if the same record_id appears twice (shouldn't happen, but safe).
      for (let i = 0; i < normalized.length; i += CHUNK) {
        const part = normalized.slice(i, i + CHUNK);
        if (part.length === 0) continue;
        const placeholders = part.map(() => '(?, ?)').join(',');
        const values = [];
        for (const r of part) values.push(uploadBatchId, r.id);
        await pool.query(`INSERT IGNORE INTO budget_upload_batch_items (upload_id, record_id) VALUES ${placeholders}`, values);
      }
    } catch (e) {
      console.warn('[upload-history] failed to write upload history:', String(e?.message || e));
    }

    res.json({ ok: true, received: input.length, affectedRows: inserted, uploadBatchId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[TiDB API] listening on http://localhost:${PORT}`);
});
