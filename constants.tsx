
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
