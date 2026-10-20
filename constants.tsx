
import { BudgetRecord, ProjectId } from './types';

// Diurutkan sesuai urutan kolom pada gambar screenshot pivot table user
export const STATUS_COLS = [
  'Invoice Internal',
  'po belum muncul',
  'REQ Reject by my ssc(PHR)',
  'REQ SA',
  'Review 1',
  'VOW'
];

// Nilai awal kontrak (Total Anggaran)
export const CONTRACT_VALUE_IDR = 185_068_724_480;

// Anggaran kontrak SPHR01300A (dipakai untuk menghitung % serapan dari Monitoring Billing)
export const SPHR01300A_CONTRACT_VALUE_IDR = 182_227_686_800;

export const PROJECTS: { id: ProjectId; label: string; contractValue: number | null }[] = [
  { id: 'SPHR01031A', label: 'SPHR01031A', contractValue: CONTRACT_VALUE_IDR },
  { id: 'SPHR01300A', label: 'SPHR01300A', contractValue: SPHR01300A_CONTRACT_VALUE_IDR },
];

// Data dikosongkan agar user bisa memulai dengan data bersih dari impor Excel
export const MOCK_DATA: BudgetRecord[] = [];

// Total Nilai RO Monitoring Billing mengikuti ringkasan workbook Excel per bulan.
// Pada umumnya semua baris (termasuk area FOD) ikut dijumlah, KECUALI periode yang
// daftarkan di bawah ini — mis. Agustus 2026 menyimpan nilai FOD sebagai teks sehingga
// Excel tidak menghitungnya ke TOTAL NILAI RO.
// Tambahkan periode lain di sini bila workbook-nya kembali mengecualikan baris FOD.
const PERIOD_EXCLUDES_FOD_RO = new Set(['2026-08']);

/**
 * Benarkah Total Nilai RO periode `period` ikut menghitung baris area FOD
 * (sesuai ringkasan workbook Excel bulan tersebut)?
 */
export const periodIncludesFodRo = (period: string): boolean =>
  !PERIOD_EXCLUDES_FOD_RO.has(String(period || '').trim());
