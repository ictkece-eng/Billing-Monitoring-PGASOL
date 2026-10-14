import crypto from 'crypto';
import { ensureSphr01300aBillingTable, getPool } from '../_db.js';
import { readJsonBody } from '../_body.js';

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const TEXT_FIELDS = {
  pic: 255,
  area: 255,
  noRoSpk: 128,
  tanggalSubmitBast: 32,
  noSa: 128,
};

const readText = (value, field, required = false) => {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (required && !text) throw new Error(`${field} wajib diisi`);
  if (text.length > TEXT_FIELDS[field]) throw new Error(`${field} maksimal ${TEXT_FIELDS[field]} karakter`);
  return text;
};

const readAmount = (value, field) => {
  const amount = value === '' || value === undefined || value === null ? 0 : Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`${field} harus bilangan bulat positif atau nol`);
  return amount;
};

const readBoolean = (value) => value === true || value === 1 || value === '1';

const normalizeEntry = (raw) => {
  const period = String(raw?.period || '').trim();
  if (!PERIOD_PATTERN.test(period)) throw new Error('Periode harus berformat YYYY-MM');
  return {
    period,
    pic: readText(raw?.pic, 'PIC', true),
    area: readText(raw?.area, 'Area', true),
    noRoSpk: readText(raw?.noRoSpk, 'No RO/SPK'),
    nilaiRo: readAmount(raw?.nilaiRo, 'Nilai RO'),
    nilaiActual: readAmount(raw?.nilaiActual, 'Nilai Actual'),
    tanggalSubmitBast: readText(raw?.tanggalSubmitBast, 'Tanggal Submit BAST'),
    bastDraftVendor: readBoolean(raw?.bastDraftVendor),
    bastRequestVendor: readBoolean(raw?.bastRequestVendor),
    bastReviewReviewer1: readBoolean(raw?.bastReviewReviewer1),
    bastApprovalApprover: readBoolean(raw?.bastApprovalApprover),
    bastReconfirmVendor: readBoolean(raw?.bastReconfirmVendor),
    saGrSubmission: readBoolean(raw?.saGrSubmission),
    bastFinalValidation: readBoolean(raw?.bastFinalValidation),
    noSa: readText(raw?.noSa, 'No SA'),
    nilaiSa: readAmount(raw?.nilaiSa, 'Nilai SA'),
  };
};

const toApiEntry = (row) => ({
  id: String(row.id),
  period: String(row.period),
  pic: String(row.pic || ''),
  area: String(row.area || ''),
  noRoSpk: String(row.noRoSpk || ''),
  nilaiRo: Number(row.nilaiRo),
  nilaiActual: Number(row.nilaiActual),
  tanggalSubmitBast: String(row.tanggalSubmitBast || ''),
  bastDraftVendor: Boolean(Number(row.bastDraftVendor)),
  bastRequestVendor: Boolean(Number(row.bastRequestVendor)),
  bastReviewReviewer1: Boolean(Number(row.bastReviewReviewer1)),
  bastApprovalApprover: Boolean(Number(row.bastApprovalApprover)),
  bastReconfirmVendor: Boolean(Number(row.bastReconfirmVendor)),
  saGrSubmission: Boolean(Number(row.saGrSubmission)),
  bastFinalValidation: Boolean(Number(row.bastFinalValidation)),
  noSa: String(row.noSa || ''),
  nilaiSa: Number(row.nilaiSa),
});

export default async function handler(req, res) {
  try {
    const pool = getPool();
    await ensureSphr01300aBillingTable(pool);

    if (req.method === 'GET') {
      const period = String(req.query?.period || '').trim();
      if (!PERIOD_PATTERN.test(period)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'Periode harus berformat YYYY-MM' }));
        return;
      }
      const [rows] = await pool.query(
        `SELECT id, period, pic, area, no_ro_spk AS noRoSpk,
                CAST(nilai_ro AS SIGNED) AS nilaiRo,
                CAST(nilai_actual AS SIGNED) AS nilaiActual,
                tanggal_submit_bast AS tanggalSubmitBast,
                bast_draft_vendor AS bastDraftVendor,
                bast_request_vendor AS bastRequestVendor,
                bast_review_reviewer1 AS bastReviewReviewer1,
                bast_approval_approver AS bastApprovalApprover,
                bast_reconfirm_vendor AS bastReconfirmVendor,
                sa_gr_submission AS saGrSubmission,
                bast_final_validation AS bastFinalValidation,
                no_sa AS noSa, CAST(nilai_sa AS SIGNED) AS nilaiSa
           FROM sphr01300a_billing_entries
          WHERE period = ?
          ORDER BY area, pic, id`,
        [period]
      );
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, entries: (rows || []).map(toApiEntry) }));
      return;
    }

    const body = await readJsonBody(req);
    if (req.method === 'POST' || req.method === 'PUT') {
      const entry = normalizeEntry(body?.entry);
      const id = req.method === 'PUT' ? String(body?.id || '').trim() : crypto.randomUUID();
      if (!id || id.length > 36) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'id tidak valid' }));
        return;
      }
      const values = [
        entry.period, entry.pic, entry.area, entry.noRoSpk, entry.nilaiRo, entry.nilaiActual,
        entry.tanggalSubmitBast, Number(entry.bastDraftVendor), Number(entry.bastRequestVendor),
        Number(entry.bastReviewReviewer1), Number(entry.bastApprovalApprover),
        Number(entry.bastReconfirmVendor), Number(entry.saGrSubmission),
        Number(entry.bastFinalValidation), entry.noSa, entry.nilaiSa,
      ];
      if (req.method === 'POST') {
        await pool.query(
          `INSERT INTO sphr01300a_billing_entries (
             id, period, pic, area, no_ro_spk, nilai_ro, nilai_actual, tanggal_submit_bast,
             bast_draft_vendor, bast_request_vendor, bast_review_reviewer1, bast_approval_approver,
             bast_reconfirm_vendor, sa_gr_submission, bast_final_validation, no_sa, nilai_sa
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, ...values]
        );
      } else {
        const [result] = await pool.query(
          `UPDATE sphr01300a_billing_entries
              SET period = ?, pic = ?, area = ?, no_ro_spk = ?, nilai_ro = ?, nilai_actual = ?,
                  tanggal_submit_bast = ?, bast_draft_vendor = ?, bast_request_vendor = ?,
                  bast_review_reviewer1 = ?, bast_approval_approver = ?, bast_reconfirm_vendor = ?,
                  sa_gr_submission = ?, bast_final_validation = ?, no_sa = ?, nilai_sa = ?
            WHERE id = ?`,
          [...values, id]
        );
        if (Number(result?.affectedRows || 0) === 0) {
          const [rows] = await pool.query('SELECT id FROM sphr01300a_billing_entries WHERE id = ?', [id]);
          if (!rows?.length) {
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false, error: 'Data tidak ditemukan' }));
            return;
          }
        }
      }
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = req.method === 'POST' ? 201 : 200;
      res.end(JSON.stringify({ ok: true, entry: { id, ...entry } }));
      return;
    }

    if (req.method === 'DELETE') {
      const id = String(body?.id || '').trim();
      if (!id || id.length > 36) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'id tidak valid' }));
        return;
      }
      const [result] = await pool.query('DELETE FROM sphr01300a_billing_entries WHERE id = ?', [id]);
      if (Number(result?.affectedRows || 0) === 0) {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: 'Data tidak ditemukan' }));
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.end('Method Not Allowed');
  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = error instanceof Error && /wajib|maksimal|bilangan|Periode|id tidak valid/.test(error.message) ? 400 : 500;
    res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  }
}
