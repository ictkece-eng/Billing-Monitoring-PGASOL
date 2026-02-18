
import React, { useState, useMemo, useEffect } from 'react';
import { BudgetRecord } from './types';
import { CONTRACT_VALUE_IDR, MOCK_DATA, STATUS_COLS } from './constants';
import PivotTable from './components/PivotTable';
import DashboardCharts from './components/DashboardCharts';
import DetailedDataTable from './components/DetailedDataTable';
import BudgetInputForm from './components/BudgetInputForm';
import ExcelImport from './components/ExcelImport';
import { getBudgetInsights } from './services/geminiService';

type PeriodeOption = { value: string; label: string };

const ALL_PERIODE_VALUE = 'All';
const ALL_PERIODE_LABEL = 'Semua Periode';

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

const normalizePeriodeToYearMonthKey = (raw?: string): string | null => {
  const s = (raw || '').trim();
  if (!s || s === '-') return null;

  // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY (format produced by ExcelImport for dates)
  // Treat as a month bucket (ignore day)
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
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};

const App: React.FC = () => {
  const [data, setData] = useState<BudgetRecord[]>(MOCK_DATA);
  const [filterPeriode, setFilterPeriode] = useState<string>(ALL_PERIODE_VALUE);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'pivot' | 'dashboard' | 'raw'>('pivot');
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const periodes = useMemo<PeriodeOption[]>(() => {
    if (data.length === 0) return [{ value: ALL_PERIODE_VALUE, label: ALL_PERIODE_LABEL }];

    const keys = Array.from(
      new Set(
        data
          .map(d => normalizePeriodeToYearMonthKey(d.periode))
          .filter((k): k is string => Boolean(k))
      )
    ).sort();

    return [
      { value: ALL_PERIODE_VALUE, label: ALL_PERIODE_LABEL },
      ...keys.map(k => ({ value: k, label: formatYearMonthKeyToLabel(k) })),
    ];
  }, [data]);

  // Keep selected periode valid (avoids messy/blank select labels if underlying options change)
  useEffect(() => {
    if (filterPeriode === ALL_PERIODE_VALUE) return;
    const exists = periodes.some(p => p.value === filterPeriode);
    if (!exists) setFilterPeriode(ALL_PERIODE_VALUE);
  }, [filterPeriode, periodes]);

  const filteredData = useMemo(() => {
    let result = data;
    
    // Period Filtering
    if (filterPeriode !== ALL_PERIODE_VALUE) {
      result = result.filter(d => normalizePeriodeToYearMonthKey(d.periode) === filterPeriode);
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

  // Total serapan dari seluruh data (untuk perbandingan dengan nilai kontrak awal)
  const totalAbsorbedAll = useMemo(() => 
    data.reduce((acc, curr) => acc + curr.nilaiTagihan, 0)
  , [data]);

  // Anggaran Kontrak (Nilai Awal) + Analisis Serapan
  const contractValue = CONTRACT_VALUE_IDR;
  // IMPORTANT: gunakan seluruh data agar sisa anggaran & estimasi tidak berubah saat filter periode/search
  const absorbedValue = totalAbsorbedAll;
  // Snapshot berdasarkan filter yang sedang aktif (untuk perbandingan)
  const absorbedValueFiltered = totalValue;
  const remainingValue = useMemo(
    () => Math.max(contractValue - absorbedValue, 0),
    [contractValue, absorbedValue]
  );
  const remainingValueFiltered = useMemo(
    () => Math.max(contractValue - absorbedValueFiltered, 0),
    [contractValue, absorbedValueFiltered]
  );
  const overBudgetValue = useMemo(
    () => Math.max(absorbedValue - contractValue, 0),
    [contractValue, absorbedValue]
  );
  const overBudgetValueFiltered = useMemo(
    () => Math.max(absorbedValueFiltered - contractValue, 0),
    [contractValue, absorbedValueFiltered]
  );
  const absorbedPct = useMemo(() => {
    if (contractValue <= 0) return 0;
    return Math.min((absorbedValue / contractValue) * 100, 100);
  }, [contractValue, absorbedValue]);
  const absorbedPctFiltered = useMemo(() => {
    if (contractValue <= 0) return 0;
    return Math.min((absorbedValueFiltered / contractValue) * 100, 100);
  }, [contractValue, absorbedValueFiltered]);

  // Estimasi sisa bulan: dihitung dari data per bulan (periode) dan memperhitungkan bulan kosong (0)
  const monthlyRunRate = useMemo(() => {
    // aggregate by normalized Year-Month
    const totalsByYM = data.reduce((acc, curr) => {
      const key = normalizePeriodeToYearMonthKey(curr.periode);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + curr.nilaiTagihan;
      return acc;
    }, {} as Record<string, number>);

    const keys = Object.keys(totalsByYM).sort();
    const monthsWithData = keys.length;
    const sum = keys.reduce((s, k) => s + (totalsByYM[k] || 0), 0);

    if (monthsWithData === 0) {
      return {
        monthsCount: 0,
        monthsWithData: 0,
        averagePerMonth: 0,
        mode: 'unparseable' as const,
      };
    }

    // compute full month range between min & max and include missing months as 0
    const [minY, minM] = keys[0].split('-').map(Number);
    const [maxY, maxM] = keys[keys.length - 1].split('-').map(Number);
    const totalMonthsInRange = (maxY - minY) * 12 + (maxM - minM) + 1;
    const avg = totalMonthsInRange > 0 ? sum / totalMonthsInRange : 0;

    return {
      monthsCount: totalMonthsInRange,
      monthsWithData,
      averagePerMonth: avg,
      mode: 'range' as const,
    };
  }, [data]);

  const monthlyRunRateFiltered = useMemo(() => {
    const totalsByYM = filteredData.reduce((acc, curr) => {
      const key = normalizePeriodeToYearMonthKey(curr.periode);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + curr.nilaiTagihan;
      return acc;
    }, {} as Record<string, number>);

    const keys = Object.keys(totalsByYM).sort();
    const monthsWithData = keys.length;
    const sum = keys.reduce((s, k) => s + (totalsByYM[k] || 0), 0);

    if (monthsWithData === 0) {
      return {
        monthsCount: 0,
        monthsWithData: 0,
        averagePerMonth: 0,
        mode: 'unparseable' as const,
      };
    }

    const [minY, minM] = keys[0].split('-').map(Number);
    const [maxY, maxM] = keys[keys.length - 1].split('-').map(Number);
    const totalMonthsInRange = (maxY - minY) * 12 + (maxM - minM) + 1;
    const avg = totalMonthsInRange > 0 ? sum / totalMonthsInRange : 0;

    return {
      monthsCount: totalMonthsInRange,
      monthsWithData,
      averagePerMonth: avg,
      mode: 'range' as const,
    };
  }, [filteredData]);

  const estimatedMonthsRemaining = useMemo(() => {
    if (overBudgetValue > 0) return 0;
    const avg = monthlyRunRate.averagePerMonth;
    if (avg <= 0) return null;
    return remainingValue / avg;
  }, [monthlyRunRate.averagePerMonth, remainingValue, overBudgetValue]);

  const estimatedMonthsRemainingFiltered = useMemo(() => {
    if (overBudgetValueFiltered > 0) return 0;
    const avg = monthlyRunRateFiltered.averagePerMonth;
    if (avg <= 0) return null;
    return remainingValueFiltered / avg;
  }, [monthlyRunRateFiltered.averagePerMonth, remainingValueFiltered, overBudgetValueFiltered]);

  // Specific Status Totals for the Cards
  const statusSummaries = useMemo(() => {
    const summaries: Record<string, number> = {};
    STATUS_COLS.forEach(status => {
      summaries[status] = filteredData
        .filter(item => item.status2 === status)
        .reduce((sum, item) => sum + item.nilaiTagihan, 0);
    });
    return summaries;
  }, [filteredData]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  // Build a stable fingerprint for de-duplication.
  // Goal: if the same row (same fields + same nilai) is imported again, it will NOT overwrite or duplicate.
  const getRecordFingerprint = (r: BudgetRecord) => {
    const parts = [
      (r.namaUser || '').trim().toLowerCase(),
      (r.tim || '').trim().toLowerCase(),
      (r.periode || '').trim().toLowerCase(),
      String(Number(r.nilaiTagihan || 0)),
      (r.noRO || '').trim().toLowerCase(),
      (r.tglBAST || '').trim().toLowerCase(),
      (r.noBAST || '').trim().toLowerCase(),
      (r.status2 || '').trim().toLowerCase(),
      (r.saNo || '').trim().toLowerCase(),
    ];
    return parts.join('|');
  };

  // Helper function for colorful card themes
  const getStatusTheme = (status: string) => {
    switch (status) {
      case 'Invoice Internal': 
        return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: 'bg-blue-500', icon: 'text-blue-400' };
      case 'po belum muncul': 
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: 'bg-amber-500', icon: 'text-amber-400' };
      case 'REQ Reject by my ssc(PHR)': 
        return { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', bar: 'bg-rose-500', icon: 'text-rose-400' };
      case 'REQ SA': 
        return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-500', icon: 'text-emerald-400' };
      case 'Review 1': 
        return { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', bar: 'bg-violet-500', icon: 'text-violet-400' };
      case 'VOW': 
        return { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', bar: 'bg-cyan-500', icon: 'text-cyan-400' };
      default: 
        return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', bar: 'bg-slate-500', icon: 'text-slate-400' };
    }
  };

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
    setData(prev => {
      const existing = new Set(prev.map(getRecordFingerprint));
      let skipped = 0;

      const toAdd: BudgetRecord[] = [];
      for (const row of importedData) {
        const fp = getRecordFingerprint(row);
        if (existing.has(fp)) {
          skipped++;
          continue;
        }
        existing.add(fp);
        toAdd.push(row);
      }

      // Feedback after state update (async safe)
      queueMicrotask(() => {
        alert(
          `Import selesai. Total baris file: ${importedData.length}. Ditambahkan: ${toAdd.length}. Duplikat dilewati: ${skipped}.`
        );
      });

      return [...prev, ...toAdd];
    });
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
              <div className="relative">
                <select
                  value={filterPeriode}
                  onChange={(e) => setFilterPeriode(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-blue-500 focus:border-blue-500 p-2 pr-9"
                >
                  {periodes.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <svg
                  className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
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
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-xl text-white shadow-xl relative overflow-hidden group">
            <div className="absolute -right-6 -bottom-6 opacity-20 group-hover:scale-110 transition-transform duration-500">
                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Grand Total Tagihan</p>
            <h2 className="text-3xl font-black mb-1 safe-number-tight tabular-nums tracking-tight" title={formatCurrency(totalValue)}>{formatCurrency(totalValue)}</h2>
            <div className="flex items-center gap-2 mt-2">
                <span className="bg-white/20 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">
                  {filterPeriode === ALL_PERIODE_VALUE ? ALL_PERIODE_LABEL : formatYearMonthKeyToLabel(filterPeriode)}
                </span>
                {searchQuery && <span className="text-[9px] opacity-70 italic truncate">Filtered by "{searchQuery}"</span>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Financial Intelligence</p>
                </div>
                <button 
                  onClick={fetchAiInsight}
                  disabled={loadingInsight || data.length === 0}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:text-slate-300"
                >
                  {loadingInsight ? 'Analysing...' : 'Generate Insight'}
                </button>
            </div>
            <div className="text-[11px] leading-relaxed text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 min-h-[50px] italic">
              {data.length === 0 ? "Import data untuk analisis." : (aiInsight || "Klik tombol di atas untuk melihat analisis pengeluaran otomatis oleh AI.")}
            </div>
          </div>
        </div>

        {/* Contract Budget Card */}
        <div className="mb-10">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6">
              <div className="flex flex-col gap-5">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Anggaran Kontrak</p>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 mt-1 safe-number-tight tabular-nums tracking-tight" title={formatCurrency(contractValue)}>{formatCurrency(contractValue)}</h2>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Angka utama dihitung dari <span className="font-semibold">seluruh data</span> (nilai kontrak awal). Baris kecil menunjukkan snapshot sesuai filter periode/pencarian.
                  </p>
                </div>

                <div className="flex flex-nowrap gap-4 overflow-x-auto pb-2 w-full">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 min-w-[280px] w-max flex-none">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Terserap</p>
                    <p className="text-xl font-black text-slate-900 mt-1 safe-number tabular-nums tracking-tight" title={formatCurrency(absorbedValue)}>{formatCurrency(absorbedValue)}</p>
                    <p className="text-[12px] text-slate-500 font-medium mt-1 tabular-nums">{absorbedPct.toFixed(1)}% dari kontrak</p>
                    <p className="text-[12px] text-slate-500/80 mt-2 pt-2 border-t border-slate-200/60">
                      Filtered: <span className="font-semibold safe-number-inline" title={formatCurrency(absorbedValueFiltered)}>{formatCurrency(absorbedValueFiltered)}</span> ({absorbedPctFiltered.toFixed(1)}%)
                    </p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 min-w-[280px] w-max flex-none">
                    <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Sisa Anggaran</p>
                    <p className="text-xl font-black text-emerald-900 mt-1 safe-number tabular-nums tracking-tight" title={formatCurrency(remainingValue)}>{formatCurrency(remainingValue)}</p>
                    <p className="text-[12px] text-emerald-800/80 font-medium mt-1">Budget tersedia</p>
                    <p className="text-[12px] text-emerald-900/70 mt-2 pt-2 border-t border-emerald-200/70">
                      Filtered: <span className="font-semibold safe-number-inline" title={formatCurrency(remainingValueFiltered)}>{formatCurrency(remainingValueFiltered)}</span>
                    </p>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 min-w-[280px] w-max flex-none">
                    <p className="text-[11px] font-bold text-rose-700 uppercase tracking-widest">Melebihi</p>
                    <p className="text-xl font-black text-rose-900 mt-1 safe-number tabular-nums tracking-tight" title={formatCurrency(overBudgetValue)}>{formatCurrency(overBudgetValue)}</p>
                    <p className="text-[12px] text-rose-800/80 font-medium mt-1">Jika terserap &gt; kontrak</p>
                    <p className="text-[12px] text-rose-900/70 mt-2 pt-2 border-t border-rose-200/70">
                      Filtered: <span className="font-semibold safe-number-inline" title={formatCurrency(overBudgetValueFiltered)}>{formatCurrency(overBudgetValueFiltered)}</span>
                    </p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 min-w-[280px] w-max flex-none">
                    <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-widest">Estimasi Sisa</p>
                    <p className="text-xl font-black text-indigo-900 mt-1 tabular-nums tracking-tight">
                      {estimatedMonthsRemaining === null
                        ? '—'
                        : `≈ ${estimatedMonthsRemaining.toFixed(1)} bln`}
                    </p>
                    <p className="text-[12px] text-indigo-900/70 font-medium mt-1 leading-snug">
                      {monthlyRunRate.mode === 'unparseable'
                        ? 'Periode belum terbaca sebagai bulan'
                        : `Avg ${formatCurrency(monthlyRunRate.averagePerMonth)}/bln (rentang ${monthlyRunRate.monthsCount} bln, data ${monthlyRunRate.monthsWithData} bln)`}
                    </p>
                    <p className="text-[12px] text-indigo-900/70 mt-2 pt-2 border-t border-indigo-200/70 leading-snug">
                      Filtered: {
                        estimatedMonthsRemainingFiltered === null
                          ? '—'
                          : `≈ ${estimatedMonthsRemainingFiltered.toFixed(1)} bln`
                      }
                      {monthlyRunRateFiltered.mode === 'range' && monthlyRunRateFiltered.averagePerMonth > 0
                        ? ` • Avg ${formatCurrency(monthlyRunRateFiltered.averagePerMonth)}/bln`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress serapan</span>
                  <span className="text-[10px] font-bold text-slate-600">{absorbedPct.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-700"
                    style={{ width: `${absorbedPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Billing Summary Cards - COLORFUL VERSION */}
        {data.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
            {STATUS_COLS.map((status) => {
              const theme = getStatusTheme(status);
              const percentage = totalValue > 0 ? (statusSummaries[status] / totalValue) * 100 : 0;
              
              return (
                <div key={status} className={`${theme.bg} ${theme.border} border p-4 rounded-xl shadow-sm hover:shadow-md transition-all group overflow-hidden relative`}>
                  {/* Subtle decorative circle */}
                  <div className={`absolute -right-2 -top-2 w-8 h-8 rounded-full opacity-10 ${theme.bar}`}></div>
                  
                  <p className={`text-[9px] font-extrabold uppercase tracking-tight mb-2 truncate ${theme.text}`} title={status}>
                    {status}
                  </p>
                  <p className="text-base font-black text-slate-900 leading-none safe-number" title={formatCurrency(statusSummaries[status] || 0)}>
                    {formatCurrency(statusSummaries[status] || 0)}
                  </p>
                  
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-[9px] font-bold ${theme.text} opacity-70`}>{percentage.toFixed(1)}% of total</span>
                    <div className="w-16 bg-white/50 h-1.5 rounded-full overflow-hidden border border-black/5">
                      <div 
                        className={`${theme.bar} h-full rounded-full transition-all duration-1000`} 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dynamic Content */}
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400">
            <div className="p-5 bg-slate-50 rounded-full mb-5">
                <svg className="w-16 h-16 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </div>
            <p className="text-xl font-bold text-slate-700">Aplikasi Monitor Budget Siap</p>
            <p className="text-sm max-w-sm text-center mt-2 px-6">Unggah file Excel Anda yang berisi rekapitulasi budget untuk melihat visualisasi data otomatis dan analisis AI.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {activeTab === 'pivot' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center justify-between mb-5 px-1">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-1">
                      <div className="w-2 h-6 bg-blue-600 rounded-full"></div>
                      Tabel Pivot Rekapitulasi
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">Konsolidasi data berdasarkan Tim dan Pengguna</p>
                  </div>
                </div>
                <PivotTable data={filteredData} />
              </div>
            )}

            {activeTab === 'raw' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center justify-between mb-5 px-1">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-1">
                      <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
                      Database Transaksi Lengkap
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">Data mentah dari impor sistem atau Excel</p>
                  </div>
                </div>
                <DetailedDataTable data={filteredData} />
              </div>
            )}

            {activeTab === 'dashboard' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="mb-6 px-1">
                  <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-1">
                    <div className="w-2 h-6 bg-indigo-500 rounded-full"></div>
                    Insight & Visualisasi
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Analisis grafis untuk pengambilan keputusan cepat</p>
                </div>
                <DashboardCharts data={filteredData} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-16 border-t border-slate-200 mt-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="inline-block bg-slate-100 px-4 py-1.5 rounded-full mb-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Budget Management System v3.0 Powered by Gemini
                </p>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">© 2025 Corporate Asset Management. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
