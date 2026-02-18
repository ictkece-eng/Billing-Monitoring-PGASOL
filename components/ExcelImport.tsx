
import React, { useRef } from 'react';
import * as XLSX from 'xlsx';
import { BudgetRecord } from '../types';

interface ExcelImportProps {
  onImport: (data: BudgetRecord[]) => void;
}

const ExcelImport: React.FC<ExcelImportProps> = ({ onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        
        const jsonData = XLSX.utils.sheet_to_json(ws) as any[];

        if (jsonData.length === 0) {
          alert("File Excel kosong atau format tidak didukung.");
          return;
        }

        const mappedData: BudgetRecord[] = jsonData.map((row, index) => {
          // Normalisasi key agar case-insensitive dan tanpa spasi berlebih
          const normalizedRow: any = {};
          Object.keys(row).forEach(k => {
            const cleanKey = k.toLowerCase().replace(/\s+/g, ' ').trim();
            normalizedRow[cleanKey] = row[k];
          });

          const status = normalizedRow['status'] || 'On Progress';
          const namaUser = normalizedRow['nama user'] || normalizedRow['user'] || 'Unknown';
          const tim = normalizedRow['tim'] || normalizedRow['team'] || 'No Team';
          
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
          let nilaiTagihan = 0;
          const rawVal = normalizedRow['nilai tagihan'] || normalizedRow['nilai tagihan2'] || 0;

          nilaiTagihan = parseIdrInteger(rawVal);

          const status2 = normalizedRow['status2'] || normalizedRow['status billing'] || 'manual';

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
            status2: String(status2).trim(),
            emailSoftCopy: String(normalizedRow['kirim email soft copy'] || ''),
            saNo: String(normalizedRow['sa no'] || ''),
            tglKirimJKT: formatExcelValue(normalizedRow['tgl kirim ke jkt'] || ''),
            reviewerVendor: String(normalizedRow['reviewer i vendor'] || ''),
            keterangan: String(normalizedRow['keterangan2'] || normalizedRow['keterangan'] || ''),
          };
        });

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
