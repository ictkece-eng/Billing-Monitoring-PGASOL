
import React from 'react';
import { BudgetRecord } from '../types';

interface DetailedDataTableProps {
  data: BudgetRecord[];
}

const DetailedDataTable: React.FC<DetailedDataTableProps> = ({ data }) => {
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(val);

  return (
    <div className="table-modern-wrapper no-side-scroll">
      <div className="w-full max-h-[700px] overflow-y-auto">
        <table className="table table-modern table-hover align-middle mb-0">
          <thead className="sticky-top">
            <tr>
              <th className="text-center" style={{ width: '4%' }}>No.</th>
              <th style={{ width: '8%' }}>Status</th>
              <th style={{ width: '12%' }}>Nama User</th>
              <th style={{ width: '10%' }}>Tim</th>
              <th className="text-center" style={{ width: '8%' }}>Periode</th>
              <th className="text-end" style={{ width: '10%' }}>Nilai</th>
              <th style={{ width: '8%' }}>No RO</th>
              <th style={{ width: '8%' }}>Tgl BAST</th>
              <th style={{ width: '8%' }}>No BAST</th>
              <th style={{ width: '8%' }}>Status2</th>
              <th style={{ width: '16%' }}>Keterangan</th>
            </tr>
          </thead>
          <tbody className="border-top-0">
            {data.map((row, i) => (
              <tr key={row.id}>
                <td className="text-center text-muted fw-medium">{i + 1}</td>
                <td>
                  <span className={`badge rounded-pill ${
                    row.status === 'Completed' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-primary-subtle text-primary border border-primary-subtle'
                  }`} style={{ fontSize: '8px' }}>
                    {row.status}
                  </span>
                </td>
                <td className="fw-semibold">{row.namaUser}</td>
                <td>{row.tim}</td>
                <td className="text-center">{row.periode}</td>
                <td className="text-end font-monospace fw-bold">{formatCurrency(row.nilaiTagihan)}</td>
                <td className="text-muted truncate" title={row.noRO}>{row.noRO}</td>
                <td className="text-muted">{row.tglBAST}</td>
                <td className="text-muted small break-all">{row.noBAST}</td>
                <td className="text-muted">{row.status2}</td>
                <td className="text-muted italic small break-words">{row.keterangan || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-light px-3 py-2 d-flex justify-content-between align-items-center border-top">
        <span className="text-muted" style={{ fontSize: '10px' }}>Showing <strong>{data.length}</strong> items</span>
        <span className="text-muted" style={{ fontSize: '9px' }}>Modern UI Framework Optimized</span>
      </div>
    </div>
  );
};

export default DetailedDataTable;
