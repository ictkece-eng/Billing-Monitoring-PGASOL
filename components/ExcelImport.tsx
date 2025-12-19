
import React, { useRef } from 'react';
import * as XLSX from 'xlsx';
import { BudgetRecord } from '../types';

interface ExcelImportProps {
  onImport: (data: BudgetRecord[]) => void;
}

const ExcelImport: React.FC<ExcelImportProps> = ({ onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const jsonData = XLSX.utils.sheet_to_json(ws) as any[];

        if (jsonData.length === 0) {
          alert("File Excel kosong atau format tidak didukung.");
          return;
        }

        const mappedData: BudgetRecord[] = jsonData.map((row, index) => {
          const normalizedRow: any = {};
          Object.keys(row).forEach(k => {
            normalizedRow[k.toLowerCase().trim()] = row[k];
          });

          const status = normalizedRow['status'] || 'On Progress';
          const namaUser = normalizedRow['nama user'] || normalizedRow['user'] || 'Unknown';
          const tim = normalizedRow['tim'] || normalizedRow['team'] || 'No Team';
          const periode = normalizedRow['periode bulan'] || normalizedRow['periode'] || '-';
          
          let nilaiTagihan = 0;
          const rawVal = normalizedRow['nilai tagihan'] || normalizedRow['nilai tagihan2'] || 0;
          
          if (typeof rawVal === 'string') {
            const cleaned = rawVal.replace(/Rp/gi, '').replace(/[^0-9]/g, '');
            nilaiTagihan = Number(cleaned);
          } else {
            nilaiTagihan = Number(rawVal);
          }

          const status2 = normalizedRow['status2'] || normalizedRow['status billing'] || 'manual';

          return {
            id: `excel-${Date.now()}-${index}`,
            status: status as BudgetRecord['status'],
            namaUser: String(namaUser).trim(),
            tim: String(tim).trim(),
            periode: String(periode).trim(),
            nilaiTagihan: isNaN(nilaiTagihan) ? 0 : nilaiTagihan,
            noRO: String(normalizedRow['no ro'] || ''),
            tglBAST: String(normalizedRow['tgl bast-submit bast by ivend'] || ''),
            noBAST: String(normalizedRow['no bast / id vendor'] || ''),
            status2: String(status2).trim(),
            emailSoftCopy: String(normalizedRow['kirim email soft copy'] || ''),
            saNo: String(normalizedRow['sa no'] || ''),
            tglKirimJKT: String(normalizedRow['tgl kirim ke jkt'] || ''),
            reviewerVendor: String(normalizedRow['reviewer i vendor'] || ''),
            keterangan: String(normalizedRow['keterangan2'] || normalizedRow['keterangan'] || ''),
          };
        });

        onImport(mappedData);
      } catch (err) {
        console.error(err);
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
