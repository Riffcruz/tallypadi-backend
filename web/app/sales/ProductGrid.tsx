'use client';

import React, { useMemo, useEffect, useState } from 'react';
import axios from 'axios';
import {
  Search,
  Plus,
  Loader2,
  PackageOpen,
  AlertTriangle,
  X,
  Sparkles,
  ScanBarcode, // Import ScanBarcode icon
} from 'lucide-react';
import { InventoryItem, UserProfile } from './page';
import { getCookie } from '../../utils/cookies';
import dynamic from 'next/dynamic'; // Dynamic import for BarcodeScanner

// Dynamically import BarcodeScanner to avoid SSR issues with camera
const BarcodeScanner = dynamic(() => import('../../components/BarcodeScanner'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface ProductGridProps {
  user: UserProfile | null;
  onAddToCart: (item: InventoryItem) => void;
  currencyCode: string;
}

export default function ProductGrid({ user, onAddToCart, currencyCode }: ProductGridProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const observerTarget = React.useRef<HTMLDivElement>(null);

  const fetchInventory = async (pageNum: number, searchQuery: string, isLoadMore = false) => {
    const token = getCookie('tallyToken');
    if (!token) {
      setLoading(false);
      return;
    }

    if (!isLoadMore) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await axios.get(`${API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page: pageNum, limit: 20, search: searchQuery }
      });

      // Handle the new paginated API format or fallback to array
      const rawData = res.data?.data ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      const paginationInfo = res.data?.pagination || { hasMore: false };

      const clean = rawData.map((item: any) => ({
        id: item._id || item.id,
        name: item.name,
        stock: Number(item.quantity ?? item.stock ?? 0),
        price: Number(item.lastUnitPrice ?? item.price ?? 0),
        costPrice: Number(item.costPrice ?? 0),
        barcode: item.barcode,
      }));

      if (isLoadMore) {
        setInventory(prev => [...prev, ...clean]);
      } else {
        setInventory(clean);
      }

      setHasMore(paginationInfo.hasMore || false);
    } catch (err) {
      console.error('Inventory Error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    // Reset page and fetch when search changes (with basic debounce)
    const timeoutId = setTimeout(() => {
      setPage(1);
      fetchInventory(1, search, false);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    // Fetch more when page increments
    if (page > 1) {
      fetchInventory(page, search, true);
    }
  }, [page]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage(p => p + 1);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  useEffect(() => {
    // USB Scanner Detection
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if user is typing in an input field
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        const currentTime = Date.now();
        // If time between keys is too long (> 50ms), it's likely manual typing, so reset.
        if (currentTime - lastKeyTime > 100) {
            buffer = '';
        }
        lastKeyTime = currentTime;

        if (e.key === 'Enter') {
            if (buffer.length > 2) {
                e.preventDefault();
                handleScan(buffer);
                buffer = '';
            }
        } else if (e.key.length === 1) {
            buffer += e.key;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inventory]); // Re-bind when inventory changes so handleScan has latest data

  const handleScan = (code: string) => {
    setShowScanner(false);
    
    // 1. Try to find exact match by barcode in current list
    const exactMatch = inventory.find(i => i.barcode === code);
    
    if (exactMatch) {
      onAddToCart(exactMatch);
      setSearch('');
    } else {
      // 2. If no exact match (or it's on a further page), set search to let backend find it
      setSearch(code);
    }
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  };

  const stockTone = (stock: number) => {
    if (stock <= 0) return 'OUT';
    if (stock < 5) return 'LOW';
    return 'OK';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-emerald-500/10 to-transparent" />

      {/* --- Sticky Search / Filter Bar --- */}
      <div className="sticky top-0 z-20 bg-slate-50/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="px-0 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 border border-slate-200 shadow-sm">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-700">
                  Products
                </span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                  {loading ? '...' : inventory.length}
                </span>
              </div>
            </div>

            {search.trim() && (
              <button
                onClick={() => setSearch('')}
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
              >
                <span>Clear</span>
                <span className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                  <X className="w-4 h-4" />
                </span>
              </button>
            )}
          </div>

          <div className="relative group flex items-center gap-2">
            <div className="flex-1 relative">
              {/* Icon */}
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
              </div>

              {/* Input */}
              <input
                type="text"
                placeholder="Search items by name or scan barcode…"
                className="
                  block w-full pl-11 pr-12 py-3.5
                  bg-white/90 border border-slate-200
                  rounded-2xl text-sm font-medium text-slate-900 placeholder-slate-400
                  shadow-sm shadow-slate-900/5
                  focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500
                  outline-none transition-all
                "
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {/* Right “kbd” hint */}
              <div className="absolute inset-y-0 right-3 flex items-center">
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  ⌘ K
                </span>
              </div>
            </div>

            {/* Barcode Scanner Button */}
            <button
              onClick={() => setShowScanner(true)}
              className="p-3.5 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:text-emerald-600 hover:border-emerald-300 transition-colors shadow-sm"
              title="Scan Barcode"
            >
              <ScanBarcode className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Barcode Scanner Overlay */}
      {showScanner && (
        <BarcodeScanner
          onScan={(code) => {
            const item = inventory.find((i) => i.barcode === code);
            if (item) {
              onAddToCart(item);
              setShowScanner(false);
              setSearch(''); // Clear search if match found
            } else {
               setSearch(code); // Set search if no match found
               setShowScanner(false);
            }
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* --- Content --- */}
      <div className="flex-1 pt-5">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className="relative bg-white p-4 rounded-3xl border border-slate-200/70 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-transparent" />
                <div className="relative z-10 animate-pulse">
                  <div className="flex justify-between items-start">
                    <div className="w-11 h-11 bg-slate-100 rounded-2xl" />
                    <div className="w-20 h-5 bg-slate-100 rounded-full" />
                  </div>
                  <div className="mt-5 space-y-2">
                    <div className="w-4/5 h-4 bg-slate-100 rounded" />
                    <div className="w-2/5 h-3 bg-slate-100 rounded" />
                  </div>
                  <div className="mt-5 w-24 h-8 bg-slate-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : inventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
              <PackageOpen className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-slate-900 font-extrabold">No items found</h3>
            <p className="text-slate-500 text-sm mt-1">
              Try a different search keyword.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-24">
            {inventory.map((item, index) => {
              const tone = stockTone(item.stock);

              const badge =
                tone === 'OUT' ? (
                  <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-red-900 text-white">
                    Out of stock
                  </span>
                ) : tone === 'LOW' ? (
                  <span className="flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">
                    <AlertTriangle className="w-3 h-3" /> {item.stock} left
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    {item.stock} in stock
                  </span>
                );

              return (
                <button
                  key={item.id}
                  onClick={() => onAddToCart(item)}
                  disabled={item.stock <= 0}
                  className={`
                    group relative flex flex-col text-left p-4 rounded-3xl border overflow-hidden
                    transition-all duration-200 active:scale-[0.98]
                    ${item.stock <= 0
                      ? 'bg-white border-slate-200 opacity-70 cursor-not-allowed'
                      : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-500/10'}
                  `}
                >
                  {/* animated glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/70 via-white to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-emerald-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-3">
                      {/* avatar */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`
                            w-12 h-12 rounded-2xl border flex items-center justify-center
                            font-extrabold text-sm uppercase
                            ${item.stock <= 0
                              ? 'bg-slate-50 border-slate-200 text-slate-400'
                              : 'bg-emerald-50 border-emerald-100 text-emerald-700'}
                          `}
                        >
                          {String(item.name || '').substring(0, 2)}
                        </div>
                      </div>

                      {badge}
                    </div>

                    <h3 className="font-extrabold text-slate-900 capitalize truncate w-full mb-1 group-hover:text-emerald-700 transition-colors">
                      {item.name}
                    </h3>

                    <p className="text-xs font-semibold text-slate-500">
                      Price
                    </p>

                    <div className="flex items-end justify-between mt-1">
                      <div>
                        <p className="text-base font-extrabold text-slate-900">
                          {formatPrice(item.price)}
                        </p>
                        {user?.role === 'OWNER' && (item.costPrice || 0) > 0 && (
                          <p className="text-[10px] font-bold text-slate-400">Cost: {formatPrice(item.costPrice!)}</p>
                        )}
                      </div>

                      <div
                        className={`
                          inline-flex items-center gap-2 px-3 py-2 rounded-2xl
                          font-bold text-xs transition-all
                          ${item.stock <= 0
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'}
                        `}
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </div>
                    </div>

                    {/* subtle divider */}
                    <div className="mt-4 h-px bg-gradient-to-r from-slate-200 to-transparent" />

                    {/* micro info */}
                    <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>ID</span>
                      <span className="font-mono text-slate-600 truncate max-w-[120px]">
                        {String(item.id).slice(-8)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            
            {/* Infinite Scroll Sentinel */}
            {hasMore && (
              <div 
                ref={observerTarget} 
                className="col-span-2 sm:col-span-3 py-8 flex flex-col items-center justify-center gap-3"
              >
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading fast...</span>
              </div>
            )}
            
            {!hasMore && inventory.length > 0 && (
              <div className="col-span-2 sm:col-span-3 py-8 flex items-center justify-center">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">End of catalog</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
