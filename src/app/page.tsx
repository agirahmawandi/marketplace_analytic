'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Database,
  TrendingUp,
  Tag,
  MapPin,
  Store,
  Star,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  Filter,
  BarChart3,
  Globe,
  ShoppingBag,
  Percent,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpDown,
  GitCompare,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from 'recharts';
import * as XLSX from 'xlsx';
import { MarketplaceId, ProductItem, SearchSession } from '@/types/marketplace';

const MARKETPLACE_META: Record<
  MarketplaceId,
  { label: string; color: string; bgBadge: string; textBadge: string; border: string }
> = {
  tokopedia: {
    label: 'Tokopedia',
    color: '#10b981',
    bgBadge: 'bg-emerald-100',
    textBadge: 'text-emerald-800',
    border: 'border-emerald-300',
  },
  shopee: {
    label: 'Shopee',
    color: '#f97316',
    bgBadge: 'bg-orange-100',
    textBadge: 'text-orange-800',
    border: 'border-orange-300',
  },
  blibli: {
    label: 'Blibli',
    color: '#3b82f6',
    bgBadge: 'bg-blue-100',
    textBadge: 'text-blue-800',
    border: 'border-blue-300',
  },
};

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1).replace('.0', '')} M`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace('.0', '')} Jt`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace('.0', '')} Rb`;
  }
  return String(num);
}

export default function MarketplaceAnalyticDashboard() {
  // Form state
  const [keyword, setKeyword] = useState('fillet dada ayam');
  const [selectedMps, setSelectedMps] = useState<MarketplaceId[]>([
    'tokopedia',
    'shopee',
    'blibli',
  ]);
  const [searchLocation, setSearchLocation] = useState<string>('all');
  const [customLocation, setCustomLocation] = useState<string>('');
  const [limitPerMp, setLimitPerMp] = useState<number>(10);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [cdpConnected, setCdpConnected] = useState<boolean>(false);

  // History & Active Session state
  const [sessions, setSessions] = useState<SearchSession[]>([]);
  const [activeSession, setActiveSession] = useState<SearchSession | null>(null);
  const [compareSessionId, setCompareSessionId] = useState<number | null>(null);

  // Table Filter & Sort state
  const [filterMp, setFilterMp] = useState<'all' | MarketplaceId>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [filterText, setFilterText] = useState<string>('');
  const [onlyDiscounted, setOnlyDiscounted] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<
    'sold_desc' | 'price_asc' | 'price_desc' | 'discount_desc' | 'rating_desc' | 'revenue_desc'
  >('sold_desc');

  // Load initial history from SQLite database & check CDP connection
  useEffect(() => {
    fetchHistory(true);
    checkChromeCdp();
  }, []);

  async function checkChromeCdp() {
    try {
      const res = await fetch('/api/browser-session');
      const data = await res.json();
      setCdpConnected(Boolean(data.connected));
    } catch {
      setCdpConnected(false);
    }
  }

  async function fetchHistory(autoSeedIfEmpty = false) {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.sessions && data.sessions.length > 0) {
        setSessions(data.sessions);
        if (data.latestSession) {
          setActiveSession(data.latestSession);
        }
      } else if (autoSeedIfEmpty) {
        // Jalankan pencarian awal otomatis untuk "fillet dada ayam" jika database masih kosong
        handleRunSearch('fillet dada ayam');
      }
    } catch {
      // Abaikan jika gagal pada pemuatan pertama
    }
  }

  function toggleMarketplace(mp: MarketplaceId) {
    setSelectedMps((prev) =>
      prev.includes(mp) ? prev.filter((item) => item !== mp) : [...prev, mp]
    );
  }

  const mpPresetValue = useMemo(() => {
    const s = [...selectedMps].sort().join(',');
    if (s === 'blibli,shopee,tokopedia') return 'all';
    if (s === 'shopee') return 'shopee';
    if (s === 'tokopedia') return 'tokopedia';
    if (s === 'blibli') return 'blibli';
    if (s === 'shopee,tokopedia') return 'tokopedia,shopee';
    if (s === 'blibli,tokopedia') return 'tokopedia,blibli';
    if (s === 'blibli,shopee') return 'shopee,blibli';
    return 'custom';
  }, [selectedMps]);

  function handleMpPresetChange(val: string) {
    if (val === 'all') setSelectedMps(['tokopedia', 'shopee', 'blibli']);
    else if (val === 'shopee') setSelectedMps(['shopee']);
    else if (val === 'tokopedia') setSelectedMps(['tokopedia']);
    else if (val === 'blibli') setSelectedMps(['blibli']);
    else if (val === 'tokopedia,shopee') setSelectedMps(['tokopedia', 'shopee']);
    else if (val === 'tokopedia,blibli') setSelectedMps(['tokopedia', 'blibli']);
    else if (val === 'shopee,blibli') setSelectedMps(['shopee', 'blibli']);
  }

  async function handleRunSearch(customKeyword?: string) {
    const targetKeyword = (customKeyword ?? keyword).trim();
    if (!targetKeyword) {
      setErrorMessage('Masukkan kata kunci produk terlebih dahulu (contoh: fillet dada ayam).');
      return;
    }
    if (selectedMps.length === 0) {
      setErrorMessage('Pilih minimal satu marketplace.');
      return;
    }

    const effectiveLocation =
      searchLocation === 'custom'
        ? customLocation.trim() || 'all'
        : searchLocation;

    const locText =
      effectiveLocation && effectiveLocation !== 'all'
        ? ` di lokasi "${effectiveLocation}"`
        : ' (Semua Lokasi)';

    setIsSearching(true);
    setErrorMessage('');
    setStatusMessage(
      `Sedang mencari & menganalisa "${targetKeyword}"${locText} pada ${selectedMps
        .map((m) => MARKETPLACE_META[m].label)
        .join(' & ')}...`
    );

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: targetKeyword,
          marketplaces: selectedMps,
          location: effectiveLocation,
          limitPerMarketplace: limitPerMp,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setErrorMessage(data.error || 'Gagal mengambil data.');
      } else if (data.session) {
        setActiveSession(data.session);
        setFilterMp('all');
        setFilterCity('all');
        setFilterText('');
        setStatusMessage(
          `Berhasil menyimpan ${data.session.total_items} produk untuk "${data.session.keyword}" (${selectedMps
            .map((m) => MARKETPLACE_META[m].label)
            .join(', ')}) ke database lokal.`
        );
        // Perbarui daftar riwayat di sidebar
        const histRes = await fetch('/api/history');
        const histData = await histRes.json();
        if (histData.sessions) setSessions(histData.sessions);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Gagal menghubungi server: ${msg}`);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSelectHistorySession(id: number) {
    try {
      const res = await fetch(`/api/history/${id}`);
      const data = await res.json();
      if (data.session) {
        setActiveSession(data.session);
        setKeyword(data.session.keyword);
        setFilterMp('all');
        setFilterCity('all');
        setFilterText('');
        setStatusMessage(
          `Memuat riwayat pencarian "${data.session.keyword}" (#${data.session.id})`
        );
      }
    } catch {
      setErrorMessage('Gagal memuat detail sesi riwayat.');
    }
  }

  async function handleDeleteSession(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      const updated = sessions.filter((s) => s.id !== id);
      setSessions(updated);
      if (activeSession?.id === id) {
        if (updated.length > 0) {
          handleSelectHistorySession(updated[0].id);
        } else {
          setActiveSession(null);
        }
      }
    } catch {
      setErrorMessage('Gagal menghapus riwayat.');
    }
  }

  async function handleOpenBrowserSession(targetUrl: string) {
    setStatusMessage('Menghubungkan & membuka jendela Chrome CDP (Port 9222)...');
    try {
      const res = await fetch('/api/browser-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl }),
      });
      const data = await res.json();
      setCdpConnected(Boolean(data.connected));
      setStatusMessage(data.message || 'Chrome CDP dibuka.');
      setTimeout(checkChromeCdp, 2000);
    } catch {
      setErrorMessage('Gagal membuka Chrome CDP lokal.');
    }
  }

  const allProducts: ProductItem[] = useMemo(
    () => activeSession?.products || [],
    [activeSession]
  );

  // Daftar kota penjual unik beserta jumlah produknya
  const cityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allProducts) {
      if (filterMp !== 'all' && p.marketplace !== filterMp) continue;
      const city = p.shop_city || 'Tidak Diketahui';
      counts.set(city, (counts.get(city) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
  }, [allProducts, filterMp]);

  // Produk yang sudah difilter & diurutkan
  const filteredProducts = useMemo(() => {
    return allProducts
      .filter((p) => {
        if (filterMp !== 'all' && p.marketplace !== filterMp) return false;
        if (filterCity !== 'all' && p.shop_city !== filterCity) return false;
        if (onlyDiscounted && (!p.discount_pct || p.discount_pct <= 0)) return false;
        if (filterText.trim()) {
          const q = filterText.toLowerCase();
          const matchName = p.product_name.toLowerCase().includes(q);
          const matchShop = p.shop_name.toLowerCase().includes(q);
          const matchCity = p.shop_city.toLowerCase().includes(q);
          if (!matchName && !matchShop && !matchCity) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'sold_desc':
            return b.sold_count - a.sold_count;
          case 'price_asc':
            return a.price_final - b.price_final;
          case 'price_desc':
            return b.price_final - a.price_final;
          case 'discount_desc':
            return b.discount_pct - a.discount_pct;
          case 'rating_desc':
            return b.rating - a.rating;
          case 'revenue_desc':
            return (
              b.price_final * b.sold_count - a.price_final * a.sold_count
            );
          default:
            return 0;
        }
      });
  }, [allProducts, filterMp, filterCity, onlyDiscounted, filterText, sortBy]);

  // Metrik KPI Dinamis berdasarkan produk yang sedang difilter
  const kpiStats = useMemo(() => {
    if (filteredProducts.length === 0) {
      return {
        totalItems: 0,
        uniqueShops: 0,
        uniqueCities: 0,
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0,
        totalSold: 0,
        totalRevenue: 0,
        discountedCount: 0,
        discountedSharePct: 0,
        avgDiscountPct: 0,
      };
    }

    const prices = filteredProducts.map((p) => p.price_final).filter((v) => v > 0);
    const avgPrice =
      prices.length > 0
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const totalSold = filteredProducts.reduce((acc, p) => acc + p.sold_count, 0);
    const totalRevenue = filteredProducts.reduce(
      (acc, p) => acc + p.price_final * p.sold_count,
      0
    );

    const discItems = filteredProducts.filter((p) => p.discount_pct > 0);
    const discountedCount = discItems.length;
    const discountedSharePct = Math.round(
      (discountedCount / filteredProducts.length) * 100
    );
    const avgDiscountPct =
      discountedCount > 0
        ? Number(
            (
              discItems.reduce((acc, p) => acc + p.discount_pct, 0) /
              discountedCount
            ).toFixed(1)
          )
        : 0;

    const uniqueShops = new Set(
      filteredProducts.map((p) => `${p.marketplace}:${p.shop_name}`)
    ).size;
    const uniqueCities = new Set(filteredProducts.map((p) => p.shop_city)).size;

    return {
      totalItems: filteredProducts.length,
      uniqueShops,
      uniqueCities,
      avgPrice,
      minPrice,
      maxPrice,
      totalSold,
      totalRevenue,
      discountedCount,
      discountedSharePct,
      avgDiscountPct,
    };
  }, [filteredProducts]);

  // Data Grafik 1: Perbandingan Harga per Marketplace
  const mpComparisonData = useMemo(() => {
    const mps: MarketplaceId[] = ['tokopedia', 'shopee', 'blibli'];
    return mps
      .map((mp) => {
        const items = filteredProducts.filter((p) => p.marketplace === mp);
        if (items.length === 0) return null;
        const prices = items.map((p) => p.price_final);
        const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const totalSold = items.reduce((a, b) => a + b.sold_count, 0);
        return {
          name: MARKETPLACE_META[mp].label,
          marketplace: mp,
          'Harga Termurah': min,
          'Rata-rata Harga': avg,
          'Harga Termahal': max,
          totalSold,
          count: items.length,
        };
      })
      .filter(Boolean);
  }, [filteredProducts]);

  // Data Grafik 2: Sebaran Kota Penjual Terbanyak (Top 8 Kota)
  const cityChartData = useMemo(() => {
    const map = new Map<
      string,
      { city: string; jumlahProduk: number; totalTerjual: number; avgPrice: number; sumPrice: number }
    >();
    for (const p of filteredProducts) {
      const city = p.shop_city || 'Lainnya';
      const cur = map.get(city) || {
        city,
        jumlahProduk: 0,
        totalTerjual: 0,
        avgPrice: 0,
        sumPrice: 0,
      };
      cur.jumlahProduk += 1;
      cur.totalTerjual += p.sold_count;
      cur.sumPrice += p.price_final;
      cur.avgPrice = Math.round(cur.sumPrice / cur.jumlahProduk);
      map.set(city, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.jumlahProduk - a.jumlahProduk || b.totalTerjual - a.totalTerjual)
      .slice(0, 8);
  }, [filteredProducts]);

  // Data Grafik 3: Distribusi Rentang Harga (Histogram 5 kelompok)
  const priceHistogramData = useMemo(() => {
    if (filteredProducts.length === 0) return [];
    const prices = filteredProducts.map((p) => p.price_final);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
      return [{ range: formatRupiah(min), count: filteredProducts.length }];
    }
    const bucketCount = 5;
    const step = Math.ceil((max - min) / bucketCount / 1000) * 1000 || 5000;
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const low = min + i * step;
      const high = low + step;
      return {
        range: `Rp${Math.round(low / 1000)}rb - Rp${Math.round(high / 1000)}rb`,
        low,
        high,
        Jumlah: 0,
      };
    });

    for (const price of prices) {
      const idx = Math.min(
        Math.floor((price - min) / step),
        bucketCount - 1
      );
      if (buckets[idx]) buckets[idx].Jumlah += 1;
    }
    return buckets;
  }, [filteredProducts]);

  // Data Grafik 4: Top 8 Toko Terlaris beserta Kotanya
  const topShopsData = useMemo(() => {
    return [...filteredProducts]
      .sort((a, b) => b.sold_count - a.sold_count)
      .slice(0, 8)
      .map((p) => ({
        shopLabel: `${p.shop_name.slice(0, 18)} (${p.shop_city})`,
        Terjual: p.sold_count,
        Harga: p.price_final,
        marketplace: p.marketplace,
      }));
  }, [filteredProducts]);

  // Data Sesi Pembanding (Snapshot Comparison)
  const comparedSession = useMemo(() => {
    if (!compareSessionId) return null;
    return sessions.find((s) => s.id === compareSessionId) || null;
  }, [compareSessionId, sessions]);

  // Export ke Excel (.xlsx) atau CSV
  function handleExport(format: 'xlsx' | 'csv') {
    if (filteredProducts.length === 0) return;

    const rows = filteredProducts.map((p, idx) => ({
      No: idx + 1,
      Marketplace: MARKETPLACE_META[p.marketplace]?.label || p.marketplace,
      'Nama Produk': p.product_name,
      'Nama Toko': p.shop_name,
      'Kota Penjual': p.shop_city,
      'Status Toko': p.shop_badge,
      'Harga Final (Rp)': p.price_final,
      'Harga Asli / Coret (Rp)': p.price_original,
      'Diskon Penjual (%)': p.discount_pct,
      'Total Terjual (Unit)': p.sold_count,
      'Teks Terjual': p.sold_text_raw,
      'Estimasi Omzet (Rp)': p.price_final * p.sold_count,
      'Rating Toko/Produk': p.rating,
      'Jumlah Ulasan': p.review_count,
      'Link Produk': p.product_url,
      'Waktu Pengambilan': p.scraped_at,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Analisa Produk');

    const safeKw = (activeSession?.keyword || keyword || 'produk')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    const filename = `analisa_${safeKw}_${new Date().toISOString().slice(0, 10)}.${format}`;

    XLSX.writeFile(workbook, filename, { bookType: format });
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-slate-50">
      {/* SIDEBAR RIWAYAT DATABASE */}
      <aside className="w-full lg:w-80 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-600 text-white">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white">
                Marketplace Analytic
              </h1>
              <p className="text-xs text-slate-400">
                Shopee • Tokopedia • Blibli
              </p>
            </div>
          </div>
        </div>

        {/* Panel Koneksi Chrome Aktif (CDP Port 9222) */}
        <div className="p-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-200 font-semibold flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Koneksi Chrome (CDP 9222)
            </p>
            <span
              onClick={checkChromeCdp}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer flex items-center gap-1 ${
                cdpConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
              title="Klik untuk cek ulang status koneksi Chrome"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  cdpConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {cdpConnected ? 'Terhubung' : 'Standby'}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 mb-2.5 leading-relaxed">
            {cdpConnected
              ? 'Chrome Anda sudah terhubung! Scraper akan langsung meminjam sesi Chrome ini (bebas Captcha).'
              : 'Klik tombol di bawah untuk membuka Chrome terhubung (Port 9222) & login akun marketplace Anda.'}
          </p>

          <button
            type="button"
            onClick={() => handleOpenBrowserSession('https://shopee.co.id')}
            className="w-full mb-2 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Globe className="w-3.5 h-3.5" />
            {cdpConnected
              ? 'Buka Tab Baru di Chrome CDP'
              : 'Aktifkan & Buka Chrome (CDP)'}
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleOpenBrowserSession('https://shopee.co.id')}
              className="px-2 py-1.5 rounded text-[11px] font-medium bg-orange-600/20 text-orange-300 border border-orange-500/30 hover:bg-orange-600/30 transition cursor-pointer"
            >
              Shopee
            </button>
            <button
              type="button"
              onClick={() => handleOpenBrowserSession('https://www.tokopedia.com')}
              className="px-2 py-1.5 rounded text-[11px] font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 transition cursor-pointer"
            >
              Tokopedia
            </button>
            <button
              type="button"
              onClick={() => handleOpenBrowserSession('https://www.blibli.com')}
              className="px-2 py-1.5 rounded text-[11px] font-medium bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition cursor-pointer"
            >
              Blibli
            </button>
          </div>
        </div>

        {/* Daftar Riwayat Pencarian di SQLite */}
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            Riwayat Database ({sessions.length})
          </div>
          <button
            type="button"
            onClick={() => fetchHistory(false)}
            className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
            title="Segarkan Riwayat"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[360px] lg:max-h-none">
          {sessions.length === 0 ? (
            <div className="text-center py-8 px-3 text-slate-500 text-xs">
              Belum ada riwayat pencarian tersimpan.
            </div>
          ) : (
            sessions.map((s) => {
              const isSelected = activeSession?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => handleSelectHistorySession(s.id)}
                  className={`group p-3 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                      : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-sm capitalize truncate">
                      {s.keyword}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="opacity-60 group-hover:opacity-100 text-slate-400 hover:text-rose-400 p-0.5 transition cursor-pointer"
                      title="Hapus riwayat ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-200 font-medium">
                      {s.total_items} produk
                    </span>
                    <span>•</span>
                    <span>Rata2 {formatRupiah(s.avg_price)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="uppercase">{s.marketplaces}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(s.created_at).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* KONTEN UTAMA DASHBOARD */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* TOP SEARCH BAR & KONTROL OPSI PENCARIAN */}
        <header className="bg-white border-b border-slate-200 p-5 shadow-xs">
          <div className="max-w-7xl mx-auto space-y-3.5">
            {/* Baris 1: Input Kata Kunci + Opsi Marketplace + Opsi Lokasi + Limit + Tombol Analisa */}
            <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center">
              {/* Input Kata Kunci */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRunSearch();
                  }}
                  placeholder="Cari produk (contoh: fillet dada ayam, paha ayam, daging slice)..."
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm font-medium text-slate-800"
                />
              </div>

              {/* Opsi Pilihan Marketplace di Search Bar */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50/70">
                  <ShoppingBag className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                    Marketplace:
                  </span>
                  <select
                    value={mpPresetValue}
                    onChange={(e) => handleMpPresetChange(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="all">Semua (Tokopedia, Shopee, Blibli)</option>
                    <option value="shopee">Shopee Saja</option>
                    <option value="tokopedia">Tokopedia Saja</option>
                    <option value="blibli">Blibli Saja</option>
                    <option value="tokopedia,shopee">Tokopedia & Shopee</option>
                    <option value="tokopedia,blibli">Tokopedia & Blibli</option>
                    <option value="shopee,blibli">Shopee & Blibli</option>
                  </select>
                </div>
              </div>

              {/* Opsi Pilihan Lokasi / Kota Penjual di Search Bar */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50/70">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                    Lokasi:
                  </span>
                  <select
                    value={searchLocation}
                    onChange={(e) => setSearchLocation(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="all">Semua Lokasi (Nasional)</option>
                    <option value="Jakarta">Jakarta (Semua)</option>
                    <option value="Jakarta Selatan">Jakarta Selatan</option>
                    <option value="Jakarta Barat">Jakarta Barat</option>
                    <option value="Jakarta Timur">Jakarta Timur</option>
                    <option value="Jakarta Utara">Jakarta Utara</option>
                    <option value="Jakarta Pusat">Jakarta Pusat</option>
                    <option value="Tangerang">Kota Tangerang</option>
                    <option value="Tangerang Selatan">Tangerang Selatan</option>
                    <option value="Kab. Tangerang">Kab. Tangerang</option>
                    <option value="Bekasi">Bekasi</option>
                    <option value="Depok">Depok</option>
                    <option value="Bogor">Kota Bogor</option>
                    <option value="Kab. Bogor">Kab. Bogor</option>
                    <option value="Bandung">Bandung</option>
                    <option value="Surabaya">Surabaya</option>
                    <option value="Semarang">Semarang</option>
                    <option value="Yogyakarta">Yogyakarta</option>
                    <option value="Medan">Medan</option>
                    <option value="Malang">Malang</option>
                    <option value="Denpasar">Denpasar</option>
                    <option value="custom">+ Ketik Kota Lainnya...</option>
                  </select>
                </div>

                {searchLocation === 'custom' && (
                  <input
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    placeholder="Ketik nama kota..."
                    className="px-3 py-2 rounded-xl border border-indigo-400 text-xs font-medium text-slate-800 outline-none w-36"
                  />
                )}
              </div>

              {/* Pilihan Limit per Marketplace */}
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50/70">
                <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                  Limit/MP:
                </span>
                <select
                  value={limitPerMp}
                  onChange={(e) => setLimitPerMp(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  <option value={10}>10 Produk</option>
                  <option value={20}>20 Produk</option>
                  <option value={30}>30 Produk</option>
                </select>
              </div>

              {/* Tombol Mulai Analisa */}
              <button
                type="button"
                disabled={isSearching}
                onClick={() => handleRunSearch()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition cursor-pointer whitespace-nowrap"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Mencari...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Analisa Produk
                  </>
                )}
              </button>
            </div>

            {/* Baris 2: Checkbox Cepat Marketplace & Kata Kunci Populer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 mr-1">
                  Centang Marketplace:
                </span>
                {(['tokopedia', 'shopee', 'blibli'] as MarketplaceId[]).map(
                  (mp) => {
                    const checked = selectedMps.includes(mp);
                    const meta = MARKETPLACE_META[mp];
                    return (
                      <button
                        key={mp}
                        type="button"
                        onClick={() => toggleMarketplace(mp)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                          checked
                            ? `${meta.bgBadge} ${meta.textBadge} ${meta.border}`
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          className="rounded pointer-events-none"
                        />
                        {meta.label}
                      </button>
                    );
                  }
                )}

                {searchLocation !== 'all' && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                    <MapPin className="w-3 h-3" />
                    Target Lokasi:{' '}
                    {searchLocation === 'custom'
                      ? customLocation || 'Kustom'
                      : searchLocation}
                    <button
                      type="button"
                      onClick={() => setSearchLocation('all')}
                      className="ml-1 text-rose-500 hover:text-rose-800 font-bold cursor-pointer"
                      title="Hapus filter lokasi pencarian"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>

              {/* Contoh Pencarian Cepat */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Cepat:</span>
                {[
                  'fillet dada ayam',
                  'paha ayam fillet',
                  'daging sapi slice',
                  'dada ayam 1kg',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setKeyword(preset);
                      handleRunSearch(preset);
                    }}
                    className="px-2 py-1 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Banner Status / Info Sumber Data */}
            {(statusMessage || errorMessage || activeSession?.data_source_note) && (
              <div className="pt-1">
                {errorMessage ? (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-indigo-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="font-medium">
                        {statusMessage ||
                          `Menampilkan hasil analisa untuk "${activeSession?.keyword}"`}
                      </span>
                    </div>
                    {activeSession?.data_source_note && (
                      <span className="text-[11px] text-indigo-700 bg-indigo-100/80 px-2.5 py-0.5 rounded-full">
                        {activeSession.data_source_note}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* ISI DASHBOARD */}
        <div className="flex-1 p-5 max-w-7xl w-full mx-auto space-y-6">
          {/* BARIS FILTER GLOBAL & PERBANDINGAN RIWAYAT */}
          <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Filter className="w-4 h-4 text-indigo-600" />
                Filter Aktif:
              </div>

              {/* Filter Marketplace */}
              <select
                value={filterMp}
                onChange={(e) =>
                  setFilterMp(e.target.value as 'all' | MarketplaceId)
                }
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium bg-white text-slate-700"
              >
                <option value="all">Semua Marketplace</option>
                <option value="tokopedia">Tokopedia</option>
                <option value="shopee">Shopee</option>
                <option value="blibli">Blibli</option>
              </select>

              {/* Filter Kota Penjual */}
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <select
                  value={filterCity}
                  onChange={(e) => setFilterCity(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium bg-white text-slate-700"
                >
                  <option value="all">
                    Semua Kota Penjual ({cityOptions.length} Kota)
                  </option>
                  {cityOptions.map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city} ({c.count} produk)
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggle Hanya Produk Diskon */}
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={onlyDiscounted}
                  onChange={(e) => setOnlyDiscounted(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <Percent className="w-3.5 h-3.5 text-amber-600" />
                Hanya Produk Diskon Penjual
              </label>

              {(filterMp !== 'all' ||
                filterCity !== 'all' ||
                onlyDiscounted ||
                filterText) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterMp('all');
                    setFilterCity('all');
                    setOnlyDiscounted(false);
                    setFilterText('');
                  }}
                  className="text-xs text-rose-600 hover:underline font-medium cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {/* Fitur Bandingkan dengan Riwayat Lain */}
            {sessions.length > 1 && (
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-slate-600">
                  Bandingkan Riwayat:
                </span>
                <select
                  value={compareSessionId || ''}
                  onChange={(e) =>
                    setCompareSessionId(
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-700"
                >
                  <option value="">-- Tidak Dibandingkan --</option>
                  {sessions
                    .filter((s) => s.id !== activeSession?.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        #{s.id} {s.keyword} (Rata2 {formatRupiah(s.avg_price)})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </section>

          {/* PANEL PERBANDINGAN RIWAYAT (Jika dipilih) */}
          {comparedSession && activeSession && (
            <section className="bg-indigo-950 text-white p-4 rounded-2xl border border-indigo-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">
                  Perbandingan Antar Riwayat Pencarian
                </div>
                <div className="text-sm font-bold mt-0.5">
                  Sesi Saat Ini (#{activeSession.id} - {activeSession.keyword}) vs
                  Sesi #{comparedSession.id} ({comparedSession.keyword})
                </div>
              </div>
              <div className="flex flex-wrap gap-6 text-xs">
                <div>
                  <span className="text-indigo-300 block">Selisih Rata-rata Harga</span>
                  <span className="font-bold text-sm">
                    {formatRupiah(activeSession.avg_price - comparedSession.avg_price)}{' '}
                    (
                    {(
                      ((activeSession.avg_price - comparedSession.avg_price) /
                        (comparedSession.avg_price || 1)) *
                      100
                    ).toFixed(1)}
                    %)
                  </span>
                </div>
                <div>
                  <span className="text-indigo-300 block">Selisih Total Terjual</span>
                  <span className="font-bold text-sm">
                    {formatCompactNumber(
                      activeSession.total_sold - comparedSession.total_sold
                    )}{' '}
                    unit
                  </span>
                </div>
                <div>
                  <span className="text-indigo-300 block">Rata-rata Diskon</span>
                  <span className="font-bold text-sm">
                    {activeSession.avg_discount_pct}% vs{' '}
                    {comparedSession.avg_discount_pct}%
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* 4 KARTU RINGKASAN STATISTIK (KPI CARDS) */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Rata-rata Harga Pasar */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>RATA-RATA HARGA PASAR</span>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Tag className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatRupiah(kpiStats.avgPrice)}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>
                  Termurah:{' '}
                  <strong className="text-emerald-700">
                    {formatRupiah(kpiStats.minPrice)}
                  </strong>
                </span>
                <span>
                  Termahal:{' '}
                  <strong className="text-rose-600">
                    {formatRupiah(kpiStats.maxPrice)}
                  </strong>
                </span>
              </div>
            </div>

            {/* Card 2: Total Terjual & Estimasi Omzet */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>TOTAL TERJUAL & OMZET</span>
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {kpiStats.totalSold.toLocaleString('id-ID')}{' '}
                <span className="text-sm font-medium text-slate-500">unit</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>Estimasi Omzet:</span>
                <strong className="text-indigo-700">
                  Rp {formatCompactNumber(kpiStats.totalRevenue)}
                </strong>
              </div>
            </div>

            {/* Card 3: Strategi Diskon Penjual */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>ANALISA DISKON PENJUAL</span>
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {kpiStats.avgDiscountPct}%{' '}
                <span className="text-sm font-medium text-slate-500">
                  rata-rata diskon
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>Penjual pakai diskon:</span>
                <strong className="text-amber-700">
                  {kpiStats.discountedCount} dari {kpiStats.totalItems} produk (
                  {kpiStats.discountedSharePct}%)
                </strong>
              </div>
            </div>

            {/* Card 4: Sebaran Toko & Kota Penjual */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>TOKO & KOTA PENJUAL</span>
                <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                  <MapPin className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {kpiStats.uniqueCities}{' '}
                <span className="text-sm font-medium text-slate-500">
                  Kota Penjual
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>Total sampel:</span>
                <strong className="text-slate-800">
                  {kpiStats.totalItems} produk ({kpiStats.uniqueShops} toko)
                </strong>
              </div>
            </div>
          </section>

          {/* VISUALISASI GRAFIK ANALITIK */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Grafik 1: Perbandingan Harga Antar Marketplace */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-indigo-600" />
                  Perbandingan Harga Antar Marketplace (Rp)
                </h2>
                <p className="text-xs text-slate-500">
                  Membandingkan harga termurah, rata-rata, dan termahal di Tokopedia,
                  Shopee, dan Blibli
                </p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mpComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis
                      tickFormatter={(v) => `Rp${Math.round(v / 1000)}rb`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(val: number) => formatRupiah(val)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="Harga Termurah"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Rata-rata Harga"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Harga Termahal"
                      fill="#f43f5e"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Grafik 2: Sebaran Kota Penjual Terbanyak */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-600" />
                    Sebaran Kota Penjual Terbanyak
                  </h2>
                  <p className="text-xs text-slate-500">
                    Kota dengan jumlah penjual & suplai produk terbanyak
                  </p>
                </div>
                {filterCity !== 'all' && (
                  <span className="text-xs bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full font-semibold">
                    Filter: {filterCity}
                  </span>
                )}
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={cityChartData}
                    layout="vertical"
                    margin={{ left: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="city"
                      width={115}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(val: number, name: string) =>
                        name === 'jumlahProduk'
                          ? [`${val} Produk`, 'Jumlah Produk']
                          : [val.toLocaleString('id-ID'), name]
                      }
                    />
                    <Bar
                      dataKey="jumlahProduk"
                      name="Jumlah Produk"
                      fill="#ec4899"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Grafik 3: Distribusi Rentang Harga Pasar */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-600" />
                  Distribusi Rentang Harga Pasar (Histogram)
                </h2>
                <p className="text-xs text-slate-500">
                  Melihat di kelompok harga berapa mayoritas penjual memasang harga
                </p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priceHistogramData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      dataKey="Jumlah"
                      name="Jumlah Produk"
                      fill="#14b8a6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Grafik 4: Top 8 Toko Terlaris beserta Kotanya */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Store className="w-4 h-4 text-amber-600" />
                  Top 8 Toko & Produk Terlaris (beserta Kota)
                </h2>
                <p className="text-xs text-slate-500">
                  Toko dengan volume penjualan tertinggi untuk kata kunci ini
                </p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topShopsData}
                    layout="vertical"
                    margin={{ left: 35 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="shopLabel"
                      width={140}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(val: number) => [
                        `${val.toLocaleString('id-ID')} terjual`,
                        'Total Terjual',
                      ]}
                    />
                    <Bar dataKey="Terjual" radius={[0, 4, 4, 0]}>
                      {topShopsData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            MARKETPLACE_META[
                              entry.marketplace as MarketplaceId
                            ]?.color || '#6366f1'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* TABEL DATA PRODUK LENGKAP & EXPORT */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header Tabel */}
            <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Produk Hasil Analisa ({filteredProducts.length} Produk)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menampilkan nama produk, nama toko, kota penjual, harga final,
                  diskon penjual, total terjual, dan rating toko.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Cari di dalam tabel */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Cari nama toko / kota / produk..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs outline-none focus:border-indigo-600"
                  />
                </div>

                {/* Urutkan berdasarkan */}
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as typeof sortBy)
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium bg-white text-slate-700"
                  >
                    <option value="sold_desc">Urutkan: Terlaris</option>
                    <option value="price_asc">Urutkan: Harga Termurah</option>
                    <option value="price_desc">Urutkan: Harga Termahal</option>
                    <option value="discount_desc">
                      Urutkan: Diskon Penjual Terbesar (%)
                    </option>
                    <option value="rating_desc">Urutkan: Rating Tertinggi</option>
                    <option value="revenue_desc">
                      Urutkan: Estimasi Omzet Tertinggi
                    </option>
                  </select>
                </div>

                {/* Tombol Export Excel & CSV */}
                <button
                  type="button"
                  onClick={() => handleExport('xlsx')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              </div>
            </div>

            {/* Isi Tabel */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4">No</th>
                    <th className="py-3.5 px-4">Marketplace</th>
                    <th className="py-3.5 px-4 min-w-[260px]">Nama Produk</th>
                    <th className="py-3.5 px-4">Nama Toko</th>
                    <th className="py-3.5 px-4">Kota Penjual</th>
                    <th className="py-3.5 px-4 text-right">Harga Jual</th>
                    <th className="py-3.5 px-4 text-center">Diskon Penjual</th>
                    <th className="py-3.5 px-4 text-right">Total Terjual</th>
                    <th className="py-3.5 px-4 text-right">Estimasi Omzet</th>
                    <th className="py-3.5 px-4 text-center">Rating</th>
                    <th className="py-3.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="py-12 text-center text-slate-400"
                      >
                        Tidak ada produk yang cocok dengan filter saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((item, index) => {
                      const mpMeta =
                        MARKETPLACE_META[item.marketplace] ||
                        MARKETPLACE_META.tokopedia;
                      const estOmzet = item.price_final * item.sold_count;

                      return (
                        <tr
                          key={`${item.marketplace}-${item.external_id}-${index}`}
                          className="hover:bg-slate-50/90 transition"
                        >
                          <td className="py-3.5 px-4 font-medium text-slate-400">
                            {index + 1}
                          </td>

                          {/* Marketplace Badge */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${mpMeta.bgBadge} ${mpMeta.textBadge} ${mpMeta.border}`}
                            >
                              {mpMeta.label}
                            </span>
                          </td>

                          {/* Nama Produk & Thumbnail */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-start gap-2.5">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.product_name}
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                                  loading="lazy"
                                />
                              ) : null}
                              <div>
                                <a
                                  href={item.product_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline line-clamp-2 leading-snug transition"
                                  title={`Buka halaman produk: ${item.product_name}`}
                                >
                                  {item.product_name}
                                </a>
                                <div className="text-[10px] text-slate-400 truncate max-w-[280px] mt-0.5">
                                  {item.product_url}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Nama Toko & Badge */}
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-800 flex items-center gap-1">
                              <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{item.shop_name}</span>
                            </div>
                            {item.shop_badge && (
                              <span className="inline-block mt-0.5 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded font-medium">
                                {item.shop_badge}
                              </span>
                            )}
                          </td>

                          {/* Kota Penjual */}
                          <td className="py-3.5 px-4">
                            <button
                              type="button"
                              onClick={() => setFilterCity(item.shop_city)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-medium transition cursor-pointer"
                              title="Klik untuk filter kota ini"
                            >
                              <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                              {item.shop_city}
                            </button>
                          </td>

                          {/* Harga Final & Harga Coret */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="font-bold text-slate-900 text-sm">
                              {formatRupiah(item.price_final)}
                            </div>
                            {item.price_original > item.price_final && (
                              <div className="text-[11px] text-slate-400 line-through">
                                {formatRupiah(item.price_original)}
                              </div>
                            )}
                          </td>

                          {/* Diskon Penjual */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {item.discount_pct > 0 ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 font-bold text-xs">
                                  -{item.discount_pct}%
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5">
                                  Hemat{' '}
                                  {formatRupiah(
                                    item.price_original - item.price_final
                                  )}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">
                                Tanpa Diskon
                              </span>
                            )}
                          </td>

                          {/* Total Terjual */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              {item.sold_count.toLocaleString('id-ID')}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {item.sold_text_raw}
                            </div>
                          </td>

                          {/* Estimasi Omzet */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap font-semibold text-indigo-700">
                            Rp {formatCompactNumber(estOmzet)}
                          </td>

                          {/* Rating */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1 font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                              {item.rating > 0 ? item.rating.toFixed(1) : '-'}
                            </div>
                            {item.review_count > 0 && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                ({item.review_count.toLocaleString('id-ID')} ulasan)
                              </div>
                            )}
                          </td>

                          {/* Link Produk */}
                          <td className="py-3.5 px-4 text-center">
                            <a
                              href={item.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 font-medium transition"
                            >
                              <span>Buka</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
