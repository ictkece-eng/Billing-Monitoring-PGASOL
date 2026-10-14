import type { Sphr01300aBillingEntry } from '../types';

type EntriesResponse = {
  ok: boolean;
  entries?: Sphr01300aBillingEntry[];
  entry?: Sphr01300aBillingEntry;
  error?: string;
};

const request = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown, period?: string) => {
  const query = period ? `?period=${encodeURIComponent(period)}` : '';
  const response = await fetch(`/api/sphr01300a/entries${query}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  const result = await response.json() as EntriesResponse;
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Permintaan data SPHR01300A gagal (HTTP ${response.status})`);
  }
  return result;
};

export const fetchSphr01300aEntries = async (period: string): Promise<Sphr01300aBillingEntry[]> => {
  const result = await request('GET', undefined, period);
  return Array.isArray(result.entries) ? result.entries : [];
};

export const createSphr01300aEntry = async (entry: Omit<Sphr01300aBillingEntry, 'id'>) => {
  const result = await request('POST', { entry });
  if (!result.entry) throw new Error('Server tidak mengembalikan data yang disimpan');
  return result.entry;
};

export const updateSphr01300aEntry = async (id: string, entry: Omit<Sphr01300aBillingEntry, 'id'>) => {
  const result = await request('PUT', { id, entry });
  if (!result.entry) throw new Error('Server tidak mengembalikan data yang diperbarui');
  return result.entry;
};

export const deleteSphr01300aEntry = async (id: string) => {
  await request('DELETE', { id });
};
