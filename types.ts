
export interface BudgetRecord {
  id: string;
  status: 'Completed' | 'On Progress' | 'Canceled';
  namaUser: string;
  tim: string;
  periode: string; // From 'Periode Bulan'
  nilaiTagihan: number;
  noRO: string;
  tglBAST: string;
  noBAST: string;
  status2: string;
  emailSoftCopy: string;
  saNo: string;
  tglKirimJKT: string;
  reviewerVendor: string;
  keterangan: string; // From 'Keterangan2'
}

export type Status2Type = 
  | 'Invoice Internal' 
  | 'po belum muncul' 
  | 'REQ Reject by my ssc(PHR)' 
  | 'REQ SA' 
  | 'Review 1' 
  | 'VOW'
  | 'manual';

export interface PivotRow {
  tim: string;
  namaUser: string;
  data: Record<string, number>;
  total: number;
}
