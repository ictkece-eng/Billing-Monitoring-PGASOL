import crypto from 'crypto';
import { ensureBudgetRecordsTable, ensureUploadHistoryTables, getPool } from '../_db.js';
import { readJsonBody } from '../_body.js';

const safeStr = (v) => (v === undefined || v === null ? '' : String(v));
const safeInt = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9\-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
};

const fingerprint = (r) => {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }

  try {
    const body = await readJsonBody(req);
    const input = body?.records;
    const meta = body?.meta || {};

    if (!Array.isArray(input)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Body harus { records: BudgetRecord[] }' }));
      return;
    }

    const pool = getPool();
    await ensureBudgetRecordsTable(pool);
    const normalized = input.map(normalizeRecord);

    const uploadBatchId = crypto.randomBytes(16).toString('hex');

    const toIntOrNull = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    const clientReceived = toIntOrNull(meta.clientReceived);
    const clientSentUnique = toIntOrNull(meta.clientSentUnique);
    const clientSkippedDuplicates = toIntOrNull(meta.clientSkippedDuplicates);
    const note = meta.note ? String(meta.note).slice(0, 255) : null;

    const CHUNK = 500;
    let affectedTotal = 0;

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

      const placeholders = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');

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
      affectedTotal += Number(result?.affectedRows || 0);
    }

    // Non-breaking: write upload history if possible, but do not fail the upload if history fails.
    try {
      await ensureUploadHistoryTables(pool);
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
          affectedTotal,
          note,
        ]
      );

      for (let i = 0; i < normalized.length; i += CHUNK) {
        const part = normalized.slice(i, i + CHUNK);
        if (part.length === 0) continue;
        const placeholders = part.map(() => '(?, ?)').join(',');
        const values2 = [];
        for (const r of part) values2.push(uploadBatchId, r.id);
        await pool.query(
          `INSERT IGNORE INTO budget_upload_batch_items (upload_id, record_id) VALUES ${placeholders}`,
          values2
        );
      }
    } catch {
      // ignore
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, received: input.length, affectedRows: affectedTotal, uploadBatchId }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
