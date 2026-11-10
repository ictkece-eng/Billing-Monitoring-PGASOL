import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Sphr01300aBillingEntry } from '../types';
import { fetchSphr01300aEntries, replaceSphr01300aEntries } from '../services/sphr01300aService';

const MONTHS = [
  { period: '2026-08', label: 'Agustus 2026', filenameMonth: 'agustus' },
  { period: '2026-09', label: 'September 2026', filenameMonth: 'september' },
  { period: '2026-10', label: 'Oktober 2026', filenameMonth: 'oktober' },
] as const;

type EntryDraft = Omit<Sphr01300aBillingEntry, 'id'>;
type StageKey = Exclude<keyof EntryDraft, 'period' | 'pic' | 'area' | 'noRoSpk' | 'nilaiRo' | 'nilaiActual' | 'nilaiRemaining' | 'tanggalSubmitBast' | 'noSa' | 'nilaiSa'>;
type MonthCount = Record<string, number>;

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[\u00a0\r\n]+/g, ' ')
    .replace(/[^a-z0-9]/g, '');

const parseAmount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const raw = String(value ?? '').replace(/[^\d,.-]/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',') && raw.includes('.')
    ? (raw.lastIndexOf(',') > raw.lastIndexOf('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, ''))
    : raw.replace(/,/g, '');
  const amount = Number(normalized);
  return Number.isSafeInteger(Math.trunc(amount)) ? Math.trunc(amount) : 0;
};

const parseBoolean = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'x', '✓', '✔', 'done', 'completed'].includes(normalized);
};

const parseDate = (value: unknown): string => {
  if (typeof value === 'number' && value > 20000) {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${String(date.d).padStart(2, '0')}-${String(date.m).padStart(2, '0')}-${date.y}`;
    }
  }
  return String(value ?? '').trim();
};

const findColumn = (headers: string[], matches: (header: string) => boolean) =>
  headers.findIndex(header => matches(header));

const parseMonthlyWorkbook = (workbook: XLSX.WorkBook, period: string): EntryDraft[] => {
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true }) as unknown[][];
    const headerRowIndex = rows.findIndex(row => {
      const headers = row.map(normalizeHeader);
      return headers.includes('pic')
        && headers.includes('area')
        && headers.includes('norospk')
        && headers.some(header => /^nilair[o0]$/.test(header));
    });
    if (headerRowIndex < 0) continue;

    const headers = rows[headerRowIndex].map((_, columnIndex) =>
      [0, 1, 2]
        .map(offset => normalizeHeader(rows[headerRowIndex + offset]?.[columnIndex]))
        .filter(Boolean)
        .join('')
    );
    const picColumn = headers.indexOf('pic');
    const areaColumn = headers.indexOf('area');
    const roColumn = headers.indexOf('norospk');
    const nilaiRoColumn = findColumn(headers, header => /^nilair[o0]$/.test(header));
    const actualColumn = findColumn(headers, header => /^nilaiactual$/.test(header));
    const remainingColumn = findColumn(headers, header => header.startsWith('remaining') || header.startsWith('remining'));
    const noSaColumn = headers.indexOf('nosa');
    const nilaiSaColumn = headers.indexOf('nilaisa');
    const submitDateColumn = findColumn(headers, header => header.includes('tanggalsubmitdraftbast'));

    const stageColumns: Array<[StageKey, (header: string) => boolean]> = [
      ['bastDraftVendor', header => header.includes('bastdraftbyvendor')],
      ['bastRequestVendor', header => header.includes('bastrequestbyvendor')],
      ['bastReviewReviewer1', header => header.includes('bastreview')],
      ['bastApprovalApprover', header => header.includes('bastapprovalbyapprover')],
      ['bastReconfirmVendor', header => header.includes('bastreconfirmationbyvendor')],
      ['saGrSubmission', header => header.includes('sagrsubmission')],
      ['bastFinalValidation', header => header.includes('bastfinalvalidation')],
    ];
    const stageIndexes = stageColumns.map(([key, matches]) => [key, findColumn(headers, matches)] as const);

    const entries = rows.slice(headerRowIndex + 1).flatMap((row, rowOffset) => {
      const pic = String(row[picColumn] ?? '').trim();
      const area = String(row[areaColumn] ?? '').trim();
      if (!pic && !area) return [];
      if (!pic || !area) {
        throw new Error(`Baris ${headerRowIndex + rowOffset + 2} memiliki PIC atau AREA kosong.`);
      }
      const nilaiRo = parseAmount(row[nilaiRoColumn]);
      const nilaiActual = parseAmount(actualColumn >= 0 ? row[actualColumn] : 0);
      const nilaiRemaining = remainingColumn >= 0 && row[remainingColumn] !== null
        ? parseAmount(row[remainingColumn])
        : nilaiRo - nilaiActual;
      const entry: EntryDraft = {
        period,
        pic,
        area,
        noRoSpk: String(row[roColumn] ?? '').trim(),
        nilaiRo,
        nilaiActual,
        nilaiRemaining,
        tanggalSubmitBast: submitDateColumn >= 0 ? parseDate(row[submitDateColumn]) : '',
        bastDraftVendor: false,
        bastRequestVendor: false,
        bastReviewReviewer1: false,
        bastApprovalApprover: false,
        bastReconfirmVendor: false,
        saGrSubmission: false,
        bastFinalValidation: false,
        noSa: noSaColumn >= 0 ? String(row[noSaColumn] ?? '').trim() : '',
        nilaiSa: parseAmount(nilaiSaColumn >= 0 ? row[nilaiSaColumn] : 0),
      };
      for (const [key, columnIndex] of stageIndexes) {
        if (columnIndex >= 0) entry[key] = parseBoolean(row[columnIndex]);
      }
      return [entry];
    });
    if (entries.length === 0) throw new Error('Tabel ditemukan tetapi tidak berisi baris billing.');
    return entries;
  }
  throw new Error('Workbook tidak memiliki tabel Monitoring Billing dengan header PIC, AREA, NO RO/SPK, dan NILAI RO.');
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);

interface Sphr01300aWorkbookCardProps {
  canImport: boolean;
  refreshKey: number;
  onEntriesChanged: () => void;
}

const Sphr01300aWorkbookCard: React.FC<Sphr01300aWorkbookCardProps> = ({ canImport, refreshKey, onEntriesChanged }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [counts, setCounts] = useState<MonthCount>({});
  const [error, setError] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(MONTHS[0].period);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(MONTHS.map(async month => {
      const entries = await fetchSphr01300aEntries(month.period);
      return [month.period, entries.length] as const;
    }))
      .then(result => {
        if (!cancelled) {
          setCounts(Object.fromEntries(result));
          setError('');
        }
      })
      .catch(reason => {
        if (!cancelled) setError(`Gagal memuat ringkasan bulan: ${String(reason?.message || reason)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const importMonth = async (period: string, file?: File) => {
    if (!file) return;
    const month = MONTHS.find(item => item.period === period);
    if (!month) return;
    setError('');
    setLoading(true);
    try {
      if (!normalizeHeader(file.name).includes(normalizeHeader(month.filenameMonth))) {
        throw new Error(`Pilih file ${month.label} (nama file harus memuat "${month.filenameMonth}").`);
      }
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const entries = parseMonthlyWorkbook(workbook, period);
      const amountRo = entries.reduce((sum, entry) => sum + entry.nilaiRo, 0);
      const amountActual = entries.reduce((sum, entry) => sum + entry.nilaiActual, 0);
      const confirmMessage = [
        `Ganti data ${month.label}?`,
        `${entries.length} baris akan disimpan.`,
        `Total Nilai RO: ${formatCurrency(amountRo)}.`,
        `Total Nilai Actual: ${formatCurrency(amountActual)}.`,
        `Data lama bulan ini (jika ada): ${counts[period] || 0} baris.`,
      ].join('\n');
      if (!window.confirm(confirmMessage)) return;

      const replaced = await replaceSphr01300aEntries(period, entries);
      setCounts(previous => ({ ...previous, [period]: replaced }));
      onEntriesChanged();
      alert(`Impor ${month.label} berhasil: ${replaced} baris.`);
    } catch (reason) {
      setError(`Impor ${month.label} gagal: ${String(reason?.message || reason)}`);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section className="card shadow-sm border-0 mb-4" aria-labelledby="sphr-workbook-title">
      <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h2 id="sphr-workbook-title" className="h6 fw-bold mb-1">Impor Monitoring Billing SPHR01300A</h2>
          <div className="small text-muted">Pilih file Excel sesuai bulan; impor hanya mengganti data pada periode tersebut.</div>
        </div>
        <span className="badge text-bg-light border">Pagu tetap Rp 182.227.686.800</span>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger py-2 small" role="alert">{error}</div>}
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-5">
            <label htmlFor="sphr01300a-import-period" className="form-label small fw-semibold">Bulan data</label>
            <select
              id="sphr01300a-import-period"
              className="form-select"
              value={selectedPeriod}
              onChange={event => setSelectedPeriod(event.target.value)}
              disabled={loading}
            >
              {MONTHS.map(month => <option key={month.period} value={month.period}>{month.label}</option>)}
            </select>
            <div className="form-text">{counts[selectedPeriod] ?? '—'} baris tersimpan untuk bulan ini</div>
          </div>
          <div className="col-12 col-md-auto">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="d-none"
              onChange={event => void importMonth(selectedPeriod, event.target.files?.[0])}
              disabled={!canImport || loading}
            />
            <button
              type="button"
              className="btn btn-outline-success"
              onClick={() => inputRef.current?.click()}
              disabled={!canImport || loading}
              title={canImport ? `Pilih file ${MONTHS.find(month => month.period === selectedPeriod)?.label}` : 'Masuk Admin untuk mengimpor'}
            >
              <i className="bi bi-file-earmark-arrow-up me-1" aria-hidden="true" />
              {loading ? 'Memproses…' : 'Pilih Excel & Impor'}
            </button>
          </div>
        </div>
        {!canImport && <div className="form-text mt-2">Masuk Admin untuk mengaktifkan tombol impor bulanan.</div>}
      </div>
    </section>
  );
};

export default Sphr01300aWorkbookCard;
