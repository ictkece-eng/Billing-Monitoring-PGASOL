
import React, { useMemo } from 'react';
import { BudgetRecord, PivotRow } from '../types';
import { STATUS_COLS } from '../constants';

interface PivotTableProps {
  data: BudgetRecord[];
}

const formatCurrency = (amount: number) => {
  if (amount === 0 || !amount) return '';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace('Rp', 'Rp ');
};

const PivotTable: React.FC<PivotTableProps> = ({ data }) => {
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
      
      const s2 = item.status2 || 'manual';
      const currentVal = map[key].data[s2] || 0;
      map[key].data[s2] = currentVal + item.nilaiTagihan;
      map[key].total += item.nilaiTagihan;
    });

    // Sort by team then by user name
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
    <div className="pivot-bootstrap-container bg-white shadow-sm border rounded overflow-hidden">
      {/* Bootstrap styled header label section */}
      <div className="bg-light p-2 border-bottom d-flex align-items-center gap-3">
        <span className="badge bg-primary text-white">Sum of Nilai Tagihan2</span>
        <div className="d-flex gap-2">
            <span className="badge border text-dark fw-normal d-flex align-items-center gap-1">
                tim <i className="bi bi-caret-down-fill"></i>
            </span>
            <span className="badge border text-dark fw-normal d-flex align-items-center gap-1">
                Nama user <i className="bi bi-caret-down-fill"></i>
            </span>
            <span className="badge border text-dark fw-normal d-flex align-items-center gap-1">
                Status2 <i className="bi bi-caret-down-fill"></i>
            </span>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-bordered table-sm table-hover mb-0">
          <thead className="table-primary text-dark">
            <tr>
              <th className="px-3" style={{ minWidth: '220px' }}>tim</th>
              <th className="px-3" style={{ minWidth: '220px' }}>Nama user</th>
              <th className="px-3" style={{ minWidth: '100px' }}>Status2</th>
              {STATUS_COLS.map(col => (
                <th key={col} className="text-end px-3" style={{ minWidth: '130px' }}>{col}</th>
              ))}
              <th className="text-end px-3 bg-primary-subtle fw-bold">Grand Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedData).map(([tim, rows]) => (
              <React.Fragment key={tim}>
                {rows.map((row, idx) => (
                  <tr key={`${tim}-${idx}`} className="align-middle">
                    <td className="px-3 fw-bold text-primary">
                      {idx === 0 ? (
                        <div className="d-flex align-items-center">
                          <span className="minus-box">−</span>
                          {tim}
                        </div>
                      ) : (
                        <div style={{ marginLeft: '20px' }}></div>
                      )}
                    </td>
                    <td className="px-3 text-secondary">
                      <div className="d-flex align-items-center">
                        <span className="minus-box">−</span>
                        {row.namaUser}
                      </div>
                    </td>
                    <td className="bg-light bg-opacity-10"></td>
                    {STATUS_COLS.map(col => (
                      <td key={col} className="text-end px-3 font-monospace text-muted">
                        {formatCurrency(row.data[col] || 0)}
                      </td>
                    ))}
                    <td className="text-end px-3 fw-bold table-active">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot className="table-primary text-dark fw-bold">
            <tr className="align-middle">
              <td colSpan={3} className="px-3">Grand Total</td>
              {STATUS_COLS.map(col => (
                <td key={col} className="text-end px-3">
                  {formatCurrency(columnTotals.totals[col] || 0)}
                </td>
              ))}
              <td className="text-end px-3 bg-primary-subtle border-start border-2 border-primary">
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
