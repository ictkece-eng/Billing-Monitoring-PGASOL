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
let sphr01300aSchemaEnsured = false;
const ensureBudgetRecordsTable = async () => {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_records (
      id VARCHAR(191) NOT NULL,
      project_id VARCHAR(32) NOT NULL DEFAULT 'SPHR01031A',
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
  const [projectColumns] = await pool.query("SHOW COLUMNS FROM budget_records LIKE 'project_id'");
  if (!Array.isArray(projectColumns) || projectColumns.length === 0) {
    await pool.query("ALTER TABLE budget_records ADD COLUMN project_id VARCHAR(32) NOT NULL DEFAULT 'SPHR01031A'");
  }
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

const ensureSphr01300aBillingTable = async () => {
  if (sphr01300aSchemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sphr01300a_billing_entries (
      id VARCHAR(36) NOT NULL,
      period CHAR(7) NOT NULL,
      pic VARCHAR(255) NOT NULL,
      area VARCHAR(255) NOT NULL,
      no_ro_spk VARCHAR(128) NULL,
      nilai_ro BIGINT NOT NULL DEFAULT 0,
      nilai_actual BIGINT NOT NULL DEFAULT 0,
      nilai_remaining BIGINT NULL,
      tanggal_submit_bast VARCHAR(32) NULL,
      bast_draft_vendor TINYINT(1) NOT NULL DEFAULT 0,
      bast_request_vendor TINYINT(1) NOT NULL DEFAULT 0,
      bast_review_reviewer1 TINYINT(1) NOT NULL DEFAULT 0,
      bast_approval_approver TINYINT(1) NOT NULL DEFAULT 0,
      bast_reconfirm_vendor TINYINT(1) NOT NULL DEFAULT 0,
      sa_gr_submission TINYINT(1) NOT NULL DEFAULT 0,
      bast_final_validation TINYINT(1) NOT NULL DEFAULT 0,
      no_sa VARCHAR(128) NULL,
      nilai_sa BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_sphr01300a_period (period)
    )
  `);
  const [remainingColumns] = await pool.query(
    "SHOW COLUMNS FROM sphr01300a_billing_entries LIKE 'nilai_remaining'"
  );
  if (!remainingColumns.length) {
    try {
      await pool.query('ALTER TABLE sphr01300a_billing_entries ADD COLUMN nilai_remaining BIGINT NULL');
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME' && error?.errno !== 1060) throw error;
    }
  }
  await pool.query(
    'UPDATE sphr01300a_billing_entries SET nilai_remaining = nilai_ro - nilai_actual WHERE nilai_remaining IS NULL'
  );
  sphr01300aSchemaEnsured = true;
};

const sphrPeriodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const normalizeSphrEntry = (raw) => {
  const period = String(raw?.period || '').trim();
  if (!sphrPeriodPattern.test(period)) throw new Error('Periode harus berformat YYYY-MM');
  const text = (value, field, maxLength, required = false) => {
    const result = value === undefined || value === null ? '' : String(value).trim();
    if (required && !result) throw new Error(`${field} wajib diisi`);
    if (result.length > maxLength) throw new Error(`${field} maksimal ${maxLength} karakter`);
    return result;
  };
  const amount = (value, field) => {
    const result = value === '' || value === undefined || value === null ? 0 : Number(value);
    if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${field} harus bilangan bulat positif atau nol`);
    return result;
  };
  const remaining = (value, fallback) => {
    const result = value === '' || value === undefined || value === null ? fallback : Number(value);
    if (!Number.isSafeInteger(result)) throw new Error('Remaining RO - Actual harus bilangan bulat');
    return result;
  };
  const bool = (value) => value === true || value === 1 || value === '1';
  return {
    period,
    pic: text(raw?.pic, 'PIC', 255, true),
    area: text(raw?.area, 'Area', 255, true),
    noRoSpk: text(raw?.noRoSpk, 'No RO/SPK', 128),
    nilaiRo: amount(raw?.nilaiRo, 'Nilai RO'),
    nilaiActual: amount(raw?.nilaiActual, 'Nilai Actual'),
    nilaiRemaining: remaining(raw?.nilaiRemaining, amount(raw?.nilaiRo, 'Nilai RO') - amount(raw?.nilaiActual, 'Nilai Actual')),
    tanggalSubmitBast: text(raw?.tanggalSubmitBast, 'Tanggal Submit BAST', 32),
    bastDraftVendor: bool(raw?.bastDraftVendor),
    bastRequestVendor: bool(raw?.bastRequestVendor),
    bastReviewReviewer1: bool(raw?.bastReviewReviewer1),
    bastApprovalApprover: bool(raw?.bastApprovalApprover),
    bastReconfirmVendor: bool(raw?.bastReconfirmVendor),
    saGrSubmission: bool(raw?.saGrSubmission),
    bastFinalValidation: bool(raw?.bastFinalValidation),
    noSa: text(raw?.noSa, 'No SA', 128),
    nilaiSa: amount(raw?.nilaiSa, 'Nilai SA'),
  };
};

const safeStr = (v) => (v === undefined || v === null ? '' : String(v));
const safeInt = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9\-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
};

const normalizeProjectId = (v) => v === 'SPHR01300A' ? 'SPHR01300A' : 'SPHR01031A';

const fingerprint = (r) => {
  // Should be stable across imports so we can safely upsert.
  const fields = [
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
  ];
  const projectId = normalizeProjectId(r.projectId);
  const parts = projectId === 'SPHR01031A' ? fields : [projectId, ...fields];

  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
};

const normalizeRecord = (r) => {
  const projectId = normalizeProjectId(r.projectId);
  const id = fingerprint({ ...r, projectId });
  return {
    id,
    projectId,
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
      `SELECT id, project_id AS projectId, status, namaUser, tim, periode, CAST(nilaiTagihan AS SIGNED) AS nilaiTagihan, noRO, tglBAST, noBAST, status2, emailSoftCopy, saNo, tglKirimJKT, reviewerVendor, keterangan
       FROM budget_records
       ORDER BY updated_at DESC`
    );
    res.json({ ok: true, records: rows || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.all('/api/sphr01300a/entries', async (req, res) => {
  try {
    await ensureSphr01300aBillingTable();

    if (req.method === 'GET') {
      const period = String(req.query?.period || '').trim();
      if (!sphrPeriodPattern.test(period)) {
        res.status(400).json({ ok: false, error: 'Periode harus berformat YYYY-MM' });
        return;
      }
      const [rows] = await pool.query(
        `SELECT id, period, pic, area, no_ro_spk AS noRoSpk,
                CAST(nilai_ro AS SIGNED) AS nilaiRo,
                CAST(nilai_actual AS SIGNED) AS nilaiActual,
                CAST(COALESCE(nilai_remaining, nilai_ro - nilai_actual) AS SIGNED) AS nilaiRemaining,
                tanggal_submit_bast AS tanggalSubmitBast,
                bast_draft_vendor AS bastDraftVendor,
                bast_request_vendor AS bastRequestVendor,
                bast_review_reviewer1 AS bastReviewReviewer1,
                bast_approval_approver AS bastApprovalApprover,
                bast_reconfirm_vendor AS bastReconfirmVendor,
                sa_gr_submission AS saGrSubmission,
                bast_final_validation AS bastFinalValidation,
                no_sa AS noSa, CAST(nilai_sa AS SIGNED) AS nilaiSa
           FROM sphr01300a_billing_entries WHERE period = ? ORDER BY area, pic, id`,
        [period]
      );
      res.json({
        ok: true,
        entries: (rows || []).map(row => ({
          ...row,
          id: String(row.id),
          nilaiRo: Number(row.nilaiRo),
          nilaiActual: Number(row.nilaiActual),
          nilaiRemaining: Number(row.nilaiRemaining),
          nilaiSa: Number(row.nilaiSa),
          bastDraftVendor: Boolean(Number(row.bastDraftVendor)),
          bastRequestVendor: Boolean(Number(row.bastRequestVendor)),
          bastReviewReviewer1: Boolean(Number(row.bastReviewReviewer1)),
          bastApprovalApprover: Boolean(Number(row.bastApprovalApprover)),
          bastReconfirmVendor: Boolean(Number(row.bastReconfirmVendor)),
          saGrSubmission: Boolean(Number(row.saGrSubmission)),
          bastFinalValidation: Boolean(Number(row.bastFinalValidation)),
        })),
      });
      return;
    }

    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
      res.set('Allow', 'GET, POST, PUT, DELETE').status(405).send('Method Not Allowed');
      return;
    }

    if (req.method === 'DELETE') {
      const period = String(req.body?.period || '').trim();
      if (period) {
        if (!sphrPeriodPattern.test(period)) {
          res.status(400).json({ ok: false, error: 'Periode harus berformat YYYY-MM' });
          return;
        }
        const [result] = await pool.query(
          'DELETE FROM sphr01300a_billing_entries WHERE period = ?',
          [period]
        );
        res.json({ ok: true, deleted: Number(result?.affectedRows || 0) });
        return;
      }
      const id = String(req.body?.id || '').trim();
      if (!id || id.length > 36) {
        res.status(400).json({ ok: false, error: 'id tidak valid' });
        return;
      }
      const [result] = await pool.query('DELETE FROM sphr01300a_billing_entries WHERE id = ?', [id]);
      if (Number(result?.affectedRows || 0) === 0) {
        res.status(404).json({ ok: false, error: 'Data tidak ditemukan' });
        return;
      }
      res.json({ ok: true });
      return;
    }

    const entry = normalizeSphrEntry(req.body?.entry);
    const id = req.method === 'POST' ? crypto.randomUUID() : String(req.body?.id || '').trim();
    if (!id || id.length > 36) {
      res.status(400).json({ ok: false, error: 'id tidak valid' });
      return;
    }
    const values = [
      entry.period, entry.pic, entry.area, entry.noRoSpk, entry.nilaiRo, entry.nilaiActual, entry.nilaiRemaining,
      entry.tanggalSubmitBast, Number(entry.bastDraftVendor), Number(entry.bastRequestVendor),
      Number(entry.bastReviewReviewer1), Number(entry.bastApprovalApprover),
      Number(entry.bastReconfirmVendor), Number(entry.saGrSubmission),
      Number(entry.bastFinalValidation), entry.noSa, entry.nilaiSa,
    ];
    if (req.method === 'POST') {
      await pool.query(
        `INSERT INTO sphr01300a_billing_entries (
           id, period, pic, area, no_ro_spk, nilai_ro, nilai_actual, nilai_remaining, tanggal_submit_bast,
           bast_draft_vendor, bast_request_vendor, bast_review_reviewer1, bast_approval_approver,
           bast_reconfirm_vendor, sa_gr_submission, bast_final_validation, no_sa, nilai_sa
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ...values]
      );
    } else {
      const [result] = await pool.query(
        `UPDATE sphr01300a_billing_entries
            SET period = ?, pic = ?, area = ?, no_ro_spk = ?, nilai_ro = ?, nilai_actual = ?, nilai_remaining = ?,
                tanggal_submit_bast = ?, bast_draft_vendor = ?, bast_request_vendor = ?,
                bast_review_reviewer1 = ?, bast_approval_approver = ?, bast_reconfirm_vendor = ?,
                sa_gr_submission = ?, bast_final_validation = ?, no_sa = ?, nilai_sa = ?
          WHERE id = ?`,
        [...values, id]
      );
      if (Number(result?.affectedRows || 0) === 0) {
        const [existing] = await pool.query('SELECT id FROM sphr01300a_billing_entries WHERE id = ?', [id]);
        if (!existing?.length) {
          res.status(404).json({ ok: false, error: 'Data tidak ditemukan' });
          return;
        }
      }
    }
    res.status(req.method === 'POST' ? 201 : 200).json({ ok: true, entry: { id, ...entry } });
  } catch (error) {
    const message = String(error?.message || error);
    const isInputError = /wajib diisi|maksimal|bilangan bulat|Periode harus|id tidak valid/.test(message);
    res.status(isInputError ? 400 : 500).json({ ok: false, error: message });
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

// DANGEROUS: purge ALL app data in TiDB.
// Safety latch: require ?confirm=1.
app.delete('/api/budget-records/purge', async (req, res) => {
  const confirm = String(req.query?.confirm ?? '').trim();
  if (confirm !== '1') {
    res.status(400).json({ ok: false, error: 'Konfirmasi diperlukan. Panggil dengan ?confirm=1' });
    return;
  }

  try {
    await ensureBudgetRecordsTable();
    await ensureUploadHistoryTables();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [r1] = await conn.query('DELETE FROM budget_upload_batch_items');
      const [r2] = await conn.query('DELETE FROM budget_upload_batches');
      const [r3] = await conn.query('DELETE FROM budget_records');

      await conn.commit();
      res.json({
        ok: true,
        deletedItems: Number(r1?.affectedRows || 0),
        deletedBatches: Number(r2?.affectedRows || 0),
        deletedRecords: Number(r3?.affectedRows || 0),
      });
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
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/api/budget-records/upload', async (req, res) => {
  const input = req.body?.records;
  if (!Array.isArray(input)) {
    res.status(400).json({ ok: false, error: 'Body harus { records: BudgetRecord[] }' });
    return;
  }
  if (input.some(record => record?.projectId !== undefined && !['SPHR01031A', 'SPHR01300A'].includes(record.projectId))) {
    res.status(400).json({ ok: false, error: 'projectId harus SPHR01031A atau SPHR01300A' });
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
        'project_id',
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
          r.projectId,
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
          project_id=VALUES(project_id),
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
