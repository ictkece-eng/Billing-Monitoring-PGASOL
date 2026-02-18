
import React, { useRef } from 'react';
import * as XLSX from 'xlsx';
import { BudgetRecord } from '../types';
import { STATUS_COLS } from '../constants';

interface ExcelImportProps {
  onImport: (data: BudgetRecord[]) => void;
}

const ExcelImport: React.FC<ExcelImportProps> = ({ onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizeStatus2Key = (s: any) => String(s ?? '').trim().toLowerCase();

  const canonicalizeStatus2 = (raw: any): string => {
    const s = String(raw ?? '').trim();
    const key = normalizeStatus2Key(s);

    // Treat empty and common placeholders as manual
    if (!key || key === '-' || key === '—' || key === '–' || key === 'n/a' || key === 'na' || key === 'null') {
      return 'manual';
    }

    // Map case-insensitively to known pivot columns
    const canonical = STATUS_COLS.find(col => normalizeStatus2Key(col) === key);
    return canonical || s;
  };

  /**
   * Parse currency/number strings into an integer amount (IDR).
   * Handles common Excel exports such as:
   * - "Rp 65.934.189.945"
   * - "65.934.189.945"
   * - "65,934,189,945"
   * - "65934189945"
   * NOTE: The app treats nilaiTagihan as an integer (no cents).
   */
  const parseIdrInteger = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    // XLSX may return numbers as floats (or scientific notation already materialized).
    // This app treats nilaiTagihan as integer IDR, so truncate to avoid float artifacts.
    if (typeof val === 'number') return Number.isFinite(val) ? Math.trunc(val) : 0;

    const raw = String(val).trim();
    if (!raw) return 0;

    // 1) Scientific notation (Excel sometimes renders big numbers like 1.2345E+11)
    // Keep only number-related chars then parse.
    if (/[eE]/.test(raw)) {
      const sci = raw
        .replace(/Rp/gi, '')
        .replace(/\s+/g, '')
        .replace(/[^0-9eE+\-\.]/g, '');
      const nSci = Number(sci);
      if (Number.isFinite(nSci)) return Math.trunc(nSci);
    }

    // 2) Normal currency/number strings: remove everything except digits, keep sign if present.
    // This handles: "Rp 65.934.189.945" / "65,934,189,945" etc.
    const isNegative = /^\s*-/.test(raw);
    const digits = raw.replace(/\D/g, '');
    if (!digits) return 0;
    const n = Number(digits);
    if (!Number.isFinite(n)) return 0;
    return isNegative ? -n : n;
  };

  /**
   * Fungsi untuk memformat nilai dari Excel menjadi string yang konsisten (DD-MM-YYYY).
   * Menangani: Date Object, Excel Serial Number, dan Date Strings.
   */
  const formatExcelValue = (val: any): string => {
    if (val === undefined || val === null || val === '') return '-';
    
    let dateObj: Date | null = null;

    // 1. Jika sudah berupa Date object
    if (val instanceof Date) {
      dateObj = val;
    } 
    // 2. Jika berupa angka (Excel Serial Date)
    else if (typeof val === 'number') {
      // Excel epoch starts at Dec 30, 1899
      dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    }
    // 3. Jika berupa string yang berisi angka (Serial Date dalam bentuk string)
    else if (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val.trim())) {
      const num = parseFloat(val);
      if (num > 30000) { // Angka di atas 30rb biasanya adalah representasi tanggal Excel
        dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
      }
    }
    // 4. Jika berupa string tanggal umum (e.g. "2025-01-15" atau "01/15/2025")
    else if (typeof val === 'string' && val.trim() !== '-') {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) {
        dateObj = new Date(parsed);
      }
    }

    // Jika berhasil dikonversi menjadi Date yang valid
    if (dateObj && !isNaN(dateObj.getTime())) {
      const d = dateObj.getDate().toString().padStart(2, '0');
      const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const y = dateObj.getFullYear();
      return `${d}-${m}-${y}`;
    }

    return String(val).trim();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        // Gunakan cellDates: false untuk mendapatkan nilai mentah, lalu diproses manual
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        // ===== Row-by-row parsing (lebih stabil untuk file dengan header ganda / kolom terpisah Rp + angka) =====
        const normalizeHeader = (h: any) => String(h ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
        const headerToCompact = (h: any) => normalizeHeader(h).replace(/\s+/g, '');
        const headerToAlnum = (h: any) => normalizeHeader(h).replace(/[^a-z0-9]/g, '');

        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];

        const mappedData: BudgetRecord[] = [];
        if (aoa.length > 1) {
          const headers = aoa[0] || [];
          const headerMeta = headers.map((h, idx) => ({
            idx,
            norm: normalizeHeader(h),
            compact: headerToCompact(h),
            alnum: headerToAlnum(h),
          }));

          const findColsByAlnumPrefix = (prefixAlnum: string) =>
            headerMeta.filter(m => m.alnum && m.alnum.startsWith(prefixAlnum)).map(m => m.idx);

          const findFirstCol = (candidates: string[]) => {
            for (const c of candidates) {
              const cAlnum = headerToAlnum(c);
              if (!cAlnum) continue;
              const found = headerMeta.find(m => m.alnum === cAlnum);
              if (found) return found.idx;
            }
            return undefined as number | undefined;
          };

          const getCell = (row: any[], colIdx: number | undefined) => (colIdx === undefined ? undefined : row[colIdx]);

          const getFirstNonEmpty = (row: any[], colIdxs: number[]) => {
            for (const idx of colIdxs) {
              const v = row[idx];
              if (v === undefined || v === null) continue;
              const s = String(v).trim();
              if (s !== '') return v;
            }
            return undefined;
          };

          const pickBestNumberFromCols = (row: any[], colIdxs: number[]) => {
            let best = 0;
            let has = false;
            for (const idx of colIdxs) {
              const v = row[idx];
              const n = parseIdrInteger(v);
              if (!has) {
                best = n;
                has = true;
                continue;
              }
              if (Math.abs(n) > Math.abs(best)) best = n;
            }
            return has ? best : 0;
          };

          // Column candidates (exact matches first)
          const colStatus = findFirstCol(['status']);
          const colNamaUser = findFirstCol(['nama user', 'user', 'nama']);
          const colTim = findFirstCol(['tim', 'team']);

          // Periode bisa ada sebagai "periode bulan" / "periode (bulan)" / "periode"
          const colPeriodeExact = findFirstCol(['periode bulan', 'periode (bulan)', 'periode']);
          const periodePrefixCols = [...new Set([
            ...findColsByAlnumPrefix('periodebulan'),
            ...findColsByAlnumPrefix('periode'),
          ])];

          // Nilai tagihan sering terpecah: "Rp" + angka + kolom lain (mis scientific)
          const nilaiPrefixCols = [...new Set([
            ...findColsByAlnumPrefix('nilaitagihan'),
            ...findColsByAlnumPrefix('nilai'),
          ])];

          // Status2/billing status
          const colStatus2Exact = findFirstCol(['status2', 'status 2', 'status billing', 'billing status']);
          const status2PrefixCols = [...new Set([
            ...findColsByAlnumPrefix('status2'),
            ...findColsByAlnumPrefix('statusbilling'),
          ])];

          // Optional columns
          const colNoRO = findFirstCol(['no ro', 'no.ro', 'ro']);
          const colTglBAST = findFirstCol(['tgl bast', 'tanggal bast', 'tgl bast submit', 'tgl bast-submit bast by ivend']);
          const colNoBAST = findFirstCol(['no bast', 'no bast / id vendor', 'id vendor']);
          const colEmailSoftCopy = findFirstCol(['kirim email soft copy']);
          const colSaNo = findFirstCol(['sa no']);
          const colTglKirimJKT = findFirstCol(['tgl kirim ke jkt']);
          const colReviewerVendor = findFirstCol(['reviewer i vendor']);
          const colKeterangan = findFirstCol(['keterangan2', 'keterangan']);

          for (let rIdx = 1; rIdx < aoa.length; rIdx++) {
            const row = aoa[rIdx] || [];
            const isEmpty = row.every(v => String(v ?? '').trim() === '');
            if (isEmpty) continue;

            const statusRaw = getCell(row, colStatus);
            const namaUserRaw = getCell(row, colNamaUser);
            const timRaw = getCell(row, colTim);

            const periodeRaw = colPeriodeExact !== undefined
              ? getCell(row, colPeriodeExact)
              : getFirstNonEmpty(row, periodePrefixCols);

            const nilaiTagihan = pickBestNumberFromCols(row, nilaiPrefixCols);

            const status2Raw = colStatus2Exact !== undefined
              ? getCell(row, colStatus2Exact)
              : getFirstNonEmpty(row, status2PrefixCols);

            mappedData.push({
              id: `excel-${Date.now()}-${rIdx}`,
              status: (String(statusRaw ?? '').trim() || 'On Progress') as BudgetRecord['status'],
              namaUser: String(namaUserRaw ?? 'Unknown').trim(),
              tim: String(timRaw ?? 'No Team').trim(),
              periode: formatExcelValue(periodeRaw ?? '-'),
              nilaiTagihan,
              noRO: String(getCell(row, colNoRO) ?? ''),
              tglBAST: formatExcelValue(getCell(row, colTglBAST) ?? ''),
              noBAST: String(getCell(row, colNoBAST) ?? ''),
              status2: canonicalizeStatus2(status2Raw ?? 'manual'),
              emailSoftCopy: String(getCell(row, colEmailSoftCopy) ?? ''),
              saNo: String(getCell(row, colSaNo) ?? ''),
              tglKirimJKT: formatExcelValue(getCell(row, colTglKirimJKT) ?? ''),
              reviewerVendor: String(getCell(row, colReviewerVendor) ?? ''),
              keterangan: String(getCell(row, colKeterangan) ?? ''),
            });
          }
        }

        // Fallback: object-based parsing (older templates)
        if (mappedData.length === 0) {
          const jsonData = XLSX.utils.sheet_to_json(ws) as any[];
          if (jsonData.length === 0) {
            alert("File Excel kosong atau format tidak didukung.");
            return;
          }

          const fallbackData: BudgetRecord[] = jsonData.map((row, index) => {
            // Normalisasi key agar case-insensitive dan tanpa spasi berlebih
            const normalizedRow: any = {};
            Object.keys(row).forEach(k => {
              const cleanKey = k.toLowerCase().replace(/\s+/g, ' ').trim();
              normalizedRow[cleanKey] = row[k];
            });

            // Index tambahan untuk mengatasi variasi header Excel seperti:
            // - "Status 2" vs "Status2"
            // - "Nilai Tagihan (Rp)" / "Nilai Tagihan Rp" / "Nilai Tagihan"
            // Kunci dibuat lebih "kompak" (hapus spasi) dan "alnum" (hapus non [a-z0-9]).
            const keyIndex: Record<string, any> = {};
            for (const k of Object.keys(normalizedRow)) {
              const v = normalizedRow[k];
              const compact = k.replace(/\s+/g, '');
              const alnum = k.replace(/[^a-z0-9]/g, '');
              if (!(compact in keyIndex)) keyIndex[compact] = v;
              if (!(alnum in keyIndex)) keyIndex[alnum] = v;
            }

            const findByPrefix = (prefix: string) => {
              // Cari keyIndex yang dimulai prefix (mis: "nilaitagihan" -> "nilaitagihanrp")
              const keys = Object.keys(keyIndex);
              for (const kk of keys) {
                if (kk.startsWith(prefix)) return keyIndex[kk];
              }
              return undefined;
            };

            const status = normalizedRow['status'] || keyIndex['status'] || 'On Progress';
            const namaUser = normalizedRow['nama user'] || normalizedRow['user'] || keyIndex['namauser'] || keyIndex['user'] || 'Unknown';
            const tim = normalizedRow['tim'] || normalizedRow['team'] || keyIndex['tim'] || keyIndex['team'] || 'No Team';
            
            // Deteksi kolom Periode
            const rawPeriode = normalizedRow['periode bulan'] || normalizedRow['periode'] || '-';
            const periode = formatExcelValue(rawPeriode);

            // Deteksi kolom Tgl BAST dengan berbagai variasi nama kolom yang mungkin
            const rawBAST = 
              normalizedRow['tgl bast-submit bast by ivend'] || 
              normalizedRow['tgl bast'] || 
              normalizedRow['tanggal bast'] || 
              normalizedRow['tgl bast submit'] || 
              '';
            const tglBAST = formatExcelValue(rawBAST);
            
            // Proses Nilai Tagihan
            const rawVal =
              normalizedRow['nilai tagihan'] ||
              normalizedRow['nilai tagihan2'] ||
              keyIndex['nilaitagihan'] ||
              keyIndex['nilaitagihan2'] ||
              findByPrefix('nilaitagihan') ||
              0;

            const nilaiTagihan = parseIdrInteger(rawVal);

            const status2 =
              normalizedRow['status2'] ||
              normalizedRow['status 2'] ||
              normalizedRow['status billing'] ||
              keyIndex['status2'] ||
              keyIndex['statusbilling'] ||
              keyIndex['statusbilling2'] ||
              findByPrefix('status2') ||
              findByPrefix('statusbilling') ||
              'manual';

            return {
              id: `excel-${Date.now()}-${index}`,
              status: status as BudgetRecord['status'],
              namaUser: String(namaUser).trim(),
              tim: String(tim).trim(),
              periode: periode,
              nilaiTagihan,
              noRO: String(normalizedRow['no ro'] || ''),
              tglBAST: tglBAST,
              noBAST: String(normalizedRow['no bast / id vendor'] || normalizedRow['no bast'] || ''),
              status2: canonicalizeStatus2(status2),
              emailSoftCopy: String(normalizedRow['kirim email soft copy'] || ''),
              saNo: String(normalizedRow['sa no'] || ''),
              tglKirimJKT: formatExcelValue(normalizedRow['tgl kirim ke jkt'] || ''),
              reviewerVendor: String(normalizedRow['reviewer i vendor'] || ''),
              keterangan: String(normalizedRow['keterangan2'] || normalizedRow['keterangan'] || ''),
            };
          });

          onImport(fallbackData);
          return;
        }

        onImport(mappedData);
      } catch (err) {
        console.error("Excel Import Error:", err);
        alert("Gagal membaca file Excel. Pastikan format kolom sesuai.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md shadow-emerald-100"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Impor Excel
      </button>
    </div>
  );
};

export default ExcelImport;
