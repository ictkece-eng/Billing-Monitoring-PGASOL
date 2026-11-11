import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelImport, { WorkflowTableData } from './ExcelImport';
import { BudgetRecord } from '../types';
import { fetchWorkbookSnapshots, saveWorkbookSnapshot } from '../services/workbookSnapshotService';

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

interface WorkflowPivotTeam {
  team: string;
  users: Array<{ name: string; amounts: Map<string, number> }>;
  totals: Map<string, number>;
}

const DASHBOARD_STORAGE_KEY = 'pgasol.sphr01031a.dashboard-workbook.v1';
const WORKFLOW_STORAGE_KEY = 'pgasol.sphr01031a.workflow-workbook.v1';
const MONTH_NAMES: Record<string, number> = {
  jan: 0, januari: 0, january: 0,
  feb: 1, februari: 1, february: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  may: 4, mei: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  aug: 7, agu: 7, agustus: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, okt: 9, oktober: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, des: 11, desember: 11, december: 11,
};

const readStoredValue = <T,>(
  key: string,
  isValid: (value: unknown) => value is T
): { value: T | null; error: string } => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return { value: null, error: '' };
    const parsed: unknown = JSON.parse(stored);
    if (!isValid(parsed)) throw new Error('Format data tersimpan tidak sesuai.');
    return { value: parsed, error: '' };
  } catch (error) {
    return {
      value: null,
      error: `Gagal memuat data workbook tersimpan: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const isDashboardSnapshot = (value: unknown): value is DashboardSnapshot => {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<DashboardSnapshot>;
  return Number.isFinite(snapshot.totalBilling)
    && Number.isFinite(snapshot.totalRo)
    && Number.isFinite(snapshot.rowCount)
    && Number.isFinite(snapshot.withSa)
    && Array.isArray(snapshot.trend)
    && snapshot.trend.every(row =>
      typeof row.period === 'string'
      && Number.isFinite(row.billing)
      && Number.isFinite(row.ro)
      && Number.isFinite(row.difference)
    )
    && Array.isArray(snapshot.statuses)
    && snapshot.statuses.every(row =>
      typeof row.status === 'string'
      && Number.isFinite(row.count)
      && Number.isFinite(row.billing)
    );
};

const isWorkflowTable = (value: unknown): value is WorkflowTableData => {
  if (!value || typeof value !== 'object') return false;
  const table = value as Partial<WorkflowTableData>;
  return Array.isArray(table.headers)
    && table.headers.every(header => typeof header === 'string')
    && Array.isArray(table.rows)
    && table.rows.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'));
};

const normalizeWorkflowStatus = (table: WorkflowTableData) => {
  const statusColumn = table.headers.findIndex(header => header.trim().toLowerCase() === 'status');
  if (statusColumn < 0) return { table, changed: false };

  let changed = false;
  const rows = table.rows.map(row => {
    if (row[statusColumn]?.trim().toLowerCase() !== 'manual') return row;
    changed = true;
    return row.map((value, index) => index === statusColumn ? 'Paid' : value);
  });
  return { table: changed ? { ...table, rows } : table, changed };
};

const readStoredWorkflowTable = () => {
  const stored = readStoredValue(WORKFLOW_STORAGE_KEY, isWorkflowTable);
  if (!stored.value) return stored;
  const normalized = normalizeWorkflowStatus(stored.value);
  if (!normalized.changed) return { ...stored, value: normalized.table };

  try {
    localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(normalized.table));
    return { ...stored, value: normalized.table };
  } catch (error) {
    return {
      value: normalized.table,
      error: `Data STATUS manual ditampilkan sebagai Paid, tetapi gagal menyimpan perubahan lokal: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

interface WorkbookOverviewCardsProps {
  canImport: boolean;
  canReplaceInTiDB: boolean;
  data: BudgetRecord[];
  tidbUploading: boolean;
  replacementPending: boolean;
  onReplaceImportedData: (records: BudgetRecord[]) => void;
  onReplaceInTiDB: () => void;
  onWorkflowVisualizationDataChange: (records: BudgetRecord[] | null) => void;
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

const normalizePivotHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const parsePivotPeriod = (value: string): string | null => {
  const text = value.trim().toLowerCase();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) {
    const month = Number(iso[2]);
    return month >= 1 && month <= 12 ? `${iso[1]}-${String(month).padStart(2, '0')}` : null;
  }
  const date = text.match(/^(?:(\d{1,2})[-\s/]*)?([a-z]+)[-\s/,]*(\d{2,4})$/);
  if (date) {
    const month = MONTH_NAMES[date[2]];
    const year = Number(date[3]) < 100 ? 2000 + Number(date[3]) : Number(date[3]);
    if (month !== undefined && year >= 1900 && year <= 9999) {
      return `${year}-${String(month + 1).padStart(2, '0')}`;
    }
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    const dateValue = new Date(parsed);
    return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}`;
  }
  return null;
};

const formatPivotPeriod = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' })
    .format(new Date(year, month - 1, 1));
};

const parsePivotAmount = (value: string): number => {
  const text = value.trim();
  if (!text) return 0;
  const negative = /^\s*-/.test(text) || /^\(.*\)$/.test(text);
  const digits = text.replace(/[^\d]/g, '');
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : 0;
};

const buildWorkflowStatusRows = (table: WorkflowTableData): DashboardStatusRow[] => {
  const headers = table.headers.map(normalizePivotHeader);
  const statusColumn = headers.findIndex(header => header === 'status');
  const amountColumn = headers.findIndex(header => header === 'nilaitagihan');
  if (statusColumn < 0 || amountColumn < 0) return [];

  const statusTotals = new Map<string, DashboardStatusRow>();
  table.rows.forEach(row => {
    const status = row[statusColumn]?.trim() || 'Status Kosong';
    const current = statusTotals.get(status) || { status, count: 0, billing: 0 };
    current.count += 1;
    current.billing += parsePivotAmount(row[amountColumn] || '');
    statusTotals.set(status, current);
  });
  return [...statusTotals.values()];
};

const buildWorkflowVisualizationRows = (table: WorkflowTableData): BudgetRecord[] => {
  const headers = table.headers.map(normalizePivotHeader);
  const teamColumn = headers.findIndex(header => header === 'tim' || header === 'team');
  const userColumn = headers.findIndex(header => header === 'namauser' || header === 'user');
  const periodColumn = headers.findIndex(header => header === 'periodebulan' || header === 'periode');
  const amountColumn = headers.findIndex(header => header === 'nilaitagihan');
  const statusColumn = headers.findIndex(header => header === 'status');
  const roColumn = headers.findIndex(header => header === 'noro');
  if ([teamColumn, userColumn, periodColumn, amountColumn].some(column => column < 0)) return [];

  return table.rows.flatMap((row, index) => {
    const rawPeriod = row[periodColumn]?.trim() || '';
    const period = parsePivotPeriod(rawPeriod) || rawPeriod;
    if (!period || period === '-') return [];
    return [{
      id: `workflow-insight-${index}`,
      projectId: 'SPHR01031A',
      status: 'On Progress',
      namaUser: row[userColumn]?.trim() || 'Unknown',
      tim: row[teamColumn]?.trim() || 'No Team',
      periode: period,
      nilaiTagihan: parsePivotAmount(row[amountColumn] || ''),
      noRO: roColumn < 0 ? '' : row[roColumn] || '',
      tglBAST: '',
      noBAST: '',
      status2: statusColumn < 0 ? 'Status2 Kosong' : row[statusColumn]?.trim() || 'Status2 Kosong',
      emailSoftCopy: '',
      saNo: '',
      tglKirimJKT: '',
      reviewerVendor: '',
      keterangan: '',
    }];
  });
};

const buildWorkflowPivot = (table: WorkflowTableData) => {
  const headers = table.headers.map(normalizePivotHeader);
  const teamColumn = headers.findIndex(header => header === 'tim' || header === 'team');
  const userColumn = headers.findIndex(header => header === 'namauser' || header === 'user');
  const periodColumn = headers.findIndex(header => header === 'periodebulan' || header === 'periode');
  const amountColumn = headers.findIndex(header => header === 'nilaitagihan');
  if ([teamColumn, userColumn, periodColumn, amountColumn].some(column => column < 0)) return null;

  const periods = new Set<string>();
  const teams = new Map<string, Map<string, Map<string, number>>>();
  table.rows.forEach(row => {
    const period = parsePivotPeriod(row[periodColumn] || '');
    if (!period) return;
    const team = row[teamColumn]?.trim() || 'No Team';
    const user = row[userColumn]?.trim() || 'Unknown';
    const amount = parsePivotAmount(row[amountColumn] || '');
    periods.add(period);
    let users = teams.get(team);
    if (!users) {
      users = new Map();
      teams.set(team, users);
    }
    let userAmounts = users.get(user);
    if (!userAmounts) {
      userAmounts = new Map();
      users.set(user, userAmounts);
    }
    userAmounts.set(period, (userAmounts.get(period) || 0) + amount);
  });

  const sortedPeriods = [...periods].sort();
  const rows: WorkflowPivotTeam[] = [...teams.entries()]
    .sort(([teamA], [teamB]) => teamA.localeCompare(teamB, 'id'))
    .map(([team, users]) => {
      const teamTotals = new Map<string, number>();
      const sortedUsers = [...users.entries()]
        .sort(([userA], [userB]) => userA.localeCompare(userB, 'id'))
        .map(([name, amounts]) => {
          for (const [period, amount] of amounts) {
            teamTotals.set(period, (teamTotals.get(period) || 0) + amount);
          }
          return { name, amounts };
        });
      return { team, users: sortedUsers, totals: teamTotals };
    });

  const grandTotals = new Map<string, number>();
  rows.forEach(row => {
    for (const [period, amount] of row.totals) {
      grandTotals.set(period, (grandTotals.get(period) || 0) + amount);
    }
  });
  return { periods: sortedPeriods, teams: rows, grandTotals };
};

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
  onWorkflowVisualizationDataChange,
}) => {
  const dashboardFileRef = useRef<HTMLInputElement>(null);
  const [dashboardStored] = useState(() => readStoredValue(DASHBOARD_STORAGE_KEY, isDashboardSnapshot));
  const [workflowStored] = useState(readStoredWorkflowTable);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(dashboardStored.value);
  const [dashboardError, setDashboardError] = useState(dashboardStored.error);
  const [workflowTable, setWorkflowTable] = useState<WorkflowTableData | null>(workflowStored.value);
  const [workflowError, setWorkflowError] = useState(workflowStored.error);
  const [snapshotSyncing, setSnapshotSyncing] = useState(true);
  const [snapshotSyncError, setSnapshotSyncError] = useState('');
  const [workflowQuery, setWorkflowQuery] = useState('');
  const [workflowPage, setWorkflowPage] = useState(0);
  const [dashboardQuery, setDashboardQuery] = useState('');
  const [pivotQuery, setPivotQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const syncSnapshots = async () => {
      setSnapshotSyncing(true);
      setSnapshotSyncError('');
      try {
        const remote = await fetchWorkbookSnapshots();
        const remoteDashboard = Object.prototype.hasOwnProperty.call(remote, 'dashboard')
          ? remote.dashboard
          : undefined;
        const remoteWorkflow = Object.prototype.hasOwnProperty.call(remote, 'workflow')
          ? remote.workflow
          : undefined;
        let nextDashboard: DashboardSnapshot | null;
        if (remoteDashboard === undefined) nextDashboard = dashboardStored.value;
        else if (isDashboardSnapshot(remoteDashboard)) nextDashboard = remoteDashboard;
        else throw new Error('Snapshot Dashboard di server memiliki format yang tidak sesuai.');

        let nextWorkflow: WorkflowTableData | null;
        if (remoteWorkflow === undefined) nextWorkflow = workflowStored.value;
        else if (isWorkflowTable(remoteWorkflow)) nextWorkflow = remoteWorkflow;
        else throw new Error('Snapshot Database Workflow di server memiliki format yang tidak sesuai.');
        nextWorkflow = normalizeWorkflowStatus(nextWorkflow).table;
        if (remoteDashboard === undefined && nextDashboard) {
          await saveWorkbookSnapshot('dashboard', nextDashboard);
        }
        if (
          nextWorkflow
          && (
            remoteWorkflow === undefined
            || JSON.stringify(nextWorkflow) !== JSON.stringify(remoteWorkflow)
          )
        ) {
          await saveWorkbookSnapshot('workflow', nextWorkflow);
        }

        if (cancelled) return;
        setDashboard(nextDashboard);
        setWorkflowTable(nextWorkflow);
        try {
          if (nextDashboard) localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(nextDashboard));
          if (nextWorkflow) localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextWorkflow));
        } catch (error) {
          setSnapshotSyncError(`Workbook sudah sinkron di server, tetapi cache browser gagal diperbarui: ${String(error instanceof Error ? error.message : error)}`);
        }
      } catch (error) {
        if (!cancelled) {
          setSnapshotSyncError(`Gagal sinkronisasi workbook bersama. Data lokal tetap ditampilkan jika tersedia: ${String(error instanceof Error ? error.message : error)}`);
        }
      } finally {
        if (!cancelled) setSnapshotSyncing(false);
      }
    };
    void syncSnapshots();
    return () => {
      cancelled = true;
    };
  }, [dashboardStored.value, workflowStored.value]);

  useEffect(() => {
    onWorkflowVisualizationDataChange(
      workflowTable ? buildWorkflowVisualizationRows(workflowTable) : null
    );
  }, [onWorkflowVisualizationDataChange, workflowTable]);

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
  const workflowPivot = useMemo(
    () => workflowTable ? buildWorkflowPivot(workflowTable) : null,
    [workflowTable]
  );
  const dashboardSearch = dashboardQuery.trim().toLowerCase();
  const dashboardTrend = (dashboard?.trend || []).filter(row =>
    !dashboardSearch
    || [row.period, row.billing, row.ro, row.difference]
      .some(value => String(value).toLowerCase().includes(dashboardSearch))
  );
  const workflowStatusRows = workflowTable ? buildWorkflowStatusRows(workflowTable) : [];
  const dashboardStatuses = workflowStatusRows.filter(row =>
    !dashboardSearch
    || [row.status, row.count, row.billing]
      .some(value => String(value).toLowerCase().includes(dashboardSearch))
  );
  const pivotSearch = pivotQuery.trim().toLowerCase();
  const matchedPivotPeriods = workflowPivot?.periods.filter(period =>
    !pivotSearch || formatPivotPeriod(period).toLowerCase().includes(pivotSearch)
  ) || [];
  const pivotSearchMatchesPeriod = pivotSearch !== '' && matchedPivotPeriods.length > 0;
  const pivotPeriods = pivotSearchMatchesPeriod
    ? matchedPivotPeriods
    : workflowPivot?.periods || [];
  const pivotTeams = workflowPivot?.teams.flatMap(team => {
    const teamMatches = team.team.toLowerCase().includes(pivotSearch);
    const matchedUsers = pivotSearch
      ? team.users.filter(user => user.name.toLowerCase().includes(pivotSearch))
      : team.users;
    if (pivotSearch && !pivotSearchMatchesPeriod && !teamMatches && matchedUsers.length === 0) return [];
    const users = !pivotSearch || pivotSearchMatchesPeriod || teamMatches ? team.users : matchedUsers;
    const totals = new Map<string, number>();
    users.forEach(user => {
      user.amounts.forEach((amount, period) => totals.set(period, (totals.get(period) || 0) + amount));
    });
    return [{ ...team, users, totals }];
  }) || [];
  const pivotGrandTotals = new Map<string, number>();
  pivotTeams.forEach(team => {
    team.totals.forEach((amount, period) => pivotGrandTotals.set(period, (pivotGrandTotals.get(period) || 0) + amount));
  });

  const handleDashboardFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDashboardError('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const snapshot = parseDashboardWorkbook(workbook);
      await saveWorkbookSnapshot('dashboard', snapshot);
      setDashboard(snapshot);
      try {
        localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(snapshot));
      } catch (error) {
        setDashboardError(`Dashboard berhasil disimpan bersama, tetapi cache browser gagal diperbarui: ${String(error instanceof Error ? error.message : error)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDashboardError(`Gagal mengimpor Dashboard.xlsx: ${message}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleWorkflowTableImport = async (table: WorkflowTableData) => {
    setWorkflowError('');
    try {
      const normalized = normalizeWorkflowStatus(table).table;
      await saveWorkbookSnapshot('workflow', normalized);
      setWorkflowTable(normalized);
      try {
        localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(normalized));
      } catch (error) {
        setWorkflowError(`Database Workflow berhasil disimpan bersama, tetapi cache browser gagal diperbarui: ${String(error instanceof Error ? error.message : error)}`);
      }
    } catch (error) {
      setWorkflowError(`Gagal menyimpan Database Workflow bersama: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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
        <section
          className="card shadow-sm border-0 h-100"
          style={{ borderTop: '4px solid #0d6efd' }}
          aria-labelledby="dashboard-workbook-title"
        >
          <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2" style={{ backgroundColor: '#eaf2ff' }}>
            <div>
              <h2 id="dashboard-workbook-title" className="h6 fw-bold mb-1">Dashboard</h2>
              <div className="small text-muted">Snapshot KPI, tren bulanan, dan status dari Dashboard.xlsx; tersimpan bersama agar dapat dibuka dari perangkat lain.</div>
            </div>
            <div>
              <input
                ref={dashboardFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="d-none"
                onChange={handleDashboardFile}
                disabled={!canImport || snapshotSyncing}
              />
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => dashboardFileRef.current?.click()}
                disabled={!canImport || snapshotSyncing}
                title={canImport ? 'Impor Dashboard.xlsx' : 'Masuk Admin untuk mengimpor'}
              >
                <i className="bi bi-file-earmark-arrow-up me-1" aria-hidden="true" />
                Impor Dashboard
              </button>
            </div>
          </div>
          <div className="card-body">
            {snapshotSyncing && <div className="alert alert-info py-2 small" role="status">Memuat workbook bersama…</div>}
            {snapshotSyncError && <div className="alert alert-warning py-2 small" role="alert">{snapshotSyncError}</div>}
            {dashboardError && <div className="alert alert-danger py-2 small" role="alert">{dashboardError}</div>}
            {!dashboard ? (
              <div className="text-center text-muted small py-4">
                Impor Dashboard.xlsx untuk menampilkan KPI dan kedua tabel dari sheet Dashboard.
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <input
                    className="form-control form-control-sm"
                    value={dashboardQuery}
                    onChange={event => setDashboardQuery(event.target.value)}
                    placeholder="Cari periode, status, jumlah, atau nilai…"
                    aria-label="Cari di kartu Dashboard"
                  />
                </div>
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
                      {dashboardTrend.map((row, index) => (
                        <tr key={`${row.period}-${index}`}>
                          <td>{row.period}</td><td className="text-end text-nowrap">{formatCurrency(row.billing)}</td>
                          <td className="text-end text-nowrap">{formatCurrency(row.ro)}</td>
                          <td className="text-end text-nowrap">{formatCurrency(row.difference)}</td>
                        </tr>
                      ))}
                      {dashboardTrend.length === 0 && <tr><td colSpan={4} className="text-center text-muted">Tidak ada data tren yang cocok.</td></tr>}
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
                      {dashboardStatuses.map((row, index) => (
                        <tr key={`${row.status}-${index}`}>
                          <td>{row.status}</td><td className="text-end">{row.count.toLocaleString('id-ID')}</td>
                          <td className="text-end text-nowrap">{formatCurrency(row.billing)}</td>
                        </tr>
                      ))}
                      {dashboardStatuses.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-center text-muted">
                            {workflowTable
                              ? 'Tidak ada data status yang cocok.'
                              : 'Impor Database Workflow.xlsx untuk menampilkan status workflow.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="col-12">
        <section
          className="card shadow-sm border-0 h-100"
          style={{ borderTop: '4px solid #198754' }}
          aria-labelledby="workflow-workbook-title"
        >
          <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2" style={{ backgroundColor: '#e8f5ee' }}>
            <div>
              <h2 id="workflow-workbook-title" className="h6 fw-bold mb-1">Database Workflow</h2>
              <div className="small text-muted">Tabel master dari Database Workflow.xlsx; tersimpan bersama agar dapat dibuka dari perangkat lain.</div>
            </div>
            <ExcelImport
              onImport={handleWorkflowImport}
              onWorkflowTableImport={handleWorkflowTableImport}
              projectId="SPHR01031A"
              disabled={!canImport || snapshotSyncing}
              workflowOnly
              buttonClassName="btn btn-sm btn-outline-success"
              label="Impor Database Workflow"
            />
          </div>
          <div className="card-body">
            {workflowError && <div className="alert alert-danger py-2 small" role="alert">{workflowError}</div>}
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
                    placeholder="Cari nama, tim, status, periode, atau kolom lain…"
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

      <div className="col-12">
        <section
          className="card shadow-sm border-0 h-100"
          style={{ borderTop: '4px solid #6f42c1' }}
          aria-labelledby="workflow-pivot-title"
        >
          <div className="card-header" style={{ backgroundColor: '#f1ebfb' }}>
            <h2 id="workflow-pivot-title" className="h6 fw-bold mb-1">Pivot Nilai Tagihan per Tim, User, dan Periode</h2>
            <div className="small text-muted">Sumber: Database Workflow (MASTER) · Nilai diringkas dengan SUM · Ikuti hasil impor Database Workflow.</div>
          </div>
          <div className="card-body">
            {!workflowTable ? (
              <div className="text-center text-muted small py-4">
                Impor Database Workflow.xlsx untuk membuat pivot nilai tagihan.
              </div>
            ) : !workflowPivot ? (
              <div className="alert alert-warning py-2 small mb-0" role="alert">
                Pivot tidak dapat dibuat karena kolom Tim, Nama User, Periode Bulan, atau Nilai Tagihan tidak ditemukan.
              </div>
            ) : workflowPivot.periods.length === 0 ? (
              <div className="text-center text-muted small py-4">Tidak ada periode yang dapat dibaca pada data workflow.</div>
            ) : (
              <>
                <div className="mb-3">
                  <input
                    className="form-control form-control-sm"
                    value={pivotQuery}
                    onChange={event => setPivotQuery(event.target.value)}
                    placeholder="Cari tim, nama user, atau periode…"
                    aria-label="Cari di kartu Pivot"
                  />
                </div>
                <div className="table-responsive border rounded" style={{ maxHeight: 520 }}>
                  <table className="table table-sm table-hover align-middle mb-0" style={{ minWidth: 720 }}>
                    <thead className="table-primary sticky-top">
                      <tr>
                        <th className="text-nowrap">Tim</th>
                        <th className="text-nowrap">Nama User</th>
                        {pivotPeriods.map(period => (
                          <th key={period} className="text-end text-nowrap">{formatPivotPeriod(period)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pivotTeams.map(team => (
                        <React.Fragment key={team.team}>
                          <tr className="table-light">
                            <th colSpan={pivotPeriods.length + 2}>{team.team}</th>
                          </tr>
                          {team.users.map(user => (
                            <tr key={`${team.team}-${user.name}`}>
                              <td className="text-muted">{team.team}</td>
                              <td className="text-nowrap">{user.name}</td>
                              {pivotPeriods.map(period => (
                                <td key={period} className="text-end text-nowrap">
                                  {(user.amounts.get(period) || 0).toLocaleString('en-US')}
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr className="table-primary fw-bold">
                            <td colSpan={2}>{team.team} Total</td>
                            {pivotPeriods.map(period => (
                              <td key={period} className="text-end text-nowrap">
                                {(team.totals.get(period) || 0).toLocaleString('en-US')}
                              </td>
                            ))}
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr className="table-dark fw-bold">
                        <td colSpan={2}>Grand Total</td>
                        {pivotPeriods.map(period => (
                          <td key={period} className="text-end text-nowrap">
                            {(pivotGrandTotals.get(period) || 0).toLocaleString('en-US')}
                          </td>
                        ))}
                      </tr>
                      {pivotTeams.length === 0 && (
                        <tr><td colSpan={pivotPeriods.length + 2} className="text-center text-muted">Tidak ada tim atau user yang cocok.</td></tr>
                      )}
                    </tbody>
                  </table>
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
