
import React, { useMemo } from 'react';
import { BudgetRecord, PivotRow } from '../types';
import { STATUS_COLS } from '../constants';

interface PivotTableProps {
  data: BudgetRecord[];
}

const formatCurrency = (amount: number) => {
  if (amount === 0 || !amount) return '';
  return new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const PivotTable: React.FC<PivotTableProps> = ({ data }) => {
  const normalizeStatus2Key = (s: any) => String(s ?? '').trim().toLowerCase();
  const canonicalizeStatus2 = (raw: any): string => {
    const s = String(raw ?? '').trim();
    const key = normalizeStatus2Key(s);
    if (!key || key === '-' || key === '—' || key === '–' || key === 'n/a' || key === 'na' || key === 'null') return 'manual';
    const canonical = STATUS_COLS.find(col => normalizeStatus2Key(col) === key);
    return canonical || s;
  };

  const pivotData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const map: Record<string, PivotRow> = {};
    
    data.forEach(item => {
      const key = `${item.tim}|${item.namaUser}`;
      if (!map[key]) {
        map[key] = {
          tim: item.tim,
          namaUser: item.namaUser,
          data: {},
          total: 0
        };
      }
      
      const s2 = canonicalizeStatus2(item.status2);
      const currentVal = map[key].data[s2] || 0;
      map[key].data[s2] = currentVal + item.nilaiTagihan;
      map[key].total += item.nilaiTagihan;
    });

    return Object.values(map).sort((a, b) => a.tim.localeCompare(b.tim) || a.namaUser.localeCompare(b.namaUser));
  }, [data]);

  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    
    pivotData.forEach(row => {
      STATUS_COLS.forEach(col => {
        totals[col] = (totals[col] || 0) + (row.data[col] || 0);
      });
      grandTotal += row.total;
    });
    
    return { totals, grandTotal };
  }, [pivotData]);

  const groupedData: Record<string, PivotRow[]> = {};
  pivotData.forEach(row => {
    if (!groupedData[row.tim]) groupedData[row.tim] = [];
    groupedData[row.tim].push(row);
  });

  if (data.length === 0) return null;

  return (
    <div className="table-modern-wrapper no-side-scroll">
      <div className="bg-white p-3 border-bottom d-flex align-items-center gap-2 flex-wrap">
        <span className="badge bg-primary-subtle text-primary border border-primary-subtle pivot-header-badge">Sum of Nilai Tagihan</span>
        <div className="d-flex gap-1">
            <span className="badge bg-light text-muted border pivot-header-badge">tim</span>
            <span className="badge bg-light text-muted border pivot-header-badge">Nama user</span>
            <span className="badge bg-light text-muted border pivot-header-badge">Status2</span>
        </div>
      </div>

      <div className="w-full">
        <table className="table table-modern table-hover align-middle">
          <thead>
            <tr className="text-center">
              <th className="text-start" style={{ width: '12%' }}>Tim</th>
              <th className="text-start" style={{ width: '15%' }}>Nama user</th>
              <th style={{ width: '8%' }}>Status2</th>
              {STATUS_COLS.map(col => (
                <th key={col} className="text-end" style={{ width: '10%' }}>{col}</th>
              ))}
              <th className="text-end bg-light fw-bold" style={{ width: '12%' }}>Grand Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedData).map(([tim, rows]) => (
              <React.Fragment key={tim}>
                {rows.map((row, idx) => (
                  <tr key={`${tim}-${idx}`}>
                    <td className="fw-semibold text-primary">
                      {idx === 0 ? (
                        <div className="d-flex align-items-center">
                          <span className="minus-icon">−</span>
                          {tim}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="d-flex align-items-center">
                        <span className="minus-icon">−</span>
                        {row.namaUser}
                      </div>
                    </td>
                    <td className="text-center text-muted opacity-50 small">manual</td>
                    {STATUS_COLS.map(col => (
                      <td key={col} className="text-end font-monospace">
                        {formatCurrency(row.data[col] || 0)}
                      </td>
                    ))}
                    <td className="text-end fw-bold bg-light-subtle">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot className="table-light border-top border-2">
            <tr className="fw-bold">
              <td colSpan={3} className="text-dark">Grand Total</td>
              {STATUS_COLS.map(col => (
                <td key={col} className="text-end font-monospace">
                  {formatCurrency(columnTotals.totals[col] || 0)}
                </td>
              ))}
              <td className="text-end bg-primary-subtle text-primary">
                {formatCurrency(columnTotals.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PivotTable;
