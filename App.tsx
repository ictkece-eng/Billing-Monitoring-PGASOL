
import React, { useState, useMemo, useEffect } from 'react';
import { BudgetRecord } from './types';
import { MOCK_DATA } from './constants';
import PivotTable from './components/PivotTable';
import DashboardCharts from './components/DashboardCharts';
import DetailedDataTable from './components/DetailedDataTable';
import BudgetInputForm from './components/BudgetInputForm';
import ExcelImport from './components/ExcelImport';
import { getBudgetInsights } from './services/geminiService';

const App: React.FC = () => {
  const [data, setData] = useState<BudgetRecord[]>(MOCK_DATA);
  const [filterPeriode, setFilterPeriode] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'pivot' | 'dashboard' | 'raw'>('pivot');
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const periodes = useMemo(() => {
    if (data.length === 0) return ['All'];
    const p = Array.from(new Set(data.map(d => d.periode))).filter(p => p !== '-').sort();
    return ['All', ...p];
  }, [data]);

  const filteredData = useMemo(() => {
    let result = data;
    
    // Period Filtering
    if (filterPeriode !== 'All') {
      result = result.filter(d => d.periode === filterPeriode);
    }

    // Search Query Filtering
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => 
        d.namaUser.toLowerCase().includes(q) ||
        d.tim.toLowerCase().includes(q) ||
        d.noRO.toLowerCase().includes(q) ||
        d.noBAST.toLowerCase().includes(q) ||
        d.keterangan.toLowerCase().includes(q) ||
        d.saNo.toLowerCase().includes(q) ||
        d.status2.toLowerCase().includes(q)
      );
    }

    return result;
  }, [data, filterPeriode, searchQuery]);

  const totalValue = useMemo(() => 
    filteredData.reduce((acc, curr) => acc + curr.nilaiTagihan, 0)
  , [filteredData]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  const fetchAiInsight = async () => {
    if (filteredData.length === 0) {
      alert("Silakan impor data terlebih dahulu untuk mendapatkan analisis AI.");
      return;
    }
    setLoadingInsight(true);
    try {
      const insight = await getBudgetInsights(filteredData);
      setAiInsight(insight);
    } finally {
      setLoadingInsight(false);
    }
  };

  const handleAddRecord = (record: BudgetRecord) => {
    setData(prev => [...prev, record]);
  };

  const handleImportExcel = (importedData: BudgetRecord[]) => {
    setData(importedData);
    alert(`Berhasil mengimpor ${importedData.length} data baru dari Excel!`);
  };

  useEffect(() => {
    setAiInsight(null);
  }, [filteredData]);

  return (
    <div className="min-h-screen bg-slate-50">
      {isInputOpen && (
        <BudgetInputForm 
          onAdd={handleAddRecord} 
          onClose={() => setIsInputOpen(false)} 
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none">Budget Monitoring</h1>
                <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wider">Asset Management & Cost Control</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <ExcelImport onImport={handleImportExcel} />
                <button
                  onClick={() => setIsInputOpen(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md shadow-blue-100"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Data
                </button>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('pivot')}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'pivot' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Tabel Pivot
                </button>
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'raw' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Data Mentah
                </button>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Visualisasi
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls & Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Filter Periode</label>
              <select
                value={filterPeriode}
                onChange={(e) => setFilterPeriode(e.target.value)}
                className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm font-medium focus:ring-blue-500 focus:border-blue-500 p-2"
              >
                {periodes.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Pencarian Cepat</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari Nama, Tim, No RO..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-blue-500 focus:border-blue-500 p-2 pl-9 outline-none"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-blue-600 p-6 rounded-xl text-white shadow-lg shadow-blue-200 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Total Tagihan {filterPeriode === 'All' ? 'Keseluruhan' : `Bulan ${filterPeriode}`}</p>
            <h2 className="text-2xl font-black">{formatCurrency(totalValue)}</h2>
            {searchQuery && <p className="text-[9px] mt-2 opacity-70">Menampilkan hasil pencarian "{searchQuery}"</p>}
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <div className="flex justify-between items-center mb-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Analyst Insight</p>
                <button 
                  onClick={fetchAiInsight}
                  disabled={loadingInsight || data.length === 0}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:text-slate-300"
                >
                  {loadingInsight ? 'Memproses...' : 'Dapatkan Analisis'}
                </button>
            </div>
            <div className="text-xs text-slate-600 line-clamp-3">
              {data.length === 0 ? "Impor data Excel untuk melihat analisis finansial." : (aiInsight || "Gunakan AI untuk menganalisis tren budget Anda.")}
            </div>
          </div>
        </div>

        {/* Dynamic Content */}
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
            <div className="p-4 bg-slate-50 rounded-full mb-4">
                <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </div>
            <p className="text-lg font-bold text-slate-500">Aplikasi Monitor Budget Siap</p>
            <p className="text-sm max-w-xs text-center mt-1">Silakan impor file Excel abang yang berisi kolom: Status, Nama User, Tim, Periode, dan Nilai Tagihan.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {activeTab === 'pivot' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                    Tabel Pivot Rekapitulasi
                  </h3>
                  <div className="text-[10px] text-slate-400 font-medium italic">Digabungkan per Tim & User</div>
                </div>
                <PivotTable data={filteredData} />
              </div>
            )}

            {activeTab === 'raw' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Laporan Data Lengkap
                  </h3>
                </div>
                <DetailedDataTable data={filteredData} />
              </div>
            )}

            {activeTab === 'dashboard' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                    Visualisasi & Analytics
                </h3>
                <DashboardCharts data={filteredData} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Budget Management System v3.0 • Developed for Corporate Efficiency</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
