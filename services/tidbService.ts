import type { BudgetRecord } from '../types';

type UploadResponse = {
  ok: boolean;
  received?: number;
  sentUnique?: number;
  skippedDuplicates?: number;
  affectedRows?: number;
  error?: string;
};

type FetchResponse = {
  ok: boolean;
  records?: BudgetRecord[];
  error?: string;
};

type ExistResponse = {
  ok: boolean;
  exists?: boolean[];
  error?: string;
};

const safeStr = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const safeInt = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const n = Number(String(v ?? '').replace(/[^0-9\-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

// Must match backend fingerprint inputs (order + normalization) to ensure dedupe behavior is consistent.
const fingerprintKey = (r: BudgetRecord) => {
  const parts = [
    safeStr(r.namaUser).trim().toLowerCase(),
    safeStr(r.tim).trim().toLowerCase(),
    safeStr(r.periode).trim().toLowerCase(),
    String(safeInt(r.nilaiTagihan || 0)),
    safeStr(r.noRO).trim().toLowerCase(),
    safeStr(r.tglBAST).trim().toLowerCase(),
    safeStr(r.noBAST).trim().toLowerCase(),
    safeStr(r.status2).trim().toLowerCase(),
    safeStr(r.saNo).trim().toLowerCase(),
    safeStr(r.keterangan).trim().toLowerCase(),
  ];
  return parts.join('|');
};

const dedupeRecordsForUpload = (records: BudgetRecord[]) => {
  const seen = new Set<string>();
  const unique: BudgetRecord[] = [];
  for (const r of records) {
    const k = fingerprintKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(r);
  }
  return {
    unique,
    skippedDuplicates: Math.max(records.length - unique.length, 0),
  };
};

export const getTiDBDuplicateStats = async (records: BudgetRecord[]) => {
  // Build fingerprint keys that match backend hashing logic.
  const keys = records.map(fingerprintKey);
  const uniqueKeys = Array.from(new Set(keys));

  // If API is not available, just return null (non-breaking).
  try {
    const res = await fetch('/api/budget-records/exist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprints: uniqueKeys }),
    });
    const data = (await res.json()) as ExistResponse;
    if (!res.ok || !data.ok || !Array.isArray(data.exists)) {
      return null;
    }

    // Map uniqueKey -> exists
    const existsMap = new Map<string, boolean>();
    for (let i = 0; i < uniqueKeys.length; i++) {
      existsMap.set(uniqueKeys[i], Boolean(data.exists[i]));
    }

    const duplicatedUnique = uniqueKeys.reduce((acc, k) => acc + (existsMap.get(k) ? 1 : 0), 0);
    const duplicatedRows = keys.reduce((acc, k) => acc + (existsMap.get(k) ? 1 : 0), 0);

    return {
      duplicatedRows,
      duplicatedUnique,
      checkedRows: keys.length,
      checkedUnique: uniqueKeys.length,
    };
  } catch {
    return null;
  }
};

const chunkArray = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const uniqNumbers = (nums: number[]) => Array.from(new Set(nums)).filter(n => Number.isFinite(n));

/**
 * Returns which imported Excel row numbers (sourceRow) already exist in TiDB.
 * Non-breaking: returns null if API is unavailable.
 */
export const getTiDBDuplicateRowNumbers = async (records: BudgetRecord[]) => {
  const keys = records.map(fingerprintKey);
  const uniqueKeys = Array.from(new Set(keys));

  try {
    // Keep request bodies reasonably small; backend also has its own cap.
    const existsMap = new Map<string, boolean>();
    for (const part of chunkArray(uniqueKeys, 4000)) {
      const res = await fetch('/api/budget-records/exist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprints: part }),
      });
      const data = (await res.json()) as ExistResponse;
      if (!res.ok || !data.ok || !Array.isArray(data.exists)) {
        return null;
      }
      for (let i = 0; i < part.length; i++) {
        existsMap.set(part[i], Boolean(data.exists[i]));
      }
    }

    const duplicatedUnique = uniqueKeys.reduce((acc, k) => acc + (existsMap.get(k) ? 1 : 0), 0);

    const duplicatedRowNumbers: number[] = [];
    let duplicatedRows = 0;
    for (let i = 0; i < records.length; i++) {
      const k = keys[i];
      if (!existsMap.get(k)) continue;
      duplicatedRows++;
      const sr = (records[i] as any)?.sourceRow;
      if (typeof sr === 'number' && Number.isFinite(sr)) duplicatedRowNumbers.push(sr);
    }

    return {
      duplicatedRows,
      duplicatedUnique,
      checkedRows: keys.length,
      checkedUnique: uniqueKeys.length,
      duplicatedRowNumbers: uniqNumbers(duplicatedRowNumbers).sort((a, b) => a - b),
    };
  } catch {
    return null;
  }
};

export const uploadBudgetRecordsToTiDB = async (records: BudgetRecord[]) => {
  const { unique, skippedDuplicates } = dedupeRecordsForUpload(records);

  // Use relative URL so Vite proxy can forward in dev.
  const res = await fetch('/api/budget-records/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: unique }),
  });

  const data = (await res.json()) as UploadResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Upload gagal (HTTP ${res.status})`);
  }
  return {
    ...data,
    sentUnique: unique.length,
    skippedDuplicates,
  };
};

export const fetchBudgetRecordsFromTiDB = async (): Promise<BudgetRecord[]> => {
  const res = await fetch('/api/budget-records');
  const data = (await res.json()) as FetchResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Fetch gagal (HTTP ${res.status})`);
  }
  return data.records || [];
};
