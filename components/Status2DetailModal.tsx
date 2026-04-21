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
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div className="modal fade show d-block" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-xl" role="document">
          <div className="modal-content border-0 shadow">
            <div
              className="modal-header border-0 pb-3"
              style={{ background: 'linear-gradient(135deg, rgba(13,110,253,0.07), rgba(79,70,229,0.05))' }}
            >
              <div className="d-flex flex-column">
                <div className="small text-uppercase text-muted fw-bold mb-1" style={{ letterSpacing: '.08em' }}>
                  Ringkasan Detail Status2
                </div>
                <h5 className="modal-title text-truncate fw-black" title={title}>{title}</h5>
                <div className="d-flex flex-wrap gap-2 mt-2">
                  <span className="badge border text-primary-emphasis bg-primary-subtle border-primary-subtle px-3 py-2">
                    Total: <span className="safe-number-inline tabular-nums">{formatCurrency(total)}</span>
                  </span>
                  <span className="badge text-bg-light border px-3 py-2">Baris: {rows.length}</span>
                  {hiddenCount > 0 && (
                    <span className="badge text-bg-warning-subtle border border-warning-subtle text-warning px-3 py-2">
                      Ditampilkan: {displayRows.length} (sisa {hiddenCount})
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-light border rounded-circle d-inline-flex align-items-center justify-content-center p-0 flex-shrink-0"
                style={{ width: 36, height: 36 }}
                aria-label="Tutup"
                title="Tutup (Esc)"
                onClick={onClose}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>

            <div className="modal-body pt-3">
              <div className="table-responsive border rounded-3">
                <div style={{ maxHeight: '68vh', overflow: 'auto' }}>
                  <table className="table table-sm table-hover table-striped align-middle mb-0" style={{ tableLayout: 'fixed', minWidth: 1140 }}>
                    <colgroup>
                      <col style={{ width: 56 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 180 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 190 }} />
                      <col style={{ width: 'auto' }} />
                    </colgroup>
                    <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr className="small text-uppercase text-muted" style={{ letterSpacing: '.06em' }}>
                        <th style={{ width: 56 }}>#</th>
                        <th>Periode</th>
                        <th>Tim</th>
                        <th>Nama User</th>
                        <th>No RO</th>
                        <th>No BAST</th>
                        <th className="text-end pe-3 text-primary-emphasis">Nilai Tagihan</th>
                        <th>Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center text-muted py-5">
                            Tidak ada data untuk status2 ini.
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((r, idx) => (
                          <tr key={r.id || `${idx}`}>
                            <td className="text-muted tabular-nums">{idx + 1}</td>
                            <td className="text-nowrap" title={r.periode}>{r.periode}</td>
                            <td className="fw-semibold text-break" title={r.tim}>{r.tim || '-'}</td>
                            <td className="fw-semibold text-break" title={r.namaUser}>{r.namaUser || '-'}</td>
                            <td className="text-nowrap text-truncate" style={{ maxWidth: 120 }} title={r.noRO || '-'}>{r.noRO || '-'}</td>
                            <td className="text-nowrap text-truncate" style={{ maxWidth: 150 }} title={r.noBAST || '-'}>{r.noBAST || '-'}</td>
                            <td className="text-end pe-3 align-middle" title={formatCurrency(r.nilaiTagihan)}>
                              <span
                                className="d-inline-block fw-bold font-monospace safe-number tabular-nums text-nowrap rounded-2 px-2 py-1 bg-primary-subtle text-primary-emphasis"
                                style={{ minWidth: 160, letterSpacing: '-0.01em' }}
                              >
                                {formatCurrency(r.nilaiTagihan)}
                              </span>
                            </td>
                            <td className="text-break" style={{ minWidth: 260, lineHeight: 1.4 }} title={r.keterangan || '-'}>{r.keterangan || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="small text-muted mt-3 d-flex flex-wrap align-items-center gap-2">
                <span className="badge rounded-pill text-bg-light border px-2 py-1">Tips</span>
                <span>Gunakan filter periode atau pencarian di atas untuk mempersempit data sebelum membuka popup.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Status2DetailModal;
