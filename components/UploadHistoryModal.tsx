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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <button aria-label="Tutup" className="absolute inset-0 cursor-default" onClick={onClose} />

      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900 leading-tight truncate" title="History Upload TiDB">
              History Upload TiDB
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-1 tabular-nums">
                Total upload: {totalUploads}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-1 tabular-nums">
                Total baris (received): {totalReceived}
              </span>
              <button
                onClick={load}
                disabled={loading || purging}
                className={`text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-1 border tabular-nums transition-colors ${
                  loading || purging
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                title="Refresh"
              >
                {loading ? 'Loading…' : purging ? 'Purging…' : 'Refresh'}
              </button>

              <button
                onClick={handlePurgeAll}
                disabled={loading || purging || Boolean(busyId)}
                className={`text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-1 border tabular-nums transition-colors ${
                  loading || purging || Boolean(busyId)
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
                title="Hapus semua data TiDB (berbahaya)"
              >
                Hapus Semua Data
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              Riwayat ini dicatat saat tombol <span className="font-semibold">Upload TiDB</span> dipakai. Aksi delete di sini hanya
              menghapus riwayat, tidak menghapus data transaksi yang sudah tersimpan.
            </p>
            <p className="mt-1 text-[10px] text-rose-700">
              Tombol <span className="font-semibold">Hapus Semua Data</span> akan menghapus <span className="font-semibold">budget_records</span>
              dan history. Pakai hanya jika benar-benar ingin reset database.
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex-none inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
            aria-label="Tutup"
            title="Tutup (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <div className="max-h-[68vh] overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-slate-200">
                  <tr className="text-left text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    <th className="px-3 py-2 w-[56px]">#</th>
                    <th className="px-3 py-2 min-w-[160px]">Waktu</th>
                    <th className="px-3 py-2 min-w-[90px]">Received</th>
                    <th className="px-3 py-2 min-w-[110px]">Sent unik</th>
                    <th className="px-3 py-2 min-w-[120px]">Skip duplikat</th>
                    <th className="px-3 py-2 min-w-[120px]">affectedRows</th>
                    <th className="px-3 py-2 min-w-[110px]">Source</th>
                    <th className="px-3 py-2 min-w-[170px]">Batch ID</th>
                    <th className="px-3 py-2 w-[92px] text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
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
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{idx + 1}</td>
                          <td className="px-3 py-2 text-slate-800 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                          <td className="px-3 py-2 text-slate-700 tabular-nums">{safeNum(r.received)}</td>
                          <td className="px-3 py-2 text-slate-700 tabular-nums">{sentUniq === null ? '-' : sentUniq}</td>
                          <td className="px-3 py-2 text-slate-700 tabular-nums">{skipped === null ? '-' : skipped}</td>
                          <td className="px-3 py-2 text-slate-700 tabular-nums">{r.affectedRows ?? '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{r.source || '-'}</td>
                          <td className="px-3 py-2 text-slate-600 font-mono text-[11px] whitespace-nowrap" title={r.id}>
                            {r.id.slice(0, 10)}…
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={busyId === r.id}
                              className={`inline-flex items-center justify-center px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                busyId === r.id
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                              }`}
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

          <p className="mt-3 text-[10px] text-slate-500">
            Catatan: field <span className="font-semibold">Sent unik</span> & <span className="font-semibold">Skip duplikat</span> hanya
            terisi jika upload dilakukan dari UI yang sudah versi terbaru (mengirim meta).
          </p>
        </div>
      </div>
    </div>
  );
};

export default UploadHistoryModal;
