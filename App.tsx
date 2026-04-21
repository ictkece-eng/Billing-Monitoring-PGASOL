import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BudgetRecord } from './types';
import { CONTRACT_VALUE_IDR, MOCK_DATA, STATUS_COLS } from './constants';
import PivotTable from './components/PivotTable';
import DashboardCharts from './components/DashboardCharts';
import DetailedDataTable from './components/DetailedDataTable';
import BudgetInputForm from './components/BudgetInputForm';
import ExcelImport from './components/ExcelImport';
import Status2DetailModal from './components/Status2DetailModal';
import UploadHistoryModal from './components/UploadHistoryModal';
import { getBudgetInsights } from './services/geminiService';
import { fetchBudgetRecordsFromTiDB, getTiDBDuplicateRowNumbers, uploadBudgetRecordsToTiDB } from './services/tidbService';
import NotaPembatalanMenu from './components/NotaPembatalanMenu';
import ImportNotaPajak from './components/ImportNotaPajak';
import { ocrImageToText } from './services/ocrService';
import { parseNotaPajakToPembatalan, NotaPembatalanData } from './services/notaPembatalanParser';
import { exportNotaPembatalanToPDF } from './services/notaPembatalanExport';

type PeriodeOption = { value: string; label: string };

const ALL_PERIODE_LABEL = 'Semua Periode';
const ALL_YEAR_VALUE = 'AllYear';
const ALL_MONTH_VALUE = 'AllMonth';

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

const extractYearMonthParts = (raw?: string): { year: number; month: number; key: string } | null => {
  const key = normalizePeriodeToYearMonthKey(raw);
  if (!key) return null;
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month, key };
};

const formatMonthNumberToLabel = (month: number) => {
  if (month < 1 || month > 12) return String(month);
  return new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2000, month - 1, 1));
};

const shiftYearMonthKey = (key: string, monthsToAdd: number) => {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;

  const d = new Date(year, month - 1 + monthsToAdd, 1);
  return toYearMonthKey(d.getFullYear(), d.getMonth() + 1);
};

const App: React.FC = () => {
  const [data, setData] = useState<BudgetRecord[]>(MOCK_DATA);
  const [filterYear, setFilterYear] = useState<string>(ALL_YEAR_VALUE);
  const [filterMonth, setFilterMonth] = useState<string>(ALL_MONTH_VALUE);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activePage, setActivePage] = useState<'home' | 'tables'>('home');
  const [activeTab, setActiveTab] = useState<'dashboard'>('dashboard');
  const [activeTableTab, setActiveTableTab] = useState<'pivot' | 'raw'>('pivot');
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [tidbUploading, setTidbUploading] = useState(false);
  const [uploadHistoryOpen, setUploadHistoryOpen] = useState(false);

  // Theme (dark/light) - UI only, no impact to data/logic.
  type AppTheme = 'light' | 'dark';
  const THEME_STORAGE_KEY = 'pgasol.theme.v1';
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const t = String(localStorage.getItem(THEME_STORAGE_KEY) || '').trim().toLowerCase();
      if (t === 'dark' || t === 'light') return t as AppTheme;
    } catch {
      // ignore
    }
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const setThemePersisted = (next: AppTheme) => {
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const toggleTheme = () => {
    setThemePersisted(theme === 'dark' ? 'light' : 'dark');
  };

  // Hide admin-only tools (Excel import + TiDB upload/history) from public UI.
  // NOTE: This is intentionally "security by obscurity" at the UI level.
  // Real protection must be enforced server-side.
  const TOOLS_UNLOCK_STORAGE_KEY = 'pgasol.toolsUnlocked.v1';
  const ROLE_STORAGE_KEY = 'pgasol.role.v1';
  // IMPORTANT: use direct access so Vite can statically replace the value at build time.
  const configuredToolsPin = String(import.meta.env.VITE_TOOLS_PIN ?? '').trim();
  const configuredViewerPin = String(import.meta.env.VITE_VIEWER_PIN ?? '').trim();
  const isLocalhost = () => {
    try {
      const h = window.location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
    } catch {
      return false;
    }
  };

  const readToolsUnlockedFromStorage = () => {
    try {
      return localStorage.getItem(TOOLS_UNLOCK_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  };

  const initialToolsUnlocked = readToolsUnlockedFromStorage();
  const [toolsUnlocked, setToolsUnlocked] = useState<boolean>(initialToolsUnlocked);

  type AppRole = 'unknown' | 'viewer' | 'admin';
  const [role, setRole] = useState<AppRole>(() => {
    // If tools already unlocked, treat as admin.
    if (initialToolsUnlocked) return 'admin';
    try {
      const r = String(localStorage.getItem(ROLE_STORAGE_KEY) || '').trim().toLowerCase();
      if (r === 'admin' || r === 'viewer') return r as AppRole;
    } catch {
      // ignore
    }
    return 'viewer';
  });

  const setRolePersisted = (next: AppRole) => {
    setRole(next);
    try {
      if (next === 'unknown') localStorage.removeItem(ROLE_STORAGE_KEY);
      else localStorage.setItem(ROLE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const isViewer = role === 'viewer' && !toolsUnlocked;
  const isAuthenticated = role !== 'unknown';
  const roleDisplayLabel = toolsUnlocked ? 'Admin Mode' : role === 'viewer' ? 'Viewer Mode' : 'User Mode';
  const toolsStatusLabel = toolsUnlocked ? 'Tools: Unlocked' : 'Tools: Locked';

  const logout = () => {
    // Reset to viewer state (does not delete data; admin tools remain locked until PIN entered again)
    try {
      setUploadHistoryOpen(false);
      setIsInputOpen(false);
    } catch {
      // ignore
    }
    setToolsUnlockedPersisted(false);
    setRolePersisted('viewer');
  };

  const breadcrumb = useMemo(() => {
    const parts: string[] = [];
    if (activePage === 'home') {
      parts.push('Beranda');
      parts.push('Visualisasi');
    } else {
      parts.push('Tabel Excel');
      parts.push(activeTableTab === 'pivot' ? 'Pivot Rekap' : 'Database Transaksi');
    }
    return parts;
  }, [activePage, activeTableTab]);

  // Apply theme to document root (CSS hooks via [data-theme]).
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Masked PIN modal (replaces window.prompt so PIN isn't visible while typing)
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalSource, setPinModalSource] = useState<'shortcut' | 'url' | 'hash' | 'gesture' | 'manual' | 'startup'>('manual');
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinVisible, setPinVisible] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  const setToolsUnlockedPersisted = (next: boolean) => {
    setToolsUnlocked(next);
    try {
      if (next) localStorage.setItem(TOOLS_UNLOCK_STORAGE_KEY, '1');
      else localStorage.removeItem(TOOLS_UNLOCK_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const lockTools = () => {
    if (!toolsUnlocked) return;
    setToolsUnlockedPersisted(false);
    // keep role as viewer after lock, so public UI stays minimal.
    setRolePersisted('viewer');
  };

  const openPinModal = (source: 'shortcut' | 'url' | 'hash' | 'gesture' | 'manual' | 'startup') => {
    setPinModalSource(source);
    setPinError(null);
    setPinValue('');
    setPinVisible(false);
    setPinModalOpen(true);
    // Focus input next tick
    queueMicrotask(() => {
      pinInputRef.current?.focus();
    });
  };

  const closePinModal = () => {
    setPinModalOpen(false);
    setPinError(null);
    setPinValue('');
    setPinVisible(false);
  };

  const dismissPinModal = () => {
    // Startup modal is not dismissible (must login).
    if (pinModalSource === 'startup') return;
    closePinModal();
  };

  const submitPinModal = () => {
    if (toolsUnlocked) {
      closePinModal();
      return;
    }

    const entered = String(pinValue ?? '').trim();
    if (!entered) {
      setPinError('PIN wajib diisi.');
      return;
    }

    // Determine role by PIN value (no explicit viewer/admin choice in UI).
    // Admin PIN: VITE_TOOLS_PIN
    // Viewer PIN: VITE_VIEWER_PIN
    if (configuredToolsPin && entered === configuredToolsPin) {
      setRolePersisted('admin');
      setToolsUnlockedPersisted(true);
      closePinModal();
      return;
    }

    if (configuredViewerPin && entered === configuredViewerPin) {
      setRolePersisted('viewer');
      setToolsUnlockedPersisted(false);
      closePinModal();
      return;
    }

    setPinError('PIN salah.');
  };

  const requestToolsUnlock = (source: 'shortcut' | 'url' | 'hash' | 'gesture' | 'manual' = 'manual') => {
    if (toolsUnlocked) return;

    // Admin PIN not configured: only allow unlock on localhost to keep production safe by default.
    if (!configuredToolsPin) {
      if (!isLocalhost()) {
        alert('Menu admin dikunci. PIN belum dikonfigurasi (VITE_TOOLS_PIN).');
        return;
      }
      setRolePersisted('admin');
      setToolsUnlockedPersisted(true);
      return;
    }

    openPinModal(source);
  };

  // Allow a hidden access path via URL:
  // - ?tools=1 (will prompt for PIN)
  // - ?tools=1&pin=XXXX (auto unlock when pin matches)
  // - #tools (will prompt for PIN)
  // After unlock attempt, scrub query params to avoid leaving PIN in the URL.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const toolsParam = String(url.searchParams.get('tools') ?? '').toLowerCase();
      const pinParam = url.searchParams.get('pin');
      const wantsTools = toolsParam === '1' || toolsParam === 'true' || toolsParam === 'on' || toolsParam === 'yes';
      const wantsToolsViaHash = String(window.location.hash ?? '').toLowerCase() === '#tools';

      if (wantsTools || wantsToolsViaHash) {
        if (!toolsUnlocked) {
          if (configuredToolsPin && pinParam && String(pinParam).trim() === configuredToolsPin) {
            setRolePersisted('admin');
            setToolsUnlockedPersisted(true);
          } else if (!configuredToolsPin && isLocalhost()) {
            setRolePersisted('admin');
            setToolsUnlockedPersisted(true);
          } else {
            queueMicrotask(() => requestToolsUnlock(wantsTools ? 'url' : 'hash'));
          }
        }

        if (wantsTools || pinParam) {
          url.searchParams.delete('tools');
          url.searchParams.delete('pin');
          const next = `${url.pathname}${url.search}${url.hash}`;
          window.history.replaceState({}, '', next);
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Startup behavior: app opens in viewer mode by default.
  // Admin PIN is only requested when the user explicitly chooses to unlock admin tools.

  // Keyboard shortcut:
  // - Ctrl+Shift+U => unlock (ask PIN)
  // - Ctrl+Shift+L => lock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = (e.ctrlKey || e.metaKey) && e.shiftKey;
      if (!combo) return;
      const k = String(e.key || '').toLowerCase();
      if (k === 'u') {
        e.preventDefault();
        requestToolsUnlock('shortcut');
      }
      if (k === 'l') {
        e.preventDefault();
        lockTools();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolsUnlocked]);

  // Keyboard shortcut:
  // - Ctrl+K => focus quick search input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      if (e.shiftKey || e.altKey) return;
      const k = String(e.key || '').toLowerCase();
      if (k !== 'k') return;

      // Avoid stealing focus while login PIN modal is open.
      if (pinModalOpen) return;

      e.preventDefault();
      const el = searchInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pinModalOpen]);

  // Close PIN modal with Escape and allow Enter to submit.
  useEffect(() => {
    if (!pinModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismissPinModal();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPinModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinModalOpen, pinValue, toolsUnlocked, configuredToolsPin]);

  // Safety: if tools get locked while a modal is open, close it.
  useEffect(() => {
    if (!toolsUnlocked) setUploadHistoryOpen(false);
  }, [toolsUnlocked]);

  // Viewer mode: keep the experience read-only & dashboard-only.
  useEffect(() => {
    if (!isViewer) return;
    setActivePage('home');
    setActiveTab('dashboard');
    setIsInputOpen(false);
    setUploadHistoryOpen(false);
  }, [isViewer]);

  // UX: ringkasan status2 ditampilkan hanya saat user klik kartu "Terserap".
  const [showStatus2Summary, setShowStatus2Summary] = useState(false);

  const [status2ModalOpen, setStatus2ModalOpen] = useState(false);
  const [status2ModalKey, setStatus2ModalKey] = useState<string>('');
  const [status2ModalLabel, setStatus2ModalLabel] = useState<string>('');

  const status2SummaryRef = useRef<HTMLDivElement | null>(null);

  // Hidden gesture: click the app logo 7x quickly to open tools unlock prompt.
  // This avoids showing admin menus publicly while still allowing access when needed.
  const toolsGestureRef = useRef<{ count: number; startedAt: number; timer: number | null }>(
    { count: 0, startedAt: 0, timer: null }
  );

  const bumpToolsGesture = () => {
    const now = Date.now();
    const g = toolsGestureRef.current;

    // Reset window if too slow
    if (!g.startedAt || now - g.startedAt > 2500) {
      g.count = 0;
      g.startedAt = now;
    }

    g.count += 1;

    // Auto-reset after the window ends
    if (g.timer) window.clearTimeout(g.timer);
    g.timer = window.setTimeout(() => {
      g.count = 0;
      g.startedAt = 0;
      g.timer = null;
    }, 2500);

    if (g.count >= 7) {
      // consume gesture
      g.count = 0;
      g.startedAt = 0;
      if (g.timer) window.clearTimeout(g.timer);
      g.timer = null;
      requestToolsUnlock('gesture');
    }
  };

  const scrollToStatus2Summary = () => {
    // Pastikan section-nya sudah dirender dulu sebelum scroll.
    setShowStatus2Summary(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        status2SummaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  // Guard: keep all aggregations consistent even if some rows contain non-finite numbers (NaN/Infinity).
  const safeAmount = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

  // Load persisted data from TiDB (if available). Non-breaking behavior:
  // - If API is not running, silently keep existing local/mock data.
  // - If DB is empty, keep existing local/mock data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const records = await fetchBudgetRecordsFromTiDB();
        if (cancelled) return;
        if (Array.isArray(records) && records.length > 0) {
          setData(records);
        }
      } catch {
        // ignore: API not running or DB not configured
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUploadToTiDB = async () => {
    if (tidbUploading) return;
    if (!data || data.length === 0) {
      alert('Tidak ada data untuk diupload. Silakan impor Excel terlebih dahulu.');
      return;
    }
    setTidbUploading(true);
    try {
      const resp = await uploadBudgetRecordsToTiDB(data);
      const sent = resp.sentUnique ?? resp.received ?? data.length;
      const skipped = resp.skippedDuplicates ?? 0;
      alert(
        `Upload ke TiDB selesai. Baris terkirim (unik): ${sent}.` +
          (skipped > 0 ? ` Duplikat tidak dikirim: ${skipped}.` : '') +
          ` affectedRows: ${resp.affectedRows ?? '-'}\n\n` +
          `Tips: setelah ini data akan bisa di-load lagi tanpa impor ulang (saat API TiDB aktif).`
      );
    } catch (e: any) {
      alert(`Upload ke TiDB gagal: ${String(e?.message || e)}`);
    } finally {
      setTidbUploading(false);
    }
  };

  const periodOptions = useMemo(() => {
    const grouped = new Map<number, number[]>();

    for (const row of data) {
      const parts = extractYearMonthParts(row.periode);
      if (!parts) continue;

      const existingMonths = grouped.get(parts.year) ?? [];
      if (!existingMonths.includes(parts.month)) {
        existingMonths.push(parts.month);
        existingMonths.sort((a, b) => a - b);
      }
      grouped.set(parts.year, existingMonths);
    }

    const yearOptions: PeriodeOption[] = [
      { value: ALL_YEAR_VALUE, label: ALL_PERIODE_LABEL },
      ...Array.from(grouped.keys())
        .sort((a, b) => b - a)
        .map(year => ({ value: String(year), label: String(year) })),
    ];

    const monthOptions: PeriodeOption[] =
      filterYear === ALL_YEAR_VALUE
        ? [{ value: ALL_MONTH_VALUE, label: 'Semua Bulan' }]
        : [
            { value: ALL_MONTH_VALUE, label: 'Semua Bulan' },
            ...((grouped.get(Number(filterYear)) ?? [])
              .slice()
              .sort((a, b) => a - b)
              .map(month => ({
                value: String(month).padStart(2, '0'),
                label: formatMonthNumberToLabel(month),
              }))),
          ];

    return { grouped, yearOptions, monthOptions };
  }, [data, filterYear]);

  // Keep selected year/month valid when the underlying data changes.
  useEffect(() => {
    if (filterYear === ALL_YEAR_VALUE) {
      if (filterMonth !== ALL_MONTH_VALUE) setFilterMonth(ALL_MONTH_VALUE);
      return;
    }

    const yearExists = periodOptions.yearOptions.some(option => option.value === filterYear);
    if (!yearExists) {
      setFilterYear(ALL_YEAR_VALUE);
      setFilterMonth(ALL_MONTH_VALUE);
      return;
    }

    const monthExists = periodOptions.monthOptions.some(option => option.value === filterMonth);
    if (!monthExists) setFilterMonth(ALL_MONTH_VALUE);
  }, [filterMonth, filterYear, periodOptions.monthOptions, periodOptions.yearOptions]);

  const activePeriodeLabel = useMemo(() => {
    if (filterYear === ALL_YEAR_VALUE) return ALL_PERIODE_LABEL;
    if (filterMonth === ALL_MONTH_VALUE) return `Tahun ${filterYear}`;
    return formatYearMonthKeyToLabel(`${filterYear}-${filterMonth}`);
  }, [filterMonth, filterYear]);

  const filteredData = useMemo(() => {
    let result = data;
    
    // Period Filtering
    if (filterYear !== ALL_YEAR_VALUE) {
      result = result.filter(d => {
        const parts = extractYearMonthParts(d.periode);
        if (!parts) return false;
        if (String(parts.year) !== filterYear) return false;
        if (filterMonth !== ALL_MONTH_VALUE && String(parts.month).padStart(2, '0') !== filterMonth) return false;
        return true;
      });
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
  }, [data, filterMonth, filterYear, searchQuery]);

  const totalValue = useMemo(
    () => filteredData.reduce((acc, curr) => acc + safeAmount(curr.nilaiTagihan), 0),
    [filteredData]
  );

  // Total serapan dari seluruh data (untuk perbandingan dengan nilai kontrak awal)
  const totalAbsorbedAll = useMemo(
    () => data.reduce((acc, curr) => acc + safeAmount(curr.nilaiTagihan), 0),
    [data]
  );

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
      acc[key] = (acc[key] || 0) + safeAmount(curr.nilaiTagihan);
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
      acc[key] = (acc[key] || 0) + safeAmount(curr.nilaiTagihan);
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

  const latestPeriodKey = useMemo(() => {
    const keys = data
      .map(row => normalizePeriodeToYearMonthKey(row.periode))
      .filter((key): key is string => Boolean(key))
      .sort();
    return keys.length > 0 ? keys[keys.length - 1] : null;
  }, [data]);

  const latestFilteredPeriodKey = useMemo(() => {
    const keys = filteredData
      .map(row => normalizePeriodeToYearMonthKey(row.periode))
      .filter((key): key is string => Boolean(key))
      .sort();
    return keys.length > 0 ? keys[keys.length - 1] : null;
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

  const estimatedContractEndLabel = useMemo(() => {
    if (!latestPeriodKey || estimatedMonthsRemaining === null) return null;
    if (remainingValue <= 0) return `Sudah habis per ${formatYearMonthKeyToLabel(latestPeriodKey)}`;

    const projectedKey = shiftYearMonthKey(latestPeriodKey, Math.max(1, Math.ceil(estimatedMonthsRemaining)));
    if (!projectedKey) return null;
    return `Estimasi habis ${formatYearMonthKeyToLabel(projectedKey)}`;
  }, [estimatedMonthsRemaining, latestPeriodKey, remainingValue]);

  const estimatedContractEndLabelFiltered = useMemo(() => {
    if (!latestFilteredPeriodKey || estimatedMonthsRemainingFiltered === null) return null;
    if (remainingValueFiltered <= 0) return `Habis per ${formatYearMonthKeyToLabel(latestFilteredPeriodKey)}`;

    const projectedKey = shiftYearMonthKey(latestFilteredPeriodKey, Math.max(1, Math.ceil(estimatedMonthsRemainingFiltered)));
    if (!projectedKey) return null;
    return `Est. habis ${formatYearMonthKeyToLabel(projectedKey)}`;
  }, [estimatedMonthsRemainingFiltered, latestFilteredPeriodKey, remainingValueFiltered]);

  const formatCurrencyInline = (val: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  const prokrosaFormulaLabel = useMemo(() => {
    if (overBudgetValue > 0) return 'Dasar hitung: anggaran sudah melampaui nilai kontrak';
    if (monthlyRunRate.averagePerMonth <= 0) return 'Dasar hitung: avg serapan bulanan belum tersedia';
    return `Dasar hitung: ${formatCurrencyInline(remainingValue)} ÷ ${formatCurrencyInline(monthlyRunRate.averagePerMonth)}/bln`;
  }, [monthlyRunRate.averagePerMonth, overBudgetValue, remainingValue]);

  const prokrosaFormulaLabelFiltered = useMemo(() => {
    if (overBudgetValueFiltered > 0) return 'Filtered: anggaran sudah melampaui kontrak';
    if (monthlyRunRateFiltered.averagePerMonth <= 0) return 'Filtered: avg serapan bulanan belum tersedia';
    return `Filtered basis: ${formatCurrencyInline(remainingValueFiltered)} ÷ ${formatCurrencyInline(monthlyRunRateFiltered.averagePerMonth)}/bln`;
  }, [monthlyRunRateFiltered.averagePerMonth, overBudgetValueFiltered, remainingValueFiltered]);

  const normalizeStatus2 = (s: string | undefined | null) => (s || '').trim();
  const normalizeStatus2Key = (s: string | undefined | null) => normalizeStatus2(s).toLowerCase();

  // Canonicalize status2 so cards match Excel/pivot columns consistently.
  // - Keep blanks/placeholders as a dedicated bucket (NOT manual) so counts match the source file
  // - Map case-insensitively to STATUS_COLS
  // - Normalize internal whitespace to avoid accidental splitting (e.g., double spaces)
  const normalizeStatus2Text = (raw: unknown) =>
    String(raw ?? '')
      .replace(/\u00A0/g, ' ') // NBSP
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
      .replace(/\s+/g, ' ')
      .trim();

  const canonicalizeStatus2 = (raw: unknown): string => {
    const s = normalizeStatus2Text(raw);
    const key = s.toLowerCase();

    if (!key || key === '-' || key === '—' || key === '–' || key === 'n/a' || key === 'na' || key === 'null') {
      return 'Status2 Kosong';
    }

    if (key === 'manual') return 'manual';

    const canonicalExact = STATUS_COLS.find(col => normalizeStatus2Text(col).toLowerCase() === key);
    if (canonicalExact) return canonicalExact;

    // Handle common variants where notes are appended, e.g.
    // "REQ Reject by my ssc(PHR)(sudah submit kembali ...)".
    // If it starts with a known canonical status2, collapse into that bucket.
    const canonicalPrefix = STATUS_COLS.find(col => {
      const ck = normalizeStatus2Text(col).toLowerCase();
      return ck && key.startsWith(ck);
    });
    return canonicalPrefix || s;
  };

  // Build status2 list dynamically (one card per unique status2 in the current filtered view)
  const status2CardList = useMemo(() => {
    const map = new Map<string, string>(); // key -> display label
    for (const item of filteredData) {
      const raw = canonicalizeStatus2(item.status2);
      const key = normalizeStatus2Key(raw) || 'manual';
      const label = raw || 'manual';
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [filteredData]);

  // Stats per status2 (dynamic): sum + count
  const status2Stats = useMemo<Record<string, { sum: number; count: number }>>(() => {
    const stats: Record<string, { sum: number; count: number }> = {};
    for (const item of filteredData) {
      const key = normalizeStatus2Key(canonicalizeStatus2(item.status2)) || 'manual';
      if (!stats[key]) stats[key] = { sum: 0, count: 0 };
      stats[key].sum += safeAmount(item.nilaiTagihan);
      stats[key].count += 1;
    }
    return stats;
  }, [filteredData]);

  // Sort cards by total (desc) so the most important statuses show first
  const sortedStatus2Cards = useMemo(() => {
    return [...status2CardList].sort((a, b) => (status2Stats[b.key]?.sum || 0) - (status2Stats[a.key]?.sum || 0));
  }, [status2CardList, status2Stats]);

  // Integrity check: sum of all status2 cards should equal the Grand Total Tagihan (for current filteredData).
  // If there is a mismatch, it indicates data issues (e.g., NaN/Infinity, unexpected parsing) rather than UI math.
  const status2CardsTotal = useMemo(() => {
    const vals = Object.values(status2Stats) as Array<{ sum: number; count: number }>;
    return vals.reduce<number>((acc, s) => acc + safeAmount(s.sum), 0);
  }, [status2Stats]);

  const status2CardsDiff = useMemo(() => {
    // diff should be 0 when everything is consistent
    return totalValue - status2CardsTotal;
  }, [totalValue, status2CardsTotal]);

  const rowsWithBlankStatus2 = useMemo(() => {
    // Note: blanks/placeholders are bucketed into "Status2 Kosong".
    let c = 0;
    for (const r of filteredData) {
      if (!String(r.status2 ?? '').trim()) c++;
    }
    return c;
  }, [filteredData]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  const progressTone = useMemo(() => {
    const pct = absorbedPct;
    if (pct < 50) return { bar: '#22c55e', bg: '#dcfce7', label: '0-50%' };
    if (pct < 80) return { bar: '#eab308', bg: '#fef9c3', label: '50-80%' };
    return { bar: '#ef4444', bg: '#fee2e2', label: '80-100%' };
  }, [absorbedPct]);

  const status2ModalRows = useMemo(() => {
    if (!status2ModalOpen || !status2ModalKey) return [] as BudgetRecord[];
    return filteredData
      .filter(r => (normalizeStatus2Key(canonicalizeStatus2(r.status2)) || 'manual') === status2ModalKey)
      .slice()
      .sort((a, b) => safeAmount(b.nilaiTagihan) - safeAmount(a.nilaiTagihan));
  }, [status2ModalOpen, status2ModalKey, filteredData]);

  const status2ModalTotal = useMemo(() => {
    if (!status2ModalOpen || !status2ModalKey) return 0;
    return status2ModalRows.reduce((acc, r) => acc + safeAmount(r.nilaiTagihan), 0);
  }, [status2ModalOpen, status2ModalKey, status2ModalRows]);

  const sumByStatus2Key = (rows: BudgetRecord[]) => {
    const sums: Record<string, number> = {};
    for (const r of rows) {
      const key = normalizeStatus2Key(canonicalizeStatus2(r.status2)) || 'manual';
      sums[key] = (sums[key] || 0) + safeAmount(r.nilaiTagihan);
    }
    return sums;
  };

  const countByStatus2Key = (rows: BudgetRecord[]) => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const key = normalizeStatus2Key(canonicalizeStatus2(r.status2)) || 'manual';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  };

  const labelByStatus2Key = (rows: BudgetRecord[]) => {
    const labels: Record<string, string> = {};
    for (const r of rows) {
      const raw = canonicalizeStatus2(r.status2);
      const key = normalizeStatus2Key(raw) || 'manual';
      if (!labels[key]) labels[key] = raw || 'manual';
    }
    return labels;
  };

  const formatTopStatus2Lines = (
    sums: Record<string, number>,
    counts: Record<string, number>,
    labels: Record<string, string>,
    topN = 8
  ) => {
    const entries = Object.keys(sums)
      .map(k => ({
        key: k,
        label: labels[k] || k || 'manual',
        sum: sums[k] || 0,
        count: counts[k] || 0,
      }))
      .sort((a, b) => b.sum - a.sum);

    const head = entries.slice(0, topN);
    const rest = entries.length - head.length;

    const lines = head.map(e => `• ${e.label}: ${formatCurrency(e.sum)} (${e.count} baris)`);
    if (rest > 0) lines.push(`• ...dan ${rest} status2 lainnya`);
    return lines.join('\n');
  };

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

  // A looser fingerprint (excludes nilaiTagihan) for safe repair when previous imports had parsing issues.
  // This helps avoid adding duplicates when the same transaction is re-imported but the amount is corrected.
  const getRecordLooseFingerprint = (r: BudgetRecord) => {
    const parts = [
      (r.namaUser || '').trim().toLowerCase(),
      (r.tim || '').trim().toLowerCase(),
      (r.periode || '').trim().toLowerCase(),
      (r.noRO || '').trim().toLowerCase(),
      (r.tglBAST || '').trim().toLowerCase(),
      (r.noBAST || '').trim().toLowerCase(),
      (r.status2 || '').trim().toLowerCase(),
      (r.saNo || '').trim().toLowerCase(),
      (r.keterangan || '').trim().toLowerCase(),
    ];
    return parts.join('|');
  };

  // Ultra-loose fingerprint: excludes nilaiTagihan and status2.
  // Used ONLY to safely repair status2 buckets without adding duplicates.
  const getRecordUltraLooseFingerprint = (r: BudgetRecord) => {
    const parts = [
      (r.namaUser || '').trim().toLowerCase(),
      (r.tim || '').trim().toLowerCase(),
      (r.periode || '').trim().toLowerCase(),
      (r.noRO || '').trim().toLowerCase(),
      (r.tglBAST || '').trim().toLowerCase(),
      (r.noBAST || '').trim().toLowerCase(),
      (r.saNo || '').trim().toLowerCase(),
      (r.keterangan || '').trim().toLowerCase(),
    ];
    return parts.join('|');
  };

  const shouldRepairAmount = (oldVal: unknown, newVal: unknown) => {
    const oldN = safeAmount(oldVal);
    const newN = safeAmount(newVal);
    if (newN <= 0) return false;
    if (oldN === newN) return false;

    // Common parse bug patterns: decimal being treated as extra zeros (x10/x100/x1000) or amount parsed as 0.
    if (oldN === 0 && newN > 0) return true;
    const ratio = oldN / newN;
    if (Number.isFinite(ratio) && Number.isInteger(ratio) && (ratio === 10 || ratio === 100 || ratio === 1000)) {
      return true;
    }
    return false;
  };

  const shouldRepairStatus2 = (oldStatus2: unknown, newStatus2: unknown) => {
    const oldC = canonicalizeStatus2(oldStatus2);
    const newC = canonicalizeStatus2(newStatus2);
    if (oldC === newC) return false;

    // Only allow safe repairs between Manual and Status2 Kosong.
    const pair = new Set([oldC, newC]);
    return pair.has('manual') && pair.has('Status2 Kosong');
  };

  // Helper function for colorful card themes
  const getStatusTheme = (status: string) => {
    const palette = [
      { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: 'bg-blue-500', icon: 'text-blue-400' },
      { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-500', icon: 'text-emerald-400' },
      { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: 'bg-amber-500', icon: 'text-amber-400' },
      { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', bar: 'bg-rose-500', icon: 'text-rose-400' },
      { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', bar: 'bg-violet-500', icon: 'text-violet-400' },
      { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', bar: 'bg-cyan-500', icon: 'text-cyan-400' },
      { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', bar: 'bg-fuchsia-500', icon: 'text-fuchsia-400' },
      { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', bar: 'bg-lime-500', icon: 'text-lime-500' },
      { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', bar: 'bg-orange-500', icon: 'text-orange-400' },
      { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', bar: 'bg-sky-500', icon: 'text-sky-400' },
    ];

    const pickFromPalette = (s: string) => {
      const key = (s || '').trim().toLowerCase();
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
      }
      return palette[hash % palette.length];
    };

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
        return pickFromPalette(status);
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
      // Only de-duplicate against data that already exists in state.
      // This ensures totals match the Excel file on first import, even if the file itself
      // contains duplicate rows (those duplicates will still be imported).
      const existing = new Set(prev.map(getRecordFingerprint));

      const looseIndex = new Map<string, { idx: number; count: number }>();
      prev.forEach((row, idx) => {
        const k = getRecordLooseFingerprint(row);
        const found = looseIndex.get(k);
        if (!found) {
          looseIndex.set(k, { idx, count: 1 });
        } else {
          looseIndex.set(k, { idx: found.idx, count: found.count + 1 });
        }
      });

      const ultraLooseIndex = new Map<string, { idx: number; count: number }>();
      prev.forEach((row, idx) => {
        const k = getRecordUltraLooseFingerprint(row);
        const found = ultraLooseIndex.get(k);
        if (!found) {
          ultraLooseIndex.set(k, { idx, count: 1 });
        } else {
          ultraLooseIndex.set(k, { idx: found.idx, count: found.count + 1 });
        }
      });

      let skipped = 0;
      let repaired = 0;
      let repairedStatus2 = 0;

      const toAdd: BudgetRecord[] = [];
      const skippedRows: BudgetRecord[] = [];
      const repairedRows: Array<{ idx: number; oldValue: number; newValue: number; status2Key: string }> = [];
      const repairedStatus2Rows: Array<{ idx: number; newStatus2: string }> = [];
      for (const row of importedData) {
        const fp = getRecordFingerprint(row);
        if (existing.has(fp)) {
          skipped++;
          skippedRows.push(row);
          continue;
        }

        const looseFp = getRecordLooseFingerprint(row);
        const li = looseIndex.get(looseFp);
        if (li && li.count === 1) {
          const prevRow = prev[li.idx];
          if (prevRow && shouldRepairAmount(prevRow.nilaiTagihan, row.nilaiTagihan)) {
            repaired++;
            const oldValue = safeAmount(prevRow.nilaiTagihan);
            const newValue = safeAmount(row.nilaiTagihan);
            const status2Key = normalizeStatus2Key(prevRow.status2) || 'manual';
            repairedRows.push({ idx: li.idx, oldValue, newValue, status2Key });
            // Keep existing strict fingerprint in the set; we are updating amount in place.
            continue;
          }
        }

        // Status2 repair (e.g., previously-blank status2 forced into manual) without duplicating rows.
        const ultraFp = getRecordUltraLooseFingerprint(row);
        const ui = ultraLooseIndex.get(ultraFp);
        if (ui && ui.count === 1) {
          const prevRow = prev[ui.idx];
          if (prevRow && shouldRepairStatus2(prevRow.status2, row.status2)) {
            repairedStatus2++;
            repairedStatus2Rows.push({ idx: ui.idx, newStatus2: canonicalizeStatus2(row.status2) });
            continue;
          }
        }
        toAdd.push(row);
      }

      const fileSums = sumByStatus2Key(importedData);
      const addedSums = sumByStatus2Key(toAdd);
      const skippedSums = sumByStatus2Key(skippedRows);

      // Apply repairs (if any)
      let nextData = prev;
      if (repairedRows.length > 0) {
        const copy = [...prev];
        for (const rr of repairedRows) {
          const existingRow = copy[rr.idx];
          if (!existingRow) continue;
          copy[rr.idx] = { ...existingRow, nilaiTagihan: rr.newValue };
        }
        nextData = copy;
      }

      if (repairedStatus2Rows.length > 0) {
        const copy = [...nextData];
        for (const rr of repairedStatus2Rows) {
          const existingRow = copy[rr.idx];
          if (!existingRow) continue;
          copy[rr.idx] = { ...existingRow, status2: rr.newStatus2 };
        }
        nextData = copy;
      }
      nextData = [...nextData, ...toAdd];
      const nextSums = sumByStatus2Key(nextData);

      const fileCounts = countByStatus2Key(importedData);
      const fileLabels = labelByStatus2Key(importedData);

      const fileTotal = importedData.reduce((acc, r) => acc + safeAmount(r.nilaiTagihan), 0);

      const manualFile = fileSums['manual'] || 0;
      const manualAdded = addedSums['manual'] || 0;
      const manualSkipped = skippedSums['manual'] || 0;
      const manualTotalAfter = nextSums['manual'] || 0;

      const kosongKey = normalizeStatus2Key('Status2 Kosong');
      const kosongFile = fileSums[kosongKey] || 0;
      const kosongAdded = addedSums[kosongKey] || 0;
      const kosongSkipped = skippedSums[kosongKey] || 0;
      const kosongTotalAfter = nextSums[kosongKey] || 0;

      const manualRepairedDelta = repairedRows
        .filter(r => r.status2Key === 'manual')
        .reduce((acc, r) => acc + (r.newValue - r.oldValue), 0);

      // Feedback after state update (async safe)
      queueMicrotask(() => {
        alert(
          `Import selesai. Total baris file: ${importedData.length}. Ditambahkan: ${toAdd.length}. Duplikat dilewati: ${skipped}. Diperbaiki nilai: ${repaired}. Perbaiki status2: ${repairedStatus2}.\n\n` +
          `Cek SUM status2=manual (berdasarkan kartu):\n` +
          `• SUM manual (file): ${formatCurrency(manualFile)}\n` +
          `• SUM manual (ditambahkan): ${formatCurrency(manualAdded)}\n` +
          `• SUM manual (duplikat dilewati): ${formatCurrency(manualSkipped)}\n\n` +
          `• Delta manual (perbaikan data lama): ${formatCurrency(manualRepairedDelta)}\n` +
          `• SUM manual (total data setelah merge): ${formatCurrency(manualTotalAfter)}\n\n` +
          `Cek SUM status2=Status2 Kosong (berdasarkan kartu):\n` +
          `• SUM kosong (file): ${formatCurrency(kosongFile)}\n` +
          `• SUM kosong (ditambahkan): ${formatCurrency(kosongAdded)}\n` +
          `• SUM kosong (duplikat dilewati): ${formatCurrency(kosongSkipped)}\n` +
          `• SUM kosong (total data setelah merge): ${formatCurrency(kosongTotalAfter)}\n\n` +
          `Total nilai (file): ${formatCurrency(fileTotal)}\n\n` +
          `Top status2 (file):\n${formatTopStatus2Lines(fileSums, fileCounts, fileLabels)}`
        );

        const formatRowNumberRanges = (nums: number[], maxTokens = 80) => {
          const arr = Array.from(new Set(nums)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
          if (arr.length === 0) return '-';

          const ranges: string[] = [];
          let start = arr[0];
          let prev = arr[0];
          for (let i = 1; i < arr.length; i++) {
            const cur = arr[i];
            if (cur === prev + 1) {
              prev = cur;
              continue;
            }
            ranges.push(start === prev ? String(start) : `${start}-${prev}`);
            start = cur;
            prev = cur;
          }
          ranges.push(start === prev ? String(start) : `${start}-${prev}`);

          if (ranges.length <= maxTokens) return ranges.join(', ');
          const shown = ranges.slice(0, maxTokens).join(', ');
          return `${shown}, ... (+${ranges.length - maxTokens} range lagi)`;
        };

        // Optional: notify which Excel row numbers already exist in TiDB.
        // This does NOT change import behavior; it's only an informational alert.
        (async () => {
          const stats = await getTiDBDuplicateRowNumbers(importedData);
          if (!stats) return;

          if (stats.duplicatedRows <= 0) {
            alert(`Cek TiDB: tidak ada baris duplikat dari TiDB (dari ${stats.checkedRows} baris file).`);
            return;
          }

          const rowsText = stats.duplicatedRowNumbers.length
            ? formatRowNumberRanges(stats.duplicatedRowNumbers)
            : '(nomor baris tidak terbaca dari file)';

          alert(
            `Cek TiDB (baris file yang SUDAH ADA di TiDB):\n` +
              `• ${stats.duplicatedRows} baris duplikat\n` +
              `• (${stats.duplicatedUnique} transaksi unik)\n` +
              `• Nomor baris Excel: ${rowsText}\n\n` +
              `Catatan: ini hanya notifikasi. Data di aplikasi tetap mengikuti hasil import Excel.`
          );
        })();
      });

      return nextData;
    });
  };

  useEffect(() => {
    setAiInsight(null);
  }, [filteredData]);

  const [activeCustomPage, setActiveCustomPage] = useState<'notaPembatalan' | null>(null);

  return (
    <div>
      {/* Navigasi utama */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 24,
          padding: '14px 18px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(13,110,253,0.08), rgba(99,102,241,0.06))',
          border: '1px solid rgba(13,110,253,0.12)',
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#64748b' }}>
            Menu Cepat
          </div>
          <div style={{ fontSize: 14, color: '#334155', marginTop: 4 }}>
            Akses cepat ke aplikasi eksternal untuk proses nota pembatalan pajak.
          </div>
        </div>
        <a
          href="https://nota-pembatalan-pajak.vercel.app/"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            minWidth: 260,
            borderRadius: 14,
            textDecoration: 'none',
            background: 'linear-gradient(135deg, #0d6efd, #4f46e5)',
            color: '#fff',
            fontWeight: 700,
            boxShadow: '0 10px 24px rgba(79, 70, 229, 0.24)',
          }}
          aria-label="Buka menu Nota Pembatalan Pajak"
          title="Buka Nota Pembatalan Pajak"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.16)',
              }}
            >
              <i className="bi bi-receipt-cutoff" aria-hidden="true" />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span>Nota Pembatalan Pajak</span>
              <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.9 }}>Buka aplikasi eksternal</span>
            </span>
          </span>
          <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
        </a>
      </nav>
      {/* Konten utama */}
      {activeCustomPage === 'notaPembatalan' ? (
        <NotaPembatalanMenu />
      ) : (
        <>
          {isInputOpen && (
            <BudgetInputForm 
              onAdd={handleAddRecord} 
              onClose={() => setIsInputOpen(false)} 
            />
          )}

          {/* Header */}
          <header className="sticky-top border-bottom bg-white shadow-sm no-print">
            <div className="container py-3">
              <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="rounded-3 bg-primary bg-gradient text-white d-inline-flex align-items-center justify-content-center"
                    onClick={bumpToolsGesture}
                    style={{ width: 44, height: 44 }}
                  >
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h1
                      className="h5 fw-black mb-0 text-dark"
                      onDoubleClick={() => requestToolsUnlock('gesture')}
                    >
                      Budget Monitoring
                    </h1>
                    <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
                      <div className="small text-muted text-uppercase" style={{ letterSpacing: '.08em' }}>Asset Management & Cost Control</div>
                      <span
                        className={`badge rounded-pill ${toolsUnlocked ? 'text-bg-success' : 'text-bg-secondary'}`}
                        title={toolsStatusLabel}
                        style={{ letterSpacing: '.02em' }}
                      >
                        {toolsUnlocked ? 'Admin Mode' : 'Viewer Mode'}
                      </span>
                    </div>
                    <div className="small text-muted mt-1" style={{ letterSpacing: '.02em' }}>
                      {breadcrumb.join(' / ')}
                    </div>
                  </div>
                </div>

                <div className="d-flex flex-wrap align-items-center gap-2">
                  {/* Notifications (stub) */}
                  <button type="button" className="btn btn-outline-secondary position-relative micro-hover" title="Notifikasi (coming soon)">
                    <i className="bi bi-bell" aria-hidden="true" />
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ display: 'none' }}>
                      0
                    </span>
                  </button>

                  {/* Theme */}
                  <button
                    type="button"
                    className="btn btn-outline-secondary micro-hover"
                    onClick={toggleTheme}
                    title={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
                  >
                    <i className={`bi ${theme === 'dark' ? 'bi-moon-stars-fill' : 'bi-sun-fill'} me-2`} aria-hidden="true" />
                    {theme === 'dark' ? 'Dark' : 'Light'}
                  </button>

                  {/* Navigation */}
                  {!isViewer && (
                    <div className="btn-group" role="group" aria-label="Navigasi">
                      <button
                        onClick={() => setActivePage('home')}
                        className={`btn btn-sm ${activePage === 'home' ? 'btn-primary' : 'btn-outline-primary'} micro-hover`}
                      >
                        Beranda
                      </button>
                      <button
                        onClick={() => setActivePage('tables')}
                        className={`btn btn-sm ${activePage === 'tables' ? 'btn-primary' : 'btn-outline-primary'} micro-hover`}
                      >
                        Tabel Excel
                      </button>
                    </div>
                  )}

                  {!isViewer && activePage === 'tables' && (
                    <div className="btn-group" role="group" aria-label="Tab tabel">
                      <button
                        onClick={() => setActiveTableTab('pivot')}
                        className={`btn btn-sm ${activeTableTab === 'pivot' ? 'btn-secondary' : 'btn-outline-secondary'} micro-hover`}
                      >
                        Pivot Rekap
                      </button>
                      <button
                        onClick={() => setActiveTableTab('raw')}
                        className={`btn btn-sm ${activeTableTab === 'raw' ? 'btn-secondary' : 'btn-outline-secondary'} micro-hover`}
                      >
                        Database Transaksi
                      </button>
                    </div>
                  )}

                  {!isViewer && activePage === 'home' && (
                    <div className="btn-group" role="group" aria-label="Tab beranda">
                      <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`btn btn-sm ${activeTab === 'dashboard' ? 'btn-info text-white' : 'btn-outline-info'} micro-hover`}
                      >
                        Visualisasi
                      </button>
                    </div>
                  )}

                  {/* Actions dropdown (admin-only): visible ONLY when tools are unlocked via PIN */}
                  {toolsUnlocked && (
                    <div className="dropdown">
                      <button
                        className="btn btn-primary dropdown-toggle micro-hover"
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                        title="Actions"
                      >
                        <i className="bi bi-lightning-charge-fill me-2" aria-hidden="true" />
                        Actions
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end">
                        <li className="px-3 py-2">
                          <ExcelImport
                            onImport={handleImportExcel}
                            buttonClassName="btn btn-sm btn-success w-100 micro-hover"
                            label="Impor Excel"
                          />
                        </li>
                        <li>
                          <button
                            className="dropdown-item"
                            onClick={handleUploadToTiDB}
                            disabled={tidbUploading}
                          >
                            <i className="bi bi-cloud-arrow-up me-2" aria-hidden="true" />
                            {tidbUploading ? 'Uploading…' : 'Upload TiDB'}
                          </button>
                        </li>
                        <li>
                          <button className="dropdown-item" onClick={() => setUploadHistoryOpen(true)}>
                            <i className="bi bi-clock-history me-2" aria-hidden="true" />
                            History Upload
                          </button>
                        </li>
                        <li>
                          <button className="dropdown-item" onClick={() => setIsInputOpen(true)}>
                            <i className="bi bi-plus-lg me-2" aria-hidden="true" />
                            Tambah Data
                          </button>
                        </li>
                      </ul>
                    </div>
                  )}

                  {!toolsUnlocked && (
                    <button
                      type="button"
                      className="btn btn-outline-primary micro-hover d-inline-flex align-items-center gap-3 px-3 py-2 text-start"
                      onClick={() => requestToolsUnlock('manual')}
                      title="Masuk sebagai admin"
                      style={{ borderRadius: 14 }}
                    >
                      <span
                        className="d-inline-flex align-items-center justify-content-center rounded-3"
                        style={{ width: 36, height: 36, background: 'rgba(13,110,253,0.10)' }}
                      >
                        <i className="bi bi-shield-lock" aria-hidden="true" />
                      </span>
                      <span className="d-flex flex-column lh-sm">
                        <span className="fw-bold">Masuk Admin</span>
                        <span className="small text-muted">Buka akses tools admin</span>
                      </span>
                    </button>
                  )}

                  {/* User profile */}
                  <div className="dropdown">
                    <button
                      className="btn btn-outline-secondary dropdown-toggle micro-hover"
                      type="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                      title="User menu"
                    >
                      <i className="bi bi-person-circle me-2" aria-hidden="true" />
                      {roleDisplayLabel}
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end">
                      <li>
                        <div className="dropdown-item-text">
                          <div className="fw-semibold">{roleDisplayLabel}</div>
                          <div className="small text-muted">{toolsStatusLabel}</div>
                          {!toolsUnlocked && <div className="small text-primary mt-1">Klik “Masuk Admin” untuk membuka tools.</div>}
                        </div>
                      </li>
                      <li><hr className="dropdown-divider" /></li>
                      <li>
                        <button className="dropdown-item" onClick={toggleTheme}>
                          <i className={`bi ${theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill'} me-2`} aria-hidden="true" />
                          {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
                        </button>
                      </li>
                      {!toolsUnlocked && (
                        <li>
                          <button className="dropdown-item text-primary" onClick={() => requestToolsUnlock('manual')}>
                            <i className="bi bi-shield-lock me-2" aria-hidden="true" />
                            Masuk Admin
                          </button>
                        </li>
                      )}
                      {toolsUnlocked && (
                        <>
                          <li><hr className="dropdown-divider" /></li>
                          <li>
                            <button className="dropdown-item text-danger" onClick={lockTools}>
                              <i className="bi bi-lock-fill me-2" aria-hidden="true" />
                              Lock Admin Tools
                            </button>
                          </li>
                        </>
                      )}
                      <li>
                        <button className="dropdown-item text-danger" onClick={logout}>
                          <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
                          Logout
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </header>

      <main className="container py-4">
        {/* Controls & Metrics */}
        <div className="row g-4 mb-4">
          <div className="col-12 col-md-6">
            <div className="card shadow-sm border-0">
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-uppercase text-muted fw-bold">Filter Tahun</label>
                    <select
                      value={filterYear}
                      onChange={(e) => {
                        const nextYear = e.target.value;
                        setFilterYear(nextYear);
                        setFilterMonth(ALL_MONTH_VALUE);
                      }}
                      className="form-select"
                    >
                      {periodOptions.yearOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-uppercase text-muted fw-bold">Filter Bulan</label>
                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="form-select"
                      disabled={filterYear === ALL_YEAR_VALUE}
                    >
                      {periodOptions.monthOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {filterYear === ALL_YEAR_VALUE && (
                      <div className="form-text">Pilih tahun dulu, lalu bulan akan muncul di sini.</div>
                    )}
                  </div>
                  <div className="col-12">
                    <label className="form-label small text-uppercase text-muted fw-bold">Pencarian Cepat</label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="bi bi-search" aria-hidden="true" /></span>
                      <input
                        type="text"
                        placeholder="Cari data… (Ctrl + K)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        ref={searchInputRef}
                        className="form-control"
                      />
                    </div>

                    {/* Filter chips */}
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      {filterYear !== ALL_YEAR_VALUE && (
                        <span className="filter-chip" title="Filter periode aktif">
                          <i className="bi bi-calendar3" aria-hidden="true" />
                          {activePeriodeLabel}
                          <button
                            type="button"
                            aria-label="Hapus filter periode"
                            onClick={() => {
                              setFilterYear(ALL_YEAR_VALUE);
                              setFilterMonth(ALL_MONTH_VALUE);
                            }}
                          >
                            <i className="bi bi-x-circle" aria-hidden="true" />
                          </button>
                        </span>
                      )}
                      {searchQuery.trim() !== '' && (
                        <span className="filter-chip" title="Pencarian aktif">
                          <i className="bi bi-search" aria-hidden="true" />
                          <span className="text-truncate" style={{ maxWidth: 220 }}>{searchQuery}</span>
                          <button type="button" aria-label="Hapus pencarian" onClick={() => setSearchQuery('')}>
                            <i className="bi bi-x-circle" aria-hidden="true" />
                          </button>
                        </span>
                      )}
                      {(filterYear !== ALL_YEAR_VALUE || searchQuery.trim() !== '') && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary micro-hover"
                          onClick={() => {
                            setFilterYear(ALL_YEAR_VALUE);
                            setFilterMonth(ALL_MONTH_VALUE);
                            setSearchQuery('');
                          }}
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6">
            <div className="card shadow-sm border-0 text-bg-primary bg-gradient">
              <div className="card-body position-relative overflow-hidden">
                <div className="position-absolute end-0 bottom-0 opacity-25" style={{ transform: 'translate(12px, 12px)' }}>
                  <i className="bi bi-bar-chart-fill" style={{ fontSize: 96 }} aria-hidden="true" />
                </div>
                <div className="small text-uppercase fw-bold opacity-75">Grand Total Tagihan</div>
                <div className="display-6 fw-black safe-number-tight tabular-nums" title={formatCurrency(totalValue)}>
                  {formatCurrency(totalValue)}
                </div>
                <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                  <span className="badge text-light">
                    {activePeriodeLabel}
                  </span>
                  {searchQuery && <span className="small opacity-75 fst-italic text-truncate">Filtered by "{searchQuery}"</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {activePage === 'home' && (
          <>
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
                      <div
                        className="kpi-card card-terserap bg-slate-50 border border-slate-200 rounded-2xl p-5 min-w-[280px] w-max flex-none cursor-pointer shadow-sm hover:shadow-md transition-all hover:-translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        role="button"
                        tabIndex={0}
                        title="Klik untuk melihat Ringkasan Status2 (berdasarkan filter aktif)"
                        onClick={scrollToStatus2Summary}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            scrollToStatus2Summary();
                          }
                        }}
                      >
                        <div className="d-flex align-items-start justify-content-between gap-2">
                          <p className="kpi-title text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-0">Terserap</p>
                          <i className="bi bi-wallet2 kpi-muted" aria-hidden="true" title="Terserap" />
                        </div>
                        <p className="kpi-value text-xl font-black text-slate-900 mt-1 safe-number tabular-nums tracking-tight" title={formatCurrency(absorbedValue)}>{formatCurrency(absorbedValue)}</p>
                        <p className="kpi-subtitle text-[12px] text-slate-500 font-medium mt-1 tabular-nums">{absorbedPct.toFixed(1)}% dari kontrak</p>
                        <p className="kpi-muted text-[12px] text-slate-500/80 mt-2 pt-2 border-t border-slate-200/60">
                          Filtered: <span className="font-semibold safe-number-inline" title={formatCurrency(absorbedValueFiltered)}>{formatCurrency(absorbedValueFiltered)}</span> ({absorbedPctFiltered.toFixed(1)}%)
                        </p>
                      </div>
                      <div className="kpi-card card-sisa bg-emerald-50 border border-emerald-200 rounded-2xl p-5 min-w-[280px] w-max flex-none shadow-sm hover:shadow-md transition-all hover:-translate-y-[1px]">
                        <div className="d-flex align-items-start justify-content-between gap-2">
                          <p className="kpi-title text-[11px] font-bold text-emerald-700 uppercase tracking-widest mb-0">Sisa Anggaran</p>
                          <i className="bi bi-graph-up-arrow kpi-muted" aria-hidden="true" title="Sisa" />
                        </div>
                        <p className="kpi-value text-xl font-black text-emerald-900 mt-1 safe-number tabular-nums tracking-tight" title={formatCurrency(remainingValue)}>{formatCurrency(remainingValue)}</p>
                        <p className="kpi-subtitle text-[12px] text-emerald-800/80 font-medium mt-1">Budget tersedia</p>
                        <p className="kpi-muted text-[12px] text-emerald-900/70 mt-2 pt-2 border-t border-emerald-200/70">
                          Filtered: <span className="font-semibold safe-number-inline" title={formatCurrency(remainingValueFiltered)}>{formatCurrency(remainingValueFiltered)}</span>
                        </p>
                      </div>
                      <div className={`kpi-card ${overBudgetValue > 0 ? 'card-melebihi bg-rose-50 border border-rose-200' : 'card-melebihi-zero bg-slate-50 border border-slate-200'} rounded-2xl p-5 min-w-[280px] w-max flex-none shadow-sm hover:shadow-md transition-all hover:-translate-y-[1px]`}>
                        <div className="d-flex align-items-start justify-content-between gap-2">
                          <p className={`kpi-title text-[11px] font-bold uppercase tracking-widest mb-0 ${overBudgetValue > 0 ? 'text-rose-700' : 'text-slate-500'}`}>Melebihi</p>
                          {overBudgetValue > 0 ? (
                            <i className="bi bi-exclamation-triangle-fill kpi-muted" aria-hidden="true" title="Over budget" />
                          ) : (
                            <i className="bi bi-shield-check kpi-muted" aria-hidden="true" title="Aman" />
                          )}
                        </div>
                        <p className={`kpi-value text-xl font-black mt-1 safe-number tabular-nums tracking-tight ${overBudgetValue > 0 ? 'text-rose-900' : 'text-slate-900'}`} title={formatCurrency(overBudgetValue)}>{formatCurrency(overBudgetValue)}</p>
                        <p className={`kpi-subtitle text-[12px] font-medium mt-1 ${overBudgetValue > 0 ? 'text-rose-800/80' : 'text-slate-500'}`}>{overBudgetValue > 0 ? 'Jika terserap > kontrak' : 'Tidak ada over budget'}</p>
                        <p className={`kpi-muted text-[12px] mt-2 pt-2 border-t ${overBudgetValue > 0 ? 'text-rose-900/70 border-rose-200/70' : 'text-slate-600 border-slate-200/60'}`}>
                          Filtered: <span className="font-semibold safe-number-inline" title={formatCurrency(overBudgetValueFiltered)}>{formatCurrency(overBudgetValueFiltered)}</span>
                        </p>
                      </div>
                      <div className="kpi-card card-prokrosa bg-indigo-50 border border-indigo-200 rounded-2xl p-5 min-w-[280px] w-max flex-none shadow-sm hover:shadow-md transition-all hover:-translate-y-[1px]">
                        <div className="d-flex align-items-start justify-content-between gap-2">
                          <p className="kpi-title text-[11px] font-bold text-indigo-700 uppercase tracking-widest mb-0">Prokrosa Durasi Contract</p>
                          <i className="bi bi-calendar3 kpi-muted" aria-hidden="true" title="Durasi" />
                        </div>
                        <p className="text-xl font-black text-indigo-900 mt-1 tabular-nums tracking-tight">
                          {estimatedMonthsRemaining === null
                            ? '—'
                            : `≈ ${estimatedMonthsRemaining.toFixed(1)} bln`}
                        </p>
                        <p className="kpi-muted text-[12px] text-indigo-900/70 font-medium mt-1 leading-snug">
                          {monthlyRunRate.mode === 'unparseable'
                            ? 'Periode belum terbaca sebagai bulan'
                            : `Avg ${formatCurrency(monthlyRunRate.averagePerMonth)}/bln (rentang ${monthlyRunRate.monthsCount} bln, data ${monthlyRunRate.monthsWithData} bln)`}
                        </p>
                        <p className="kpi-muted text-[12px] text-indigo-900/75 mt-2 leading-snug">
                          {prokrosaFormulaLabel}
                        </p>
                        {estimatedContractEndLabel && (
                          <p className="kpi-muted text-[12px] text-indigo-800 font-semibold mt-2 leading-snug">
                            {estimatedContractEndLabel}
                          </p>
                        )}
                        <p className="kpi-muted text-[12px] text-indigo-900/70 mt-2 pt-2 border-t border-indigo-200/70 leading-snug">
                          Filtered: {
                            estimatedMonthsRemainingFiltered === null
                              ? '—'
                              : `≈ ${estimatedMonthsRemainingFiltered.toFixed(1)} bln`
                          }
                          {monthlyRunRateFiltered.mode === 'range' && monthlyRunRateFiltered.averagePerMonth > 0
                            ? ` • Avg ${formatCurrency(monthlyRunRateFiltered.averagePerMonth)}/bln`
                            : ''}
                          {estimatedContractEndLabelFiltered ? ` • ${estimatedContractEndLabelFiltered}` : ''}
                        </p>
                        <p className="kpi-muted text-[12px] text-indigo-900/75 mt-2 leading-snug">
                          {prokrosaFormulaLabelFiltered}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress serapan</span>
                      <span className="text-[10px] font-bold text-slate-600">{absorbedPct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full overflow-hidden border border-slate-200" style={{ backgroundColor: progressTone.bg }} title={`Segment: ${progressTone.label}`}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ backgroundColor: progressTone.bar, width: `${absorbedPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Billing Summary Cards - COLORFUL VERSION */}
            {showStatus2Summary && data.length > 0 && (
              <div ref={status2SummaryRef} className="mb-10" id="ringkasan-status2">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Ringkasan Status2 (berdasarkan filter aktif)
                  </p>
                  <div
                    className={`text-[10px] font-bold tabular-nums ${Math.abs(status2CardsDiff) === 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                    title="Validasi: Σ semua kartu status2 harus sama dengan Grand Total Tagihan (filter aktif)."
                  >
                    Validasi: Σ kartu = {formatCurrency(status2CardsTotal)} · Grand Total = {formatCurrency(totalValue)}
                    {Math.abs(status2CardsDiff) === 0 ? '' : ` · Selisih: ${formatCurrency(status2CardsDiff)}`}
                    {rowsWithBlankStatus2 > 0 ? ` · Blank status2 → Status2 Kosong: ${rowsWithBlankStatus2} baris` : ''}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {sortedStatus2Cards.map(({ key, label }) => {
                    const theme = getStatusTheme(label);
                    const value = status2Stats[key]?.sum || 0;
                    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
                    
                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setStatus2ModalKey(key);
                          setStatus2ModalLabel(label);
                          setStatus2ModalOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setStatus2ModalKey(key);
                            setStatus2ModalLabel(label);
                            setStatus2ModalOpen(true);
                          }
                        }}
                        className={`${theme.bg} ${theme.border} border p-4 rounded-xl shadow-sm hover:shadow-md transition-all group overflow-hidden relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40`}
                        title="Klik untuk melihat detail data"
                      >
                        {/* Subtle decorative circle */}
                        <div className={`absolute -right-2 -top-2 w-8 h-8 rounded-full opacity-10 ${theme.bar}`}></div>
                        
                        <p className={`text-[9px] font-extrabold uppercase tracking-tight mb-2 truncate ${theme.text}`} title={label}>
                          {label}
                        </p>
                        <p className="text-base font-black text-slate-900 leading-none safe-number" title={formatCurrency(value)}>
                          {formatCurrency(value)}
                        </p>
                        
                        <div className="flex items-center justify-between mt-3">
                          <span className={`text-[9px] font-bold ${theme.text} opacity-70 tabular-nums`}>
                            {percentage.toFixed(1)}% of total
                          </span>
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
              </div>
            )}
          </>
        )}

        <Status2DetailModal
          open={status2ModalOpen}
          title={`Detail Status2: ${status2ModalLabel || status2ModalKey}`}
          rows={status2ModalRows}
          total={status2ModalTotal}
          formatCurrency={formatCurrency}
          onClose={() => setStatus2ModalOpen(false)}
        />

        <UploadHistoryModal
          open={uploadHistoryOpen}
          onClose={() => setUploadHistoryOpen(false)}
        />

        {pinModalOpen && (
          <div
            className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
            style={{ background: 'rgba(15, 23, 42, 0.42)', zIndex: 1080 }}
          >
            <div
              className="card border-0 shadow-lg overflow-hidden"
              style={{ width: '100%', maxWidth: 430, borderRadius: 22 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-pin-title"
            >
              <div
                className="px-4 px-md-5 pt-4 pt-md-5 pb-3"
                style={{ background: 'linear-gradient(135deg, rgba(13,110,253,0.10), rgba(99,102,241,0.08))' }}
              >
                <div className="d-flex align-items-start justify-content-between gap-3">
                  <div className="d-flex align-items-start gap-3">
                    <div
                      className="d-inline-flex align-items-center justify-content-center rounded-4 text-primary"
                      style={{ width: 52, height: 52, background: 'rgba(13,110,253,0.12)' }}
                    >
                      <i className="bi bi-shield-lock-fill fs-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 id="admin-pin-title" className="h5 fw-black mb-1">Admin Access</h2>
                      <p className="text-muted mb-0 small">
                        Masukkan PIN admin untuk membuka menu tools, upload, dan history.
                      </p>
                    </div>
                  </div>
                  {pinModalSource !== 'startup' && (
                    <button
                      type="button"
                      className="btn btn-sm btn-light border"
                      onClick={dismissPinModal}
                      aria-label="Tutup popup PIN"
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <div className="card-body px-4 px-md-5 py-4">
                <div className="mb-3">
                  <label htmlFor="admin-pin-input" className="form-label small text-uppercase text-muted fw-bold">
                    PIN Admin
                  </label>
                  <div className="input-group input-group-lg">
                    <span className="input-group-text bg-white">
                      <i className="bi bi-key-fill text-primary" aria-hidden="true" />
                    </span>
                    <input
                      id="admin-pin-input"
                      ref={pinInputRef}
                      type={pinVisible ? 'text' : 'password'}
                      className={`form-control ${pinError ? 'is-invalid' : ''}`}
                      placeholder="Masukkan PIN admin"
                      value={pinValue}
                      onChange={(e) => {
                        setPinValue(e.target.value);
                        if (pinError) setPinError(null);
                      }}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setPinVisible(prev => !prev)}
                      aria-label={pinVisible ? 'Sembunyikan PIN' : 'Lihat PIN'}
                    >
                      <i className={`bi ${pinVisible ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
                    </button>
                  </div>
                  {pinError && <div className="text-danger small mt-2">{pinError}</div>}
                </div>

                <div className="d-flex flex-column flex-sm-row gap-2 justify-content-end mt-4">
                  {pinModalSource !== 'startup' && (
                    <button type="button" className="btn btn-light border" onClick={dismissPinModal}>
                      Batal
                    </button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={submitPinModal}>
                    <i className="bi bi-unlock-fill me-2" aria-hidden="true" />
                    Buka Tools Admin
                  </button>
                </div>
              </div>
            </div>
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
            {activePage === 'tables' && activeTableTab === 'pivot' && (
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

            {activePage === 'tables' && activeTableTab === 'raw' && (
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

            {activePage === 'home' && activeTab === 'dashboard' && (
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
        </>
      )}
    </div>
  );
};

export default App;
