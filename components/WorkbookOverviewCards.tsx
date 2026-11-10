import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelImport, { WorkflowTableData } from './ExcelImport';
import { BudgetRecord } from '../types';

interface DashboardTrendRow {
  period: string;
  billing: number;
  ro: number;
  difference: number;
}

interface DashboardStatusRow {
  status: string;
  count: number;
  billing: number;
}

interface DashboardSnapshot {
  totalBilling: number;
  totalRo: number;
  rowCount: number;
  withSa: number;
  trend: DashboardTrendRow[];
  statuses: DashboardStatusRow[];
}

interface WorkbookOverviewCardsProps {
  canImport: boolean;
  canReplaceInTiDB: boolean;
  data: BudgetRecord[];
  tidbUploading: boolean;
  replacementPending: boolean;
  onReplaceImportedData: (records: BudgetRecord[]) => void;
  onReplaceInTiDB: () => void;
}

const normalizeLabel = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const readAmount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').replace(/[^\d,.-]/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',') && raw.includes('.')
    ? (raw.lastIndexOf(',') > raw.lastIndexOf('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, ''))
    : raw.replace(/,/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

const formatPeriod = (value: unknown): string => {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(new Date(date.y, date.m - 1, 1));
    }
  }
  const text = String(value ?? '').trim();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(new Date(parsed))
    : text;
};

const parseDashboardWorkbook = (workbook: XLSX.WorkBook): DashboardSnapshot => {
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    const findCell = (label: string) => {
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const colIndex = rows[rowIndex].findIndex(value => normalizeLabel(value) === normalizeLabel(label));
        if (colIndex >= 0) return { rowIndex, colIndex };
      }
      return null;
    };

    const totalBillingCell = findCell('Total Nilai Tagihan');
    const totalRoCell = findCell('Total Nilai RO');
    const rowCountCell = findCell('Jumlah Data');
    const withSaCell = findCell('Data dengan SA');
    if (!totalBillingCell || !totalRoCell || !rowCountCell || !withSaCell) continue;

    const readNextValue = ({ rowIndex, colIndex }: { rowIndex: number; colIndex: number }) =>
      rows[rowIndex + 1]?.[colIndex];
    const trend: DashboardTrendRow[] = [];
    const statuses: DashboardStatusRow[] = [];
    const trendHeaderRow = rows.findIndex(row =>
      row.some(value => normalizeLabel(value) === 'periode')
      && row.some(value => normalizeLabel(value) === 'selisih ro - tagihan')
    );
    if (trendHeaderRow >= 0) {
      const header = rows[trendHeaderRow].map(normalizeLabel);
      const periodCol = header.indexOf('periode');
      const billingCol = header.indexOf('nilai tagihan');
      const roCol = header.indexOf('nilai ro');
      const differenceCol = header.indexOf('selisih ro - tagihan');
      for (let rowIndex = trendHeaderRow + 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (row[periodCol] === null || row[periodCol] === undefined || String(row[periodCol]).trim() === '') break;
        trend.push({
          period: formatPeriod(row[periodCol]),
          billing: readAmount(row[billingCol]),
          ro: readAmount(row[roCol]),
          difference: readAmount(row[differenceCol]),
        });
      }
    }

    const statusHeaderRow = rows.findIndex(row =>
      row.some(value => normalizeLabel(value) === 'status')
      && row.some(value => normalizeLabel(value) === 'jumlah data')
      && row.some(value => normalizeLabel(value) === 'nilai tagihan')
    );
    if (statusHeaderRow >= 0) {
      const header = rows[statusHeaderRow].map(normalizeLabel);
      const statusCol = header.indexOf('status');
      const countCol = header.indexOf('jumlah data');
      const billingCol = header.indexOf('nilai tagihan');
      for (let rowIndex = statusHeaderRow + 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (row[statusCol] === null || row[statusCol] === undefined || String(row[statusCol]).trim() === '') break;
        statuses.push({
          status: String(row[statusCol]),
          count: readAmount(row[countCol]),
          billing: readAmount(row[billingCol]),
        });
      }
    }

    return {
      totalBilling: readAmount(readNextValue(totalBillingCell)),
      totalRo: readAmount(readNextValue(totalRoCell)),
      rowCount: readAmount(readNextValue(rowCountCell)),
      withSa: readAmount(readNextValue(withSaCell)),
      trend,
      statuses,
    };
  }
  throw new Error('Sheet Dashboard tidak menemukan KPI dan tabel yang diharapkan.');
};

const WorkbookOverviewCards: React.FC<WorkbookOverviewCardsProps> = ({
  canImport,
  canReplaceInTiDB,
  data,
  tidbUploading,
  replacementPending,
  onReplaceImportedData,
  onReplaceInTiDB,
}) => {
  const dashboardFileRef = useRef<HTMLInputElement>(null);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [dashboardError, setDashboardError] = useState('');
  const [workflowTable, setWorkflowTable] = useState<WorkflowTableData | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState('');
  const [workflowPage, setWorkflowPage] = useState(0);

  const filteredWorkflowRows = useMemo(() => {
    if (!workflowTable) return [];
    const query = workflowQuery.trim().toLowerCase();
    return query
      ? workflowTable.rows.filter(row => row.some(value => value.toLowerCase().includes(query)))
      : workflowTable.rows;
  }, [workflowQuery, workflowTable]);
  const workflowPageSize = 25;
  const workflowPageCount = Math.ceil(filteredWorkflowRows.length / workflowPageSize);
  const visibleWorkflowRows = filteredWorkflowRows.slice(
    workflowPage * workflowPageSize,
    (workflowPage + 1) * workflowPageSize
  );
  const totalBilling = data.reduce((total, record) => total + (Number.isFinite(record.nilaiTagihan) ? record.nilaiTagihan : 0), 0);

  const handleDashboardFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDashboardError('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      setDashboard(parseDashboardWorkbook(workbook));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDashboardError(`Gagal membaca Dashboard.xlsx: ${message}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleWorkflowImport = (records: BudgetRecord[]) => {
    onReplaceImportedData(records);
    setWorkflowPage(0);
    setWorkflowQuery('');
  };

  return (
    <div className="row g-3 mb-4" aria-label="Workbook SPHR01031A">
      <div className="col-12">
        <section className="card shadow-sm border-0 h-100" aria-labelledby="dashboard-workbook-title">
          <div className="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <h2 id="dashboard-workbook-title" className="h6 fw-bold mb-1">Dashboard</h2>
              <div className="small text-muted">Snapshot KPI, tren bulanan, dan status dari Dashboard.xlsx</div>
            </div>
            <div>
              <input
                ref={dashboardFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="d-none"
                onChange={handleDashboardFile}
                disabled={!canImport}
              />
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => dashboardFileRef.current?.click()}
                disabled={!canImport}
                title={canImport ? 'Impor Dashboard.xlsx' : 'Masuk Admin untuk mengimpor'}
              >
                <i className="bi bi-file-earmark-arrow-up me-1" aria-hidden="true" />
                Impor Dashboard
              </button>
            </div>
          </div>
          <div className="card-body">
            {dashboardError && <div className="alert alert-danger py-2 small" role="alert">{dashboardError}</div>}
            {!dashboard ? (
              <div className="text-center text-muted small py-4">
                Impor Dashboard.xlsx untuk menampilkan KPI dan kedua tabel dari sheet Dashboard.
              </div>
            ) : (
              <>
                <div className="row g-2 mb-3">
                  {[
                    ['Total Nilai Tagihan', formatCurrency(dashboard.totalBilling)],
                    ['Total Nilai RO', formatCurrency(dashboard.totalRo)],
                    ['Jumlah Data', dashboard.rowCount.toLocaleString('id-ID')],
                    ['Data dengan SA', dashboard.withSa.toLocaleString('id-ID')],
                  ].map(([label, value]) => (
                    <div className="col-6 col-xxl-3" key={label}>
                      <div className="rounded border bg-light p-2 h-100">
                        <div className="text-muted small">{label}</div>
                        <div className="fw-semibold small text-break">{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="small fw-bold text-uppercase text-muted mb-1">Tren Nilai Tagihan per Periode</div>
                <div className="table-responsive border rounded mb-3" style={{ maxHeight: 230 }}>
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light sticky-top">
                      <tr><th>Periode</th><th className="text-end">Nilai Tagihan</th><th className="text-end">Nilai RO</th><th className="text-end">Selisih RO - Tagihan</th></tr>
                    </thead>
                    <tbody>
                      {dashboard.trend.map((row, index) => (
                        <tr key={`${row.period}-${index}`}>
                          <td>{row.period}</td><td className="text-end text-nowrap">{formatCurrency(row.billing)}</td>
                          <td className="text-end text-nowrap">{formatCurrency(row.ro)}</td>
                          <td className="text-end text-nowrap">{formatCurrency(row.difference)}</td>
                        </tr>
                      ))}
                      {dashboard.trend.length === 0 && <tr><td colSpan={4} className="text-center text-muted">Tabel tren kosong.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="small fw-bold text-uppercase text-muted mb-1">Posisi Data berdasarkan Status Workflow</div>
                <div className="table-responsive border rounded" style={{ maxHeight: 230 }}>
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light sticky-top">
                      <tr><th>Status</th><th className="text-end">Jumlah Data</th><th className="text-end">Nilai Tagihan</th></tr>
                    </thead>
                    <tbody>
                      {dashboard.statuses.map((row, index) => (
                        <tr key={`${row.status}-${index}`}>
                          <td>{row.status}</td><td className="text-end">{row.count.toLocaleString('id-ID')}</td>
                          <td className="text-end text-nowrap">{formatCurrency(row.billing)}</td>
                        </tr>
                      ))}
                      {dashboard.statuses.length === 0 && <tr><td colSpan={3} className="text-center text-muted">Tabel status kosong.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="col-12">
        <section className="card shadow-sm border-0 h-100" aria-labelledby="workflow-workbook-title">
          <div className="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <h2 id="workflow-workbook-title" className="h6 fw-bold mb-1">Database Workflow</h2>
              <div className="small text-muted">Tabel master dari Database Workflow.xlsx</div>
            </div>
            <ExcelImport
              onImport={handleWorkflowImport}
              onWorkflowTableImport={setWorkflowTable}
              projectId="SPHR01031A"
              disabled={!canImport}
              workflowOnly
              buttonClassName="btn btn-sm btn-outline-success"
              label="Impor Database Workflow"
            />
          </div>
          <div className="card-body">
            <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
              <div><span className="small text-muted d-block">Transaksi</span><strong>{data.length.toLocaleString('id-ID')}</strong></div>
              <div><span className="small text-muted d-block">Total Nilai Tagihan</span><strong>{formatCurrency(totalBilling)}</strong></div>
              {replacementPending && <span className="badge text-bg-warning">Menunggu penggantian TiDB</span>}
              {canReplaceInTiDB && replacementPending && (
                <button type="button" className="btn btn-sm btn-danger ms-auto" onClick={onReplaceInTiDB} disabled={tidbUploading}>
                  <i className="bi bi-arrow-repeat me-1" aria-hidden="true" />
                  {tidbUploading ? 'Mengganti…' : 'Ganti data SPHR01031A di TiDB'}
                </button>
              )}
            </div>
            {!workflowTable ? (
              <div className="text-center text-muted small py-4">
                Impor Database Workflow.xlsx untuk melihat seluruh kolom dan baris master.
              </div>
            ) : (
              <>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                  <input
                    className="form-control form-control-sm"
                    style={{ maxWidth: 280 }}
                    value={workflowQuery}
                    onChange={event => {
                      setWorkflowQuery(event.target.value);
                      setWorkflowPage(0);
                    }}
                    placeholder="Cari di tabel workflow…"
                    aria-label="Cari di tabel Database Workflow"
                  />
                  <span className="small text-muted">{filteredWorkflowRows.length.toLocaleString('id-ID')} dari {workflowTable.rows.length.toLocaleString('id-ID')} baris</span>
                </div>
                <div className="table-responsive border rounded" style={{ maxHeight: 420 }}>
                  <table className="table table-sm table-hover align-middle mb-0" style={{ minWidth: 1500 }}>
                    <thead className="table-light sticky-top">
                      <tr>{workflowTable.headers.map((header, index) => <th key={`${header}-${index}`} className="text-nowrap">{header}</th>)}</tr>
                    </thead>
                    <tbody>
                      {visibleWorkflowRows.map((row, rowIndex) => (
                        <tr key={`${workflowPage}-${rowIndex}`}>
                          {workflowTable.headers.map((_, columnIndex) => (
                            <td key={columnIndex} className="text-nowrap">{row[columnIndex] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                      {visibleWorkflowRows.length === 0 && <tr><td colSpan={workflowTable.headers.length} className="text-center text-muted">Tidak ada baris yang cocok.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="d-flex justify-content-between align-items-center mt-2">
                  <span className="small text-muted">
                    Halaman {workflowPageCount === 0 ? 0 : workflowPage + 1} dari {workflowPageCount}
                  </span>
                  <div className="btn-group btn-group-sm" role="group" aria-label="Navigasi halaman tabel workflow">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setWorkflowPage(page => Math.max(0, page - 1))} disabled={workflowPage <= 0}>Sebelumnya</button>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setWorkflowPage(page => Math.min(workflowPageCount - 1, page + 1))} disabled={workflowPage >= workflowPageCount - 1}>Berikutnya</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default WorkbookOverviewCards;
