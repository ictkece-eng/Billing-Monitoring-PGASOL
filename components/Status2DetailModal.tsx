import React, { useEffect, useMemo } from 'react';
import { BudgetRecord } from '../types';

interface Status2DetailModalProps {
  open: boolean;
  title: string;
  rows: BudgetRecord[];
  total: number;
  formatCurrency: (val: number) => string;
  onClose: () => void;
}

const MAX_RENDER_ROWS = 1000;

const Status2DetailModal: React.FC<Status2DetailModalProps> = ({
  open,
  title,
  rows,
  total,
  formatCurrency,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const displayRows = useMemo(() => rows.slice(0, MAX_RENDER_ROWS), [rows]);
  const hiddenCount = rows.length - displayRows.length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <button
        aria-label="Tutup"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900 leading-tight truncate" title={title}>
              {title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-1">
                Total: <span className="safe-number-inline tabular-nums text-slate-900">{formatCurrency(total)}</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-1 tabular-nums">
                Baris: {rows.length}
              </span>
              {hiddenCount > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 tabular-nums">
                  Ditampilkan: {displayRows.length} (sisa {hiddenCount})
                </span>
              )}
            </div>
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
                    <th className="px-3 py-2 min-w-[110px]">Periode</th>
                    <th className="px-3 py-2 min-w-[160px]">Tim</th>
                    <th className="px-3 py-2 min-w-[160px]">Nama User</th>
                    <th className="px-3 py-2 min-w-[140px]">No RO</th>
                    <th className="px-3 py-2 min-w-[140px]">No BAST</th>
                    <th className="px-3 py-2 min-w-[170px] text-right">Nilai Tagihan</th>
                    <th className="px-3 py-2 min-w-[260px]">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                        Tidak ada data untuk status2 ini.
                      </td>
                    </tr>
                  ) : (
                    displayRows.map((r, idx) => (
                      <tr key={r.id || `${idx}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-500 tabular-nums">{idx + 1}</td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.periode}</td>
                        <td className="px-3 py-2 text-slate-800 font-semibold">{r.tim}</td>
                        <td className="px-3 py-2 text-slate-800 font-semibold">{r.namaUser}</td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.noRO || '-'}</td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.noBAST || '-'}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-900 safe-number tabular-nums whitespace-nowrap" title={formatCurrency(r.nilaiTagihan)}>
                          {formatCurrency(r.nilaiTagihan)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          <div className="max-w-[520px] break-words">{r.keterangan || '-'}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-slate-500">
            Tips: gunakan filter periode/pencarian di atas untuk mempersempit data sebelum membuka popup.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Status2DetailModal;
