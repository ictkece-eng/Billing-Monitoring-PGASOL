
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { BudgetRecord } from '../types';
import { STATUS_COLS } from '../constants';

interface ChartsProps {
  data: BudgetRecord[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const DashboardCharts: React.FC<ChartsProps> = ({ data }) => {
  const normalizeStatus2Key = (s: any) => String(s ?? '').trim().toLowerCase();
  const canonicalizeStatus2 = (raw: any): string => {
    const s = String(raw ?? '').trim();
    const key = normalizeStatus2Key(s);
    if (!key || key === '-' || key === '—' || key === '–' || key === 'n/a' || key === 'na' || key === 'null') return 'manual';
    const canonical = STATUS_COLS.find(col => normalizeStatus2Key(col) === key);
    return canonical || s;
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

  const formatCurrency = (val: any) => `Rp ${new Intl.NumberFormat('id-ID').format(val)}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Top 5 Team Spending</h3>
        <div className="h-80">
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Spending by Billing Status</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {statusDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={formatCurrency} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 mt-2 justify-center">
            {statusDistribution.map((s, i) => (
                <div key={s.name} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span className="text-[10px] text-slate-500 font-medium">{s.name}</span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardCharts;
