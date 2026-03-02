import type { BudgetRecord } from '../types';

type UploadResponse = {
  ok: boolean;
  received?: number;
  affectedRows?: number;
  error?: string;
};

type FetchResponse = {
  ok: boolean;
  records?: BudgetRecord[];
  error?: string;
};

export const uploadBudgetRecordsToTiDB = async (records: BudgetRecord[]) => {
  // Use relative URL so Vite proxy can forward in dev.
  const res = await fetch('/api/budget-records/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });

  const data = (await res.json()) as UploadResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Upload gagal (HTTP ${res.status})`);
  }
  return data;
};

export const fetchBudgetRecordsFromTiDB = async (): Promise<BudgetRecord[]> => {
  const res = await fetch('/api/budget-records');
  const data = (await res.json()) as FetchResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Fetch gagal (HTTP ${res.status})`);
  }
  return data.records || [];
};
