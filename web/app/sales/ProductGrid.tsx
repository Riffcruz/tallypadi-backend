'use client';

import React, { useCallback, useMemo, useEffect, useState } from 'react';
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
import { CartItem, InventoryItem, UserProfile } from './page';
import { getCookie } from '../../utils/cookies';
import dynamic from 'next/dynamic'; // Dynamic import for BarcodeScanner
import {
  cacheInventoryItems,
  listOfflineSales,
  OFFLINE_SALES_CHANGE_EVENT,
  readCachedInventory,
} from '../../lib/offlineSales';

// Dynamically import BarcodeScanner to avoid SSR issues with camera
const BarcodeScanner = dynamic(() => import('../../components/BarcodeScanner'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface ProductGridProps {
  user: UserProfile | null;
  onAddToCart: (item: InventoryItem) => void;
  currencyCode: string;
  cart: CartItem[];
}

interface RawInventoryItem {
  _id?: string;
  id?: string;
  name?: string;
  quantity?: number;
  stock?: number;
  lastUnitPrice?: number;
  price?: number;
  costPrice?: number;
  barcode?: string;
  sku?: string | null;
}

const barcodeKey = (value?: string | null) => String(value || '').trim().toLowerCase();

const toInventoryItem = (item: RawInventoryItem): InventoryItem => ({
  id: String(item._id || item.id || ''),
  name: String(item.name || ''),
  stock: Number(item.quantity ?? item.stock ?? 0),
  price: Number(item.lastUnitPrice ?? item.price ?? 0),
  costPrice: Number(item.costPrice ?? 0),
  barcode: item.barcode,
  sku: item.sku || null,
});

export default function ProductGrid({ user, onAddToCart, currencyCode, cart }: ProductGridProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [resolvingScan, setResolvingScan] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [queuedQuantities, setQueuedQuantities] = useState<Record<string, number>>({});
  const observerTarget = React.useRef<HTMLDivElement>(null);
  const scanInFlightRef = React.useRef(false);
  const lastScanRef = React.useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const userId = String(user?.id || user?._id || '');

  const availableInventory = useMemo(() => inventory.map((item) => ({
    ...item,
    stock: Math.max(0, item.stock - (queuedQuantities[item.id] || 0)),
  })), [inventory, queuedQuantities]);
  const cartQuantities = useMemo(() => cart.reduce<Record<string, number>>((quantities, item) => {
    quantities[item.id] = (quantities[item.id] || 0) + Math.max(0, Number(item.sellQty) || 0);
    return quantities;
  }, {}), [cart]);

  const fetchInventory = useCallback(async (pageNum: number, searchQuery: string, isLoadMore = false) => {
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
        params: { page: pageNum, limit: 20, search: searchQuery },
        timeout: 8_000,
      });

      // Handle the new paginated API format or fallback to array
      const rawData: RawInventoryItem[] = res.data?.data ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      const paginationInfo = res.data?.pagination || { hasMore: false };

      const clean: InventoryItem[] = rawData.map(toInventoryItem);

      if (userId) {
        void cacheInventoryItems(
          userId,
          clean.map((item: InventoryItem) => ({
            id: item.id,
            name: item.name,
            stock: item.stock,
            price: item.price,
            barcode: item.barcode,
            sku: item.sku,
          })),
          false
        ).catch(() => undefined);
      }

      if (isLoadMore) {
        setInventory(prev => {
          const newItems = clean.filter((candidate) => !prev.some((item) => item.id === candidate.id));
          return [...prev, ...newItems];
        });
      } else {
        setInventory(clean);
      }

      setHasMore(paginationInfo.hasMore || false);
    } catch (err) {
      console.error('Inventory Error:', err);
      if (userId) {
        try {
          const cached = await readCachedInventory(userId);
          const query = searchQuery.trim().toLowerCase();
          const filtered = query
            ? cached.filter((item) =>
                item.name.toLowerCase().includes(query)
                || String(item.barcode || '').toLowerCase().includes(query)
                || String(item.sku || '').toLowerCase().includes(query)
              )
            : cached;
          if (filtered.length > 0 || !isLoadMore) setInventory(filtered);
          setHasMore(false);
        } catch {
          // Keep the already-loaded product list visible if local storage fails.
        }
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !navigator.onLine) return;

    let cancelled = false;
    const syncTimer = window.setTimeout(() => {
      void (async () => {
        const token = getCookie('tallyToken');
        if (!token) return;

        try {
          const catalog: InventoryItem[] = [];
          let pageNumber = 1;
          let hasAnotherPage = true;

          // Cache up to 2,000 products so barcode sales remain available offline.
          while (!cancelled && hasAnotherPage && pageNumber <= 20) {
            const response = await axios.get(`${API_URL}/inventory`, {
              headers: { Authorization: `Bearer ${token}` },
              params: { page: pageNumber, limit: 100 },
              timeout: 10_000,
            });
            const rawData: RawInventoryItem[] = response.data?.data
              ? response.data.data
              : (Array.isArray(response.data) ? response.data : []);
            catalog.push(...rawData.map(toInventoryItem));
            hasAnotherPage = Boolean(response.data?.pagination?.hasMore);
            pageNumber += 1;
          }

          if (!cancelled) {
            await cacheInventoryItems(
              userId,
              catalog.map((item) => ({
                id: item.id,
                name: item.name,
                stock: item.stock,
                price: item.price,
                barcode: item.barcode,
                sku: item.sku,
              })),
              true
            );
          }
        } catch (error) {
          console.warn('Could not refresh the offline barcode catalogue:', error);
        }
      })();
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(syncTimer);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const refreshReservations = async () => {
      try {
        const records = await listOfflineSales(userId);
        const quantities: Record<string, number> = {};
        for (const record of records) {
          for (const item of record.payload.items) {
            quantities[item.itemId] = (quantities[item.itemId] || 0) + item.quantity;
          }
        }
        setQueuedQuantities(quantities);
      } catch {
        // The server still validates stock if this browser cannot read its cache.
      }
    };
    const initial = window.setTimeout(() => void refreshReservations(), 0);
    let inventoryRefresh: number | undefined;
    const onChange = () => {
      void refreshReservations();
      if (navigator.onLine) {
        window.clearTimeout(inventoryRefresh);
        inventoryRefresh = window.setTimeout(() => void fetchInventory(1, '', false), 300);
      }
    };
    window.addEventListener(OFFLINE_SALES_CHANGE_EVENT, onChange);
    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(inventoryRefresh);
      window.removeEventListener(OFFLINE_SALES_CHANGE_EVENT, onChange);
    };
  }, [fetchInventory, userId]);

  useEffect(() => {
    // Reset page and fetch when search changes (with basic debounce)
    const timeoutId = setTimeout(() => {
      setPage(1);
      fetchInventory(1, search, false);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [fetchInventory, search]);

  useEffect(() => {
    // Fetch more when page increments
    if (page <= 1) return;
    const timeout = window.setTimeout(() => void fetchInventory(page, search, true), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchInventory, page, search]);

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

  const handleScan = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    const normalizedCode = barcodeKey(code);
    if (!normalizedCode || scanInFlightRef.current) return;

    const now = Date.now();
    if (lastScanRef.current.code === normalizedCode && now - lastScanRef.current.at < 650) return;
    lastScanRef.current = { code: normalizedCode, at: now };
    scanInFlightRef.current = true;
    setShowScanner(false);
    setResolvingScan(true);
    setScanNotice(null);

    try {
      let exactMatch = inventory.find((item) => barcodeKey(item.barcode) === normalizedCode);
      let serverLookupFailed = false;

      if (!exactMatch && navigator.onLine) {
        const token = getCookie('tallyToken');
        if (token) {
          try {
            const response = await axios.get(`${API_URL}/inventory/lookup/barcode`, {
              headers: { Authorization: `Bearer ${token}` },
              params: { code },
              timeout: 5_000,
            });
            exactMatch = toInventoryItem(response.data || {});

            if (userId && exactMatch.id) {
              void cacheInventoryItems(userId, [exactMatch], false).catch(() => undefined);
            }
          } catch (error) {
            if (!axios.isAxiosError(error) || error.response?.status !== 404) {
              serverLookupFailed = true;
            }
          }
        }
      }

      if (!exactMatch && userId && (!navigator.onLine || serverLookupFailed)) {
        const cached = await readCachedInventory(userId);
        const cachedMatch = cached.find((item) => barcodeKey(item.barcode) === normalizedCode);
        if (cachedMatch) exactMatch = { ...cachedMatch, costPrice: 0 };
      }

      if (exactMatch) {
        const sellableItem = {
          ...exactMatch,
          stock: Math.max(0, exactMatch.stock - (queuedQuantities[exactMatch.id] || 0)),
        };
        onAddToCart(sellableItem);
        setSearch('');
        return;
      }

      setSearch(code);
      setScanNotice(
        serverLookupFailed
          ? `The server could not be reached. Barcode ${code} was not found in this device's offline cache.`
          : navigator.onLine
          ? `No product has the exact barcode ${code}.`
          : `Barcode ${code} is not available in this device's offline product cache.`
      );
    } catch (error) {
      console.error('Barcode lookup failed:', error);
      setSearch(code);
      setScanNotice('The barcode lookup could not reach the server. Search results are shown instead.');
    } finally {
      scanInFlightRef.current = false;
      setResolvingScan(false);
    }
  }, [inventory, onAddToCart, queuedQuantities, userId]);

  useEffect(() => {
    // USB Scanner Detection
    let buffer = '';
    let lastKeyTime = 0;
    let scanStartedAt = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

        const currentTime = Date.now();
        if (!lastKeyTime || currentTime - lastKeyTime > 80) {
            buffer = '';
            scanStartedAt = currentTime;
        }

        if (e.key === 'Enter') {
            const averageKeyInterval = buffer.length > 1
              ? (currentTime - scanStartedAt) / (buffer.length - 1)
              : Number.POSITIVE_INFINITY;
            const looksLikeHardwareScan = buffer.length >= 4 && averageKeyInterval <= 80;

            if (looksLikeHardwareScan) {
                e.preventDefault();
                void handleScan(buffer);
                if (isInput) target.blur();
            }
            buffer = '';
            lastKeyTime = 0;
            scanStartedAt = 0;
        } else if (e.key.length === 1) {
            buffer += e.key;
            lastKeyTime = currentTime;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleScan]);

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
                  {loading ? '...' : availableInventory.length}
                </span>
              </div>
            </div>

            {search.trim() && (
              <button
                onClick={() => setSearch('')}
                className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
                <span>Clear search</span>
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setScanNotice(null);
                }}
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
              onClick={() => {
                setScanNotice(null);
                setShowScanner(true);
              }}
              disabled={resolvingScan}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-600 px-4 font-black text-white shadow-sm transition-colors hover:border-emerald-700 hover:bg-emerald-700"
              title="Scan Barcode"
              aria-label="Scan a product barcode"
            >
              {resolvingScan ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanBarcode className="h-5 w-5" />}
              <span className="hidden sm:inline">{resolvingScan ? 'Finding…' : 'Scan'}</span>
            </button>
          </div>

          {scanNotice && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{scanNotice}</span>
            </div>
          )}
        </div>
      </div>

      {/* Barcode Scanner Overlay */}
      {showScanner && (
        <BarcodeScanner
          onScan={(code) => { void handleScan(code); }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* --- Content --- */}
      <div className="flex-1 pt-5">
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
        ) : availableInventory.length === 0 ? (
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pb-24">
            {availableInventory.map((item) => {
              const remainingStock = Math.max(0, item.stock - (cartQuantities[item.id] || 0));
              const tone = stockTone(remainingStock);

              const badge =
                tone === 'OUT' ? (
                  <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-red-900 text-white">
                    Out of stock
                  </span>
                ) : tone === 'LOW' ? (
                  <span className="flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">
                    <AlertTriangle className="w-3 h-3" /> {remainingStock} left
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    {remainingStock} available
                  </span>
                );

              return (
                <button
                  key={item.id}
                  onClick={() => onAddToCart(item)}
                  disabled={remainingStock <= 0}
                  className={`
                    group relative flex flex-col text-left p-4 rounded-2xl border-2 overflow-hidden
                    transition-all duration-200 active:scale-[0.98]
                    ${remainingStock <= 0
                      ? 'bg-white border-slate-200 opacity-70 cursor-not-allowed'
                      : 'bg-white border-slate-200 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20'}
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
                            ${remainingStock <= 0
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
                    
                    {item.sku && (
                      <p className="text-[10px] font-black font-mono tracking-widest text-emerald-600 uppercase mb-2">
                        {item.sku}
                      </p>
                    )}

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

                      <span
                        className={`
                          inline-flex items-center gap-2 px-3 py-2 rounded-xl
                          font-bold text-xs transition-all
                          ${remainingStock <= 0
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20 group-hover:bg-emerald-700'}
                        `}
                      >
                        <Plus className="w-4 h-4" />
                        {remainingStock <= 0 ? 'In cart' : 'Add'}
                      </span>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] font-bold text-slate-500">
                      {remainingStock <= 0
                        ? (item.stock > 0 ? 'All available units are already in this order' : 'Restock this item before selling')
                        : 'Tap this card to add it to the order'}
                    </div>
                  </div>
                </button>
              );
            })}
            
            {/* Infinite Scroll Sentinel */}
            {hasMore && (
              <div 
                ref={observerTarget} 
                className="col-span-2 lg:col-span-3 py-8 flex flex-col items-center justify-center gap-3"
              >
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading fast...</span>
              </div>
            )}
            
            {!hasMore && availableInventory.length > 0 && (
              <div className="col-span-2 lg:col-span-3 py-8 flex items-center justify-center">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">End of catalog</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
