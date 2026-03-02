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

app.post('/api/budget-records/upload', async (req, res) => {
  const input = req.body?.records;
  if (!Array.isArray(input)) {
    res.status(400).json({ ok: false, error: 'Body harus { records: BudgetRecord[] }' });
    return;
  }

  try {
    const normalized = input.map(normalizeRecord);

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

    res.json({ ok: true, received: input.length, affectedRows: inserted });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[TiDB API] listening on http://localhost:${PORT}`);
});
