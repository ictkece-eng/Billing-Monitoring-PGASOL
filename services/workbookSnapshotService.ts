export type WorkbookSnapshotKey = 'dashboard' | 'workflow';
export type WorkbookSnapshots = Partial<Record<WorkbookSnapshotKey, unknown>>;

interface WorkbookSnapshotsResponse {
  ok: boolean;
  snapshots?: WorkbookSnapshots;
  error?: string;
}

export const fetchWorkbookSnapshots = async (): Promise<WorkbookSnapshots> => {
  const response = await fetch('/api/workbook-snapshots', { cache: 'no-store' });
  const result = await response.json() as WorkbookSnapshotsResponse;
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Gagal memuat workbook bersama (HTTP ${response.status})`);
  }
  return result.snapshots || {};
};

export const saveWorkbookSnapshot = async (key: WorkbookSnapshotKey, payload: unknown) => {
  const response = await fetch('/api/workbook-snapshots', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, payload }),
  });
  const result = await response.json() as WorkbookSnapshotsResponse;
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Gagal menyimpan workbook bersama (HTTP ${response.status})`);
  }
};
