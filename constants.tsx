
import { BudgetRecord } from './types';

// Diurutkan sesuai urutan kolom pada gambar screenshot pivot table user
export const STATUS_COLS = [
  'Invoice Internal',
  'po belum muncul',
  'REQ Reject by my ssc(PHR)',
  'REQ SA',
  'Review 1',
  'VOW'
];

// Data dikosongkan agar user bisa memulai dengan data bersih dari impor Excel
export const MOCK_DATA: BudgetRecord[] = [];
