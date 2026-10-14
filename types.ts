
export type ProjectId = 'SPHR01031A' | 'SPHR01300A';

export interface Sphr01300aBillingEntry {
  id: string;
  period: string;
  pic: string;
  area: string;
  noRoSpk: string;
  nilaiRo: number;
  nilaiActual: number;
  tanggalSubmitBast: string;
  bastDraftVendor: boolean;
  bastRequestVendor: boolean;
  bastReviewReviewer1: boolean;
  bastApprovalApprover: boolean;
  bastReconfirmVendor: boolean;
  saGrSubmission: boolean;
  bastFinalValidation: boolean;
  noSa: string;
  nilaiSa: number;
}

export interface BudgetRecord {
  id: string;
  projectId?: ProjectId;
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

  /**
   * Optional: original Excel row number (1-based) when imported from Excel.
   * Used only for user-facing notifications; not persisted to TiDB.
   */
  sourceRow?: number;
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

export interface UploadHistoryEntry {
  id: string;
  createdAt: string;
  source?: string | null;
  received: number;
  clientReceived?: number | null;
  clientSentUnique?: number | null;
  clientSkippedDuplicates?: number | null;
  affectedRows?: number | null;
  note?: string | null;
}
