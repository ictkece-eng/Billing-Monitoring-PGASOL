
import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  LineChart,
  Line,
  PieChart,
  Pie,
  Legend,
  ReferenceLine,
} from 'recharts';
import { BudgetRecord } from '../types';
import { STATUS_COLS } from '../constants';

interface ChartsProps {
  data: BudgetRecord[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const MONTH_TOKEN_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mar: 3,
  maret: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  agu: 8,
  ags: 8,
  agustus: 8,
  aug: 8,
  sep: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
};

const toYearMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

// Local helper (duplicated from App for chart stability; does not affect app logic).
const normalizePeriodeToYearMonthKey = (raw?: string): string | null => {
  const s = (raw || '').trim();
  if (!s || s === '-') return null;

  // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY
  let m = s.match(/^\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{2}|\d{4})\s*$/);
  if (m) {
    const month = Number(m[2]);
    const yRaw = m[3];
    let year = Number(yRaw);
    if (yRaw.length === 2) year = 2000 + year;
    if (month >= 1 && month <= 12) return toYearMonthKey(year, month);
  }

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  m = s.match(/^\s*(\d{4})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return toYearMonthKey(year, month);
  }

  // YYYY-MM / YYYY/MM / YYYY.MM
  m = s.match(/^\s*(\d{4})\s*[-\/.]\s*(\d{1,2})\s*$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return toYearMonthKey(year, month);
  }

  // MM-YYYY / MM/YYYY / MM.YYYY
  m = s.match(/^\s*(\d{1,2})\s*[-\/.]\s*(\d{4})\s*$/);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (month >= 1 && month <= 12) return toYearMonthKey(year, month);
  }

  // MM-YY / MM/YY
  m = s.match(/^\s*(\d{1,2})\s*[-\/.]\s*(\d{2})\s*$/);
  if (m) {
    const month = Number(m[1]);
    const year2 = Number(m[2]);
    const year = 2000 + year2;
    if (month >= 1 && month <= 12) return toYearMonthKey(year, month);
  }

  const cleaned = s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/_/g, ' ');

  // "MMM YYYY" / "MMMM YYYY" / "MMM-YY" / "MMM-YYYY"
  m = cleaned.match(/^\s*([a-z]+)\s*[-\s]\s*(\d{2}|\d{4})\s*$/);
  if (m) {
    const monToken = m[1];
    const month = MONTH_TOKEN_MAP[monToken];
    if (!month) return null;
    const yRaw = m[2];
    let year = Number(yRaw);
    if (yRaw.length === 2) year = 2000 + year;
    return toYearMonthKey(year, month);
  }

  // "YYYY MMM" / "YYYY MMMM"
  m = cleaned.match(/^\s*(\d{4})\s*[-\s]\s*([a-z]+)\s*$/);
  if (m) {
    const year = Number(m[1]);
    const month = MONTH_TOKEN_MAP[m[2]];
    if (!month) return null;
    return toYearMonthKey(year, month);
  }

  return null;
};

const formatYearMonthKeyToLabel = (key: string) => {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return key;
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' }).format(new Date(year, month - 1, 1));
};

const DashboardCharts: React.FC<ChartsProps> = ({ data }) => {
  const normalizeStatus2Key = (s: any) => String(s ?? '').trim().toLowerCase();
  const canonicalizeStatus2 = (raw: any): string => {
    const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
    const key = normalizeStatus2Key(s);
    if (!key || key === '-' || key === '—' || key === '–' || key === 'n/a' || key === 'na' || key === 'null') return 'Status2 Kosong';
    if (key === 'manual') return 'manual';
    const canonicalExact = STATUS_COLS.find(col => normalizeStatus2Key(col) === key);
    if (canonicalExact) return canonicalExact;
    const canonicalPrefix = STATUS_COLS.find(col => {
      const ck = normalizeStatus2Key(col);
      return ck && key.startsWith(ck);
    });
    return canonicalPrefix || s;
  };

  // Fix: Explicitly cast the value to number to avoid arithmetic operation errors in TypeScript during sort
  const teamSpending = Object.entries(
    data.reduce((acc, curr) => {
      acc[curr.tim] = (acc[curr.tim] || 0) + curr.nilaiTagihan;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value: value as number }))
   .sort((a, b) => b.value - a.value);

  // Fix: Ensure values are treated as numbers for distribution calculation
  const statusDistribution = Object.entries(
    data.reduce((acc, curr) => {
      const s2 = canonicalizeStatus2(curr.status2);
      acc[s2] = (acc[s2] || 0) + curr.nilaiTagihan;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value: value as number }));

  const statusDistributionForChart = statusDistribution
    .slice()
    .sort((a, b) => (b.value as number) - (a.value as number));

  const formatCurrency = (val: any) => `Rp ${new Intl.NumberFormat('id-ID').format(val)}`;

  const formatCurrencyCompact = (val: any) => {
    const n = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(n)) return 'Rp 0';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000_000).toFixed(abs >= 10_000_000_000_000 ? 0 : 1).replace(/\.0$/, '')} T`;
    if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, '')} M`;
    if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')} jt`;
    if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '')} rb`;
    return `${sign}Rp ${new Intl.NumberFormat('id-ID').format(abs)}`;
  };

  const truncateLabel = (s: any, maxLen = 26) => {
    const str = String(s ?? '');
    if (str.length <= maxLen) return str;
    return `${str.slice(0, Math.max(0, maxLen - 1))}…`;
  };

  const monthlyTrend = useMemo(() => {
    const totalsByYM = data.reduce((acc, curr) => {
      const key = normalizePeriodeToYearMonthKey(curr.periode);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + (typeof curr.nilaiTagihan === 'number' && Number.isFinite(curr.nilaiTagihan) ? curr.nilaiTagihan : 0);
      return acc;
    }, {} as Record<string, number>);

    const keys = Object.keys(totalsByYM).sort();
    const points = keys.map(k => ({
      ym: k,
      label: formatYearMonthKeyToLabel(k),
      value: totalsByYM[k] || 0,
    }));

    const avg = points.length > 0 ? points.reduce((s, p) => s + p.value, 0) / points.length : 0;
    return { points, avg };
  }, [data]);

  const status2Pie = useMemo(() => {
    const sorted = statusDistributionForChart.slice();
    const top = sorted.slice(0, 6);
    const restSum = sorted.slice(6).reduce((acc, s) => acc + (typeof s.value === 'number' ? s.value : Number(s.value) || 0), 0);
    const out = top.map(x => ({ name: x.name, value: Number(x.value) || 0 }));
    if (restSum > 0) out.push({ name: 'Others', value: restSum });
    const total = out.reduce((acc, s) => acc + s.value, 0);
    return { data: out, total };
  }, [statusDistributionForChart]);

  return (
    <>
    <div className="row g-4 mb-4">
      <div className="col-12 col-lg-6">
        <div className="card shadow-sm border-0 h-100">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="small text-uppercase text-muted fw-bold" style={{ letterSpacing: '.08em' }}>Top 5 Team Spending</div>
              <span className="badge text-bg-primary-subtle border border-primary-subtle text-primary">Chart</span>
            </div>
            <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={teamSpending.slice(0, 5)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 10 }} />
              <Tooltip formatter={formatCurrency} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {teamSpending.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="col-12 col-lg-6">
        <div className="card shadow-sm border-0 h-100">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="small text-uppercase text-muted fw-bold" style={{ letterSpacing: '.08em' }}>Spending by Billing Status</div>
              <span className="badge text-bg-info-subtle border border-info-subtle text-info">Chart</span>
            </div>
            <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusDistributionForChart} layout="vertical" margin={{ top: 6, right: 28, bottom: 6, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                tickFormatter={formatCurrencyCompact}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={210}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => truncateLabel(v, 30)}
              />
              <Tooltip
                formatter={formatCurrency}
                labelFormatter={(label) => `Status: ${label}`}
                contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                {statusDistributionForChart.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={formatCurrencyCompact}
                  style={{ fill: '#475569', fontSize: 10, fontWeight: 700 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
            </div>
            <div className="d-flex flex-wrap gap-3 justify-content-center mt-3">
              {statusDistributionForChart.map((s, i) => (
                <div key={s.name} className="d-flex align-items-center gap-2">
                  <span className="d-inline-block rounded-circle" style={{ width: 10, height: 10, backgroundColor: COLORS[i % COLORS.length] }} />
                  <small className="text-muted">{s.name}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="row g-4 mb-4">
      <div className="col-12 col-lg-6">
        <div className="card shadow-sm border-0 h-100">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="small text-uppercase text-muted fw-bold" style={{ letterSpacing: '.08em' }}>Trend Bulanan (Spending)</div>
              <span className="badge text-bg-success-subtle border border-success-subtle text-success">Trend</span>
            </div>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend.points} margin={{ top: 8, right: 18, bottom: 8, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatCurrencyCompact} axisLine={false} tickLine={false} />
                  <Tooltip formatter={formatCurrency} labelFormatter={(l) => `Periode: ${l}`} />
                  {monthlyTrend.avg > 0 && (
                    <ReferenceLine y={monthlyTrend.avg} stroke="#10b981" strokeDasharray="4 4" ifOverflow="extendDomain" />
                  )}
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="small text-muted mt-2">
              {monthlyTrend.points.length === 0 ? 'Periode belum terbaca sebagai bulan.' : `Avg/bln: ${formatCurrency(monthlyTrend.avg)}`}
            </div>
          </div>
        </div>
      </div>

      <div className="col-12 col-lg-6">
        <div className="card shadow-sm border-0 h-100">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="small text-uppercase text-muted fw-bold" style={{ letterSpacing: '.08em' }}>Komposisi Status2 (Top)</div>
              <span className="badge text-bg-warning-subtle border border-warning-subtle text-warning">Share</span>
            </div>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={status2Pie.data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    {status2Pie.data.map((_, index) => (
                      <Cell key={`slice-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={formatCurrency} labelFormatter={(label) => `Status2: ${label}`} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="small text-muted mt-2">
              Total: <span className="fw-semibold">{formatCurrency(status2Pie.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default DashboardCharts;
