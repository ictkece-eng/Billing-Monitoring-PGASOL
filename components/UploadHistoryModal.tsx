import React, { useEffect, useMemo, useState } from 'react';
import type { UploadHistoryEntry } from '../types';
import { deleteUploadHistoryFromTiDB, fetchUploadHistoryFromTiDB, purgeAllTiDBData } from '../services/tidbService';

interface UploadHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

const fmtDateTime = (raw: string) => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('id-ID', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
};

const safeNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const UploadHistoryModal: React.FC<UploadHistoryModalProps> = ({ open, onClose }) => {
  const [rows, setRows] = useState<UploadHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const h = await fetchUploadHistoryFromTiDB(80, 0);
      setRows(h);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    load();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalUploads = rows.length;
  const totalReceived = useMemo(() => rows.reduce((acc, r) => acc + safeNum(r.received), 0), [rows]);

  if (!open) return null;

  const handleDelete = async (id: string) => {
    if (busyId || purging) return;
    const ok = confirm(
      'Yakin hapus history upload ini?\n\nCatatan: ini hanya menghapus RIWAYAT upload, tidak menghapus data budget_records di TiDB.'
    );
    if (!ok) return;

    setBusyId(id);
    try {
      await deleteUploadHistoryFromTiDB(id);
      await load();
    } catch (e: any) {
      alert(`Gagal menghapus history: ${String(e?.message || e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const handlePurgeAll = async () => {
    if (loading || busyId || purging) return;

    const ok1 = confirm(
      'PERINGATAN KERAS!\n\nAksi ini akan MENGHAPUS SEMUA DATA di TiDB yang dipakai aplikasi ini, termasuk:\n- budget_records (data utama)\n- budget_upload_batches (history)\n- budget_upload_batch_items\n\nLanjutkan?'
    );
    if (!ok1) return;

    const phrase = prompt('Ketik persis: HAPUS SEMUA', '');
    if (phrase !== 'HAPUS SEMUA') {
      alert('Dibatalkan. Teks konfirmasi tidak cocok.');
      return;
    }

    setPurging(true);
    try {
      const r = await purgeAllTiDBData();
      // Refresh history table (will become empty)
      await load();
      alert(
        `Berhasil purge data TiDB.\n\nDeleted budget_records: ${r.deletedRecords ?? 0}\nDeleted history batches: ${r.deletedBatches ?? 0}\nDeleted history items: ${r.deletedItems ?? 0}`
      );
    } catch (e: any) {
      alert(`Gagal purge data TiDB: ${String(e?.message || e)}`);
    } finally {
      setPurging(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div className="modal fade show d-block" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-xl" role="document">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <div className="d-flex flex-column">
                <h5 className="modal-title">History Upload TiDB</h5>
                <div className="d-flex flex-wrap gap-2 mt-2">
                  <span className="badge text-bg-light border">Total upload: {totalUploads}</span>
                  <span className="badge text-bg-light border">Total baris (received): {totalReceived}</span>
                </div>
                <div className="small text-muted mt-2">
                  Riwayat ini dicatat saat tombol <strong>Upload TiDB</strong> dipakai. Delete di sini hanya menghapus riwayat,
                  tidak menghapus data transaksi.
                </div>
                <div className="small text-danger mt-1">
                  Tombol <strong>Hapus Semua Data</strong> akan menghapus <strong>budget_records</strong> dan history. Pakai hanya jika benar-benar ingin reset database.
                </div>
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  onClick={load}
                  disabled={loading || purging}
                  className="btn btn-sm btn-outline-secondary"
                  title="Refresh"
                >
                  {loading ? 'Loading…' : purging ? 'Purging…' : 'Refresh'}
                </button>
                <button
                  onClick={handlePurgeAll}
                  disabled={loading || purging || Boolean(busyId)}
                  className="btn btn-sm btn-outline-danger"
                  title="Hapus semua data TiDB (berbahaya)"
                >
                  Hapus Semua Data
                </button>
                <button type="button" className="btn-close" aria-label="Tutup" title="Tutup (Esc)" onClick={onClose} />
              </div>
            </div>

            <div className="modal-body">
              <div className="table-responsive border rounded-3">
                <div style={{ maxHeight: '68vh', overflow: 'auto' }}>
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr className="small text-uppercase text-muted" style={{ letterSpacing: '.06em' }}>
                        <th style={{ width: 56 }}>#</th>
                        <th>Waktu</th>
                        <th>Received</th>
                        <th>Sent unik</th>
                        <th>Skip duplikat</th>
                        <th>affectedRows</th>
                        <th>Source</th>
                        <th>Batch ID</th>
                        <th className="text-end" style={{ width: 92 }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center text-muted py-5">
                            {loading
                              ? 'Memuat history…'
                              : 'Belum ada history upload (atau TiDB API belum aktif / belum ada akses DB).'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, idx) => {
                          const sentUniq = r.clientSentUnique ?? null;
                          const skipped = r.clientSkippedDuplicates ?? null;
                          return (
                            <tr key={r.id}>
                              <td className="text-muted tabular-nums">{idx + 1}</td>
                              <td className="text-nowrap">{fmtDateTime(r.createdAt)}</td>
                              <td className="tabular-nums">{safeNum(r.received)}</td>
                              <td className="tabular-nums">{sentUniq === null ? '-' : sentUniq}</td>
                              <td className="tabular-nums">{skipped === null ? '-' : skipped}</td>
                              <td className="tabular-nums">{r.affectedRows ?? '-'}</td>
                              <td>{r.source || '-'}</td>
                              <td className="font-monospace text-nowrap" title={r.id}>{r.id.slice(0, 10)}…</td>
                              <td className="text-end">
                                <button
                                  onClick={() => handleDelete(r.id)}
                                  disabled={busyId === r.id}
                                  className={`btn btn-sm ${busyId === r.id ? 'btn-secondary disabled' : 'btn-outline-danger'}`}
                                  title="Hapus history (tidak menghapus data transaksi)"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="small text-muted mt-2">
                Catatan: field <strong>Sent unik</strong> & <strong>Skip duplikat</strong> hanya terisi jika upload dilakukan dari UI versi terbaru (mengirim meta).
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default UploadHistoryModal;
