import React, { useEffect, useMemo, useState } from 'react';
import type { Sphr01300aBillingEntry } from '../types';
import {
  createSphr01300aEntry,
  deleteSphr01300aEntry,
  deleteSphr01300aEntriesByPeriod,
  fetchSphr01300aEntries,
  updateSphr01300aEntry,
} from '../services/sphr01300aService';

type EntryDraft = Omit<Sphr01300aBillingEntry, 'id'>;
type StatusField =
  | 'bastDraftVendor'
  | 'bastRequestVendor'
  | 'bastReviewReviewer1'
  | 'bastApprovalApprover'
  | 'bastReconfirmVendor'
  | 'saGrSubmission'
  | 'bastFinalValidation';

const STATUS_FIELDS: { key: StatusField; label: string }[] = [
  { key: 'bastDraftVendor', label: 'BAST Draft by Vendor' },
  { key: 'bastRequestVendor', label: 'BAST Request by Vendor' },
  { key: 'bastReviewReviewer1', label: 'BAST Review by Reviewer 1' },
  { key: 'bastApprovalApprover', label: 'BAST Approval by Approver' },
  { key: 'bastReconfirmVendor', label: 'BAST Reconfirmation by Vendor' },
  { key: 'saGrSubmission', label: 'SA/GR Submission Reviewer 1' },
  { key: 'bastFinalValidation', label: 'BAST Final Validation Reviewer 1' },
];

const STATUS_OWNERS = ['PGASOL', 'PGASOL', 'PHR 1', 'PHR 2', 'PGASOL', 'PHR 1', 'PHR 1'];

const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const createEmptyDraft = (period: string): EntryDraft => ({
  period,
  pic: '',
  area: '',
  noRoSpk: '',
  nilaiRo: 0,
  nilaiActual: 0,
  nilaiRemaining: 0,
  tanggalSubmitBast: '',
  bastDraftVendor: false,
  bastRequestVendor: false,
  bastReviewReviewer1: false,
  bastApprovalApprover: false,
  bastReconfirmVendor: false,
  saGrSubmission: false,
  bastFinalValidation: false,
  noSa: '',
  nilaiSa: 0,
});

const formatCurrency = (amount: number) => {
  const value = amount || 0;
  const sign = value < 0 ? '-Rp ' : 'Rp ';
  return `${sign}${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(value))}`;
};

const includeInSummaryRo = (entry: Sphr01300aBillingEntry) =>
  !/^FOD\b/i.test(entry.area.trim());

const formatPeriod = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  if (!year || month < 1 || month > 12) return period;
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};

interface Sphr01300aBillingPageProps {
  canEdit: boolean;
  onBack: () => void;
}

const Sphr01300aBillingPage: React.FC<Sphr01300aBillingPageProps> = ({ canEdit, onBack }) => {
  const [period, setPeriod] = useState(currentPeriod);
  const [entries, setEntries] = useState<Sphr01300aBillingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStatusIds, setSavingStatusIds] = useState<Set<string>>(() => new Set());
  const [deletingPeriod, setDeletingPeriod] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [statusFilters, setStatusFilters] = useState<Record<StatusField, boolean>>({ bastDraftVendor: false, bastRequestVendor: false, bastReviewReviewer1: false, bastApprovalApprover: false, bastReconfirmVendor: false, saGrSubmission: false, bastFinalValidation: false });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntries([]);
    fetchSphr01300aEntries(period)
      .then(rows => {
        if (!cancelled) setEntries(rows);
      })
      .catch(reason => {
        if (!cancelled) setError(String(reason?.message || reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const totals = useMemo(
    () => {
      const summaryRoEntries = entries.filter(includeInSummaryRo);
      const sums = entries.reduce(
        (sum, entry) => ({
          actual: sum.actual + entry.nilaiActual,
          sa: sum.sa + entry.nilaiSa,
        }),
        { actual: 0, sa: 0 }
      );
      const ro = summaryRoEntries.reduce((sum, entry) => sum + entry.nilaiRo, 0);
      return {
        ...sums,
        ro,
        remaining: ro - sums.actual,
        excludedRoRows: entries.length - summaryRoEntries.length,
      };
    },
    [entries, statusFilters]
  );

  // Filter entries based on status checkbox filters  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Check each status field against its filter
      return STATUS_FIELDS.every(field => {
        const entryValue = entry[field.key];
        const filterValue = statusFilters[field.key];
        // If filter is not set (undefined/null), include the entry
        if (!filterValue) return true;
        // If filter is set, entry must match
        return entryValue === filterValue;
      });
    });
  }, [entries, statusFilters]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(createEmptyDraft(period));
  };

  const openEdit = (entry: Sphr01300aBillingEntry) => {
    const { id, ...values } = entry;
    setEditingId(id);
    setDraft({ ...values });
  };

  const closeForm = () => {
    if (saving) return;
    setDraft(null);
    setEditingId(null);
  };

  const saveEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = editingId
        ? await updateSphr01300aEntry(editingId, draft)
        : await createSphr01300aEntry(draft);
      setEntries(previous => editingId
        ? previous.map(entry => entry.id === saved.id ? saved : entry)
        : [...previous, saved].sort((a, b) => a.area.localeCompare(b.area) || a.pic.localeCompare(b.pic)));
      setDraft(null);
      setEditingId(null);
    } catch (reason) {
      setError(String(reason?.message || reason));
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (entry: Sphr01300aBillingEntry) => {
    if (!window.confirm(`Hapus data ${entry.area} (${entry.noRoSpk || 'tanpa No RO/SPK'}) dari ${formatPeriod(period)}?`)) return;
    setError(null);
    try {
      await deleteSphr01300aEntry(entry.id);
      setEntries(previous => previous.filter(row => row.id !== entry.id));
    } catch (reason) {
      setError(String(reason?.message || reason));
    }
  };

  const toggleStatus = async (entry: Sphr01300aBillingEntry, field: StatusField, checked: boolean) => {
    if (!canEdit || deletingPeriod || savingStatusIds.has(entry.id)) return;
    setSavingStatusIds(previous => new Set(previous).add(entry.id));
    setError(null);
    try {
      const saved = await updateSphr01300aEntry(entry.id, { ...entry, [field]: checked });
      setEntries(previous => previous.map(row => row.id === saved.id ? saved : row));
    } catch (reason) {
      setError(String(reason?.message || reason));
    } finally {
      setSavingStatusIds(previous => {
        const next = new Set(previous);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const removePeriodEntries = async () => {
    if (deletingPeriod || entries.length === 0) return;
    const periodLabel = formatPeriod(period);
    if (!window.confirm(`Hapus semua ${entries.length} data billing periode ${periodLabel}? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeletingPeriod(true);
    setError(null);
    try {
      await deleteSphr01300aEntriesByPeriod(period);
      setEntries([]);
    } catch (reason) {
      setError(String(reason?.message || reason));
    } finally {
      setDeletingPeriod(false);
    }
  };

  const updateDraft = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) => {
    setDraft(previous => {
      if (!previous) return previous;
      const next = { ...previous, [key]: value };
      if (
        (key === 'nilaiRo' || key === 'nilaiActual') &&
        previous.nilaiRemaining === previous.nilaiRo - previous.nilaiActual
      ) {
        next.nilaiRemaining = next.nilaiRo - next.nilaiActual;
      }
      return next;
    });
  };

  return (
    <section className={`sphr-billing-page${expanded ? ' sphr-billing-page--expanded' : ''}`}>
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body p-3 p-md-4">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
            <div className="d-flex align-items-center gap-3">
              <div className="bg-gradient-to-br from-blue-700 to-indigo-800 rounded-4 shadow-lg" style="width:58px; height:58px;">
                <i className="bi bi-currency-rupiah fs-4 text-white"></i>
              </div>
              <div>
                <div className="small text-muted fw-semibold text-uppercase">Proyek SPHR01300A</div>
                <h2 className="h3 fw-bold mb-0">Monitoring Billing</h2>
                <p className="text-muted mb-0">Input manual Bulan SKU SPHR01300A</p>
              </div>
            </div>
            <div className="d-flex gap-2 align-items-end flex-wrap">
              <div className="d-flex gap-2">
                <div className="position-relative">
                  <label htmlFor="sphr-period" className="form-label small fw-semibold mb-0 text-muted">Periode</label>
            <input
              id="sphr-period"
              type="month"
              className="form-control"
              value={period}
              disabled={deletingPeriod}
              onChange={event => setPeriod(event.target.value)}
            />
          </div>
          <div className="d-flex gap-2">
            {STATUS_FIELDS.map(field => (
              <label key={field.key} className="form-check form-check-inline">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={statusFilters[field.key] || false}
                  onChange={event => {
                    setStatusFilters(prev => ({
                      ...prev,
                      [field.key]: event.target.checked,
                    }));
                  }}
                  title={`Filter berdasarkan: ${field.label}`}
                  aria-label={`Filter ${field.label}`}
                />                <span className="form-check-label small">{field.label}</span>              </label>
            ))}
          </div>
          <button type="button" className="btn btn-outline-secondary" onClick={onBack}>
            Kembali
          </button>
        </div>
      </div>

      <div className="row g-3 mb-4">{[
          { label: 'Total Nilai RO', amount: totals.ro, color: 'border-primary' },
          { label: 'Total Nilai Actual', amount: totals.actual, color: 'border-success' },
        ].map(item => (
          <div className="col-12 col-sm-6 col-xl-4" key={item.label}>
            <div className={`card h-100 border-start border-4 ${item.color} shadow-sm`}>              <div className="card-body py-3">                <div className="small text-muted text-uppercase fw-bold">{item.label}</div>                <div className="fs-5 fw-bold mt-1">{formatCurrency(item.amount)}</div>              </div>            </div>          </div>        ))}
      </div>
      <p className="small text-muted mb-3">        Total Nilai RO mengikuti ringkasan workbook dan tidak memasukkan baris area FOD; semua baris tetap disimpan dan ditampilkan. Remaining dihitung dari Total Nilai RO dikurangi Total Nilai Actual.      </p>

      <div className="card shadow-sm border-0">
        <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2 py-3">
          <div>
            <div className="fw-bold">{formatPeriod(period)}</div>
            <div className="small text-muted">{entries.length} baris input</div>
          </div>
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={openCreate} disabled={loading || deletingPeriod}>
              <i className="bi bi-plus-lg me-2" aria-hidden="true" />
              Tambah Baris
            </button>
          )}
          {canEdit && entries.length > 0 && (
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={() => void removePeriodEntries()}
              disabled={loading || deletingPeriod}
            >
              <i className="bi bi-trash me-2" aria-hidden="true" />
              {deletingPeriod ? 'Menghapus Periode...' : 'Hapus Semua Bulan Ini'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setExpanded(value => !value)}
            aria-pressed={expanded}
            title={expanded ? 'Kembalikan tabel ke ukuran normal' : 'Perlebar area tabel ke layar penuh'}
          >
            <i className={`bi ${expanded ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'} me-2`} aria-hidden="true" />
            {expanded ? 'Tutup Layar Penuh' : 'Perlebar Tabel'}
          </button>
        </div>
        {error && <div className="alert alert-danger rounded-0 mb-0" role="alert">{error}</div>}
        {loading ? (
          <div className="p-4 text-center text-muted">Memuat data periode...</div>
        ) : (
          <div className="table-responsive sphr-billing-table-wrap">
            <table className="table table-bordered table-sm align-middle mb-0 sphr-billing-table">
              <colgroup>
                <col style={{ width: 110 }} />
                <col style={{ width: 230 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 150 }} />
                {STATUS_FIELDS.map(field => <col key={field.key} style={{ width: 140 }} />)}
                <col style={{ width: 150 }} />
                <col style={{ width: 170 }} />
                {canEdit && <col style={{ width: 90 }} />}
              </colgroup>
              <thead className="table-secondary text-center">
                <tr>
                  <th rowSpan={3}>PIC</th>
                  <th rowSpan={3}>AREA</th>
                  <th rowSpan={3}>NO RO/SPK</th>
                  <th rowSpan={3}>NILAI RO</th>
                  <th rowSpan={3}>Nilai Actual</th>
                  <th rowSpan={3}>Remaining<br />Ro - Actual</th>
                  <th colSpan={8}>PROSES BAST di system iVendor</th>
                  <th rowSpan={3}>NO SA</th>
                  <th rowSpan={3}>NILAI SA</th>
                  {canEdit && <th rowSpan={3}>AKSI</th>}
                </tr>
                <tr>
                  <th rowSpan={2}>Tanggal<br />Submit Draft BAST</th>
                  {STATUS_FIELDS.map(field => <th key={field.key}>{field.label}</th>)}
                </tr>
                <tr>
                  {STATUS_FIELDS.map((field, index) => (
                    <th key={field.key}>{STATUS_OWNERS[index]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, index) => (
                  <tr key={entry.id}>
                    <td>{entry.pic}</td>
                    <td>{entry.area}</td>
                    <td>{entry.noRoSpk}</td>
                    <td className="text-end text-nowrap">{formatCurrency(entry.nilaiRo)}</td>
                    <td className="text-end text-nowrap">{formatCurrency(entry.nilaiActual)}</td>
                    <td className={`text-end text-nowrap${entry.nilaiRemaining < 0 ? ' text-danger fw-bold' : ''}`}>
                      {formatCurrency(entry.nilaiRemaining)}
                    </td>
                    <td className="text-center text-nowrap">{entry.tanggalSubmitBast}</td>
                    {STATUS_FIELDS.map(field => (
                      <td className="text-center" key={field.key}>
                        <input
                          type="checkbox"
                          checked={entry[field.key]}
                          disabled={!canEdit || deletingPeriod || savingStatusIds.has(entry.id)}
                          onChange={event => void toggleStatus(entry, field.key, event.target.checked)}
                          aria-label={`${field.label}, baris ${index + 1}`}
                          title={canEdit ? 'Klik untuk mengubah status' : 'Masuk Admin untuk mengubah status'}
                        />
                      </td>
                    ))}
                    <td>{entry.noSa}</td>
                    <td className="text-end text-nowrap">{formatCurrency(entry.nilaiSa)}</td>
                    {canEdit && (
                      <td className="text-nowrap">
                        <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(entry)} disabled={deletingPeriod} aria-label={`Edit baris ${index + 1}`}>
                          <i className="bi bi-pencil" aria-hidden="true" />
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void removeEntry(entry)} disabled={deletingPeriod} aria-label={`Hapus baris ${index + 1}`}>
                          <i className="bi bi-trash" aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 17 : 16} className="text-center text-muted py-5">
                      Belum ada data untuk {formatPeriod(period)} dengan filter yang dipilih.
                      {canEdit && <span className="d-block mt-1">Klik “Tambah Baris” untuk mulai mengisi.</span>}
                    </td>
                  </tr>
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot className="table-light fw-bold">
                  <tr>
                    <td colSpan={3}>TOTAL</td>
                    <td className="text-end text-nowrap">{formatCurrency(totals.ro)}</td>
                    <td className="text-end text-nowrap">{formatCurrency(totals.actual)}</td>
                    <td className="text-end text-nowrap">{formatCurrency(totals.remaining)}</td>
                    <td colSpan={8} />
                    <td />
                    <td className="text-end text-nowrap">{formatCurrency(totals.sa)}</td>
                    {canEdit && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {draft && (
        <>
          <div className="modal-backdrop fade show" onClick={closeForm} />
          <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="sphr-entry-title">
            <div className="modal-dialog modal-xl modal-dialog-scrollable" role="document">
              <div className="modal-content border-0 shadow">
                <form onSubmit={event => void saveEntry(event)}>
                  <div className="modal-header">
                    <div>
                      <h3 className="modal-title fs-5 fw-bold" id="sphr-entry-title">{editingId ? 'Edit Baris Billing' : 'Tambah Baris Billing'}</h3>
                      <div className="small text-muted">{formatPeriod(period)}</div>
                    </div>
                    <button type="button" className="btn-close" aria-label="Tutup" onClick={closeForm} disabled={saving} />
                  </div>
                  <div className="modal-body">
                    <div className="row g-3">
                      {([
                        { key: 'pic', label: 'PIC', required: true },
                        { key: 'area', label: 'Area', required: true },
                        { key: 'noRoSpk', label: 'No RO/SPK' },
                        { key: 'nilaiRo', label: 'Nilai RO', amount: true },
                        { key: 'nilaiActual', label: 'Nilai Actual', amount: true },
                        { key: 'nilaiRemaining', label: 'Remaining RO - Actual', amount: true, allowNegative: true },
                        { key: 'tanggalSubmitBast', label: 'Tanggal Submit BAST', date: true },
                        { key: 'noSa', label: 'No SA' },
                        { key: 'nilaiSa', label: 'Nilai SA', amount: true },
                      ] as const).map(field => (
                        <div key={field.key} className="col-12 col-md-6">
                          <label className="form-label fw-semibold" htmlFor={`sphr-${field.key}`}>{field.label}</label>
                          <input
                            id={`sphr-${field.key}`}
                            className="form-control"
                            type={'date' in field ? 'date' : 'amount' in field ? 'number' : 'text'}
                            min={'amount' in field && !('allowNegative' in field) ? 0 : undefined}
                            step={'amount' in field ? 1 : undefined}
                            required={'required' in field ? field.required : false}
                            value={draft[field.key]}
                            onChange={event => {
                              const value = 'amount' in field ? Number(event.target.value) : event.target.value;
                              updateDraft(field.key, value);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <hr />
                    <div className="fw-bold mb-2">Tahapan BAST / SA</div>
                    <div className="row g-2">
                      {STATUS_FIELDS.map(field => (
                        <div className="col-12 col-md-6 col-lg-4" key={field.key}>
                          <label className="form-check d-flex gap-2 align-items-start">
                            <input
                              className="form-check-input mt-1"
                              type="checkbox"
                              checked={draft[field.key]}
                              onChange={event => updateDraft(field.key, event.target.checked)}
                            />
                            <span className="form-check-label">{field.label}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={closeForm} disabled={saving}>Batal</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? 'Menyimpan…' : 'Simpan Baris'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default Sphr01300aBillingPage;
