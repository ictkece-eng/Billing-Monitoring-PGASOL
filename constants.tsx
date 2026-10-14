
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

export const PROJECTS: { id: ProjectId; label: string; contractValue: number | null }[] = [
  { id: 'SPHR01031A', label: 'SPHR01031A', contractValue: CONTRACT_VALUE_IDR },
  { id: 'SPHR01300A', label: 'SPHR01300A', contractValue: null },
];

// Data dikosongkan agar user bisa memulai dengan data bersih dari impor Excel
export const MOCK_DATA: BudgetRecord[] = [];
