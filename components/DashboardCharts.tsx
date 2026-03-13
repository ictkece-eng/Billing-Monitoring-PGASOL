
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { BudgetRecord } from '../types';
import { STATUS_COLS } from '../constants';

interface ChartsProps {
  data: BudgetRecord[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

  return (
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
  );
};

export default DashboardCharts;
