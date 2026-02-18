
import React, { useMemo, useState } from 'react';
import { BudgetRecord } from '../types';

interface DetailedDataTableProps {
  data: BudgetRecord[];
}

const DetailedDataTable: React.FC<DetailedDataTableProps> = ({ data }) => {
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(val);

  const [filters, setFilters] = useState({
    status: '',
    namaUser: '',
    tim: '',
    periode: '',
    nilaiMin: '',
    nilaiMax: '',
    noRO: '',
    tglBAST: '',
    noBAST: '',
    status2: '',
    keterangan: '',
  });

  const filteredRows = useMemo(() => {
    const q = (s: string) => s.trim().toLowerCase();
    const f = {
      status: q(filters.status),
      namaUser: q(filters.namaUser),
      tim: q(filters.tim),
      periode: q(filters.periode),
      noRO: q(filters.noRO),
      tglBAST: q(filters.tglBAST),
      noBAST: q(filters.noBAST),
      status2: q(filters.status2),
      keterangan: q(filters.keterangan),
    };

    const min = filters.nilaiMin.trim() === '' ? null : Number(filters.nilaiMin);
    const max = filters.nilaiMax.trim() === '' ? null : Number(filters.nilaiMax);

    return data.filter(row => {
      if (f.status && (row.status || '').toLowerCase() !== f.status) return false;
      if (f.namaUser && !row.namaUser.toLowerCase().includes(f.namaUser)) return false;
      if (f.tim && !row.tim.toLowerCase().includes(f.tim)) return false;
      if (f.periode && !(row.periode || '').toLowerCase().includes(f.periode)) return false;

      if (min !== null && !Number.isNaN(min) && row.nilaiTagihan < min) return false;
      if (max !== null && !Number.isNaN(max) && row.nilaiTagihan > max) return false;

      if (f.noRO && !(row.noRO || '').toLowerCase().includes(f.noRO)) return false;
      if (f.tglBAST && !(row.tglBAST || '').toLowerCase().includes(f.tglBAST)) return false;
      if (f.noBAST && !(row.noBAST || '').toLowerCase().includes(f.noBAST)) return false;
      if (f.status2 && !(row.status2 || '').toLowerCase().includes(f.status2)) return false;
      if (f.keterangan && !(row.keterangan || '').toLowerCase().includes(f.keterangan)) return false;
      return true;
    });
  }, [data, filters]);

  const resetFilters = () => {
    setFilters({
      status: '',
      namaUser: '',
      tim: '',
      periode: '',
      nilaiMin: '',
      nilaiMax: '',
      noRO: '',
      tglBAST: '',
      noBAST: '',
      status2: '',
      keterangan: '',
    });
  };

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

            {/* Filter row (header filters) */}
            <tr className="table-filter-row">
              <th className="text-center">
                <button
                  type="button"
                  className="btn btn-sm btn-light border px-2 py-1"
                  style={{ fontSize: '10px' }}
                  onClick={resetFilters}
                  title="Reset semua filter"
                >
                  Reset
                </button>
              </th>
              <th>
                <select
                  className="form-select form-select-sm"
                  style={{ fontSize: '10px' }}
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">All</option>
                  <option value="Completed">Completed</option>
                  <option value="On Progress">On Progress</option>
                </select>
              </th>
              <th>
                <input
                  className="form-control form-control-sm"
                  style={{ fontSize: '10px' }}
                  placeholder="Cari..."
                  value={filters.namaUser}
                  onChange={(e) => setFilters(prev => ({ ...prev, namaUser: e.target.value }))}
                />
              </th>
              <th>
                <input
                  className="form-control form-control-sm"
                  style={{ fontSize: '10px' }}
                  placeholder="Cari..."
                  value={filters.tim}
                  onChange={(e) => setFilters(prev => ({ ...prev, tim: e.target.value }))}
                />
              </th>
              <th>
                <input
                  className="form-control form-control-sm"
                  style={{ fontSize: '10px' }}
                  placeholder="Jan-25 / 2025-01"
                  value={filters.periode}
                  onChange={(e) => setFilters(prev => ({ ...prev, periode: e.target.value }))}
                />
              </th>
              <th>
                <div className="d-flex gap-1">
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    style={{ fontSize: '10px', minWidth: '60px' }}
                    placeholder="Min"
                    value={filters.nilaiMin}
                    onChange={(e) => setFilters(prev => ({ ...prev, nilaiMin: e.target.value }))}
                  />
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    style={{ fontSize: '10px', minWidth: '60px' }}
                    placeholder="Max"
                    value={filters.nilaiMax}
                    onChange={(e) => setFilters(prev => ({ ...prev, nilaiMax: e.target.value }))}
                  />
                </div>
              </th>
              <th>
                <input
                  className="form-control form-control-sm"
                  style={{ fontSize: '10px' }}
                  placeholder="Cari..."
                  value={filters.noRO}
                  onChange={(e) => setFilters(prev => ({ ...prev, noRO: e.target.value }))}
                />
              </th>
              <th>
                <input
                  className="form-control form-control-sm"
                  style={{ fontSize: '10px' }}
                  placeholder="DD-MM-YYYY"
                  value={filters.tglBAST}
                  onChange={(e) => setFilters(prev => ({ ...prev, tglBAST: e.target.value }))}
                />
              </th>
              <th>
                <input
                  className="form-control form-control-sm"
                  style={{ fontSize: '10px' }}
                  placeholder="Cari..."
                  value={filters.noBAST}
                  onChange={(e) => setFilters(prev => ({ ...prev, noBAST: e.target.value }))}
                />
              </th>
              <th>
                <input
                  className="form-control form-control-sm"
                  style={{ fontSize: '10px' }}
                  placeholder="Cari..."
                  value={filters.status2}
                  onChange={(e) => setFilters(prev => ({ ...prev, status2: e.target.value }))}
                />
              </th>
              <th>
                <input
                  className="form-control form-control-sm"
                  style={{ fontSize: '10px' }}
                  placeholder="Cari..."
                  value={filters.keterangan}
                  onChange={(e) => setFilters(prev => ({ ...prev, keterangan: e.target.value }))}
                />
              </th>
            </tr>
          </thead>
          <tbody className="border-top-0">
            {filteredRows.map((row, i) => (
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
        <span className="text-muted" style={{ fontSize: '10px' }}>Showing <strong>{filteredRows.length}</strong> items</span>
        <span className="text-muted" style={{ fontSize: '9px' }}>Modern UI Framework Optimized</span>
      </div>
    </div>
  );
};

export default DetailedDataTable;
