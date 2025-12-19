
import React from 'react';
import { BudgetRecord } from '../types';

interface DetailedDataTableProps {
  data: BudgetRecord[];
}

const DetailedDataTable: React.FC<DetailedDataTableProps> = ({ data }) => {
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto max-h-[600px]">
        <table className="min-w-full text-[11px] text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100 text-center w-12">No.</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">Status</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">Nama User</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">Tim</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">Periode</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">Nilai Tagihan</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">No RO</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">Tgl BAST</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">No BAST</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">Status2</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase border-r border-slate-100">SA No</th>
              <th className="px-3 py-3 font-bold text-slate-500 uppercase">Keterangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, i) => (
              <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-3 py-2 border-r border-slate-50 text-center text-slate-400 font-medium">{i + 1}</td>
                <td className="px-3 py-2 border-r border-slate-50">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    row.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2 border-r border-slate-50 font-medium text-slate-700">{row.namaUser}</td>
                <td className="px-3 py-2 border-r border-slate-50 text-slate-600">{row.tim}</td>
                <td className="px-3 py-2 border-r border-slate-50 text-slate-600 text-center">{row.periode}</td>
                <td className="px-3 py-2 border-r border-slate-50 text-right font-mono text-slate-900">{formatCurrency(row.nilaiTagihan)}</td>
                <td className="px-3 py-2 border-r border-slate-50 text-slate-500">{row.noRO}</td>
                <td className="px-3 py-2 border-r border-slate-50 text-slate-500">{row.tglBAST}</td>
                <td className="px-3 py-2 border-r border-slate-50 text-slate-500">{row.noBAST}</td>
                <td className="px-3 py-2 border-r border-slate-50 text-slate-500">{row.status2}</td>
                <td className="px-3 py-2 border-r border-slate-50 text-slate-500">{row.saNo}</td>
                <td className="px-3 py-2 text-slate-400 italic max-w-xs truncate">{row.keterangan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex justify-between items-center">
        <span className="text-[10px] text-slate-500 font-medium">Total: {data.length} baris data mentah</span>
      </div>
    </div>
  );
};

export default DetailedDataTable;
