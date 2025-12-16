'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Menu,
  History,
  FileDown,
  Calendar,
  Receipt,
  Crown,
  Shield,
  Lock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- Types ---
interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  price: number;
}

interface CartItem extends InventoryItem {
  sellQty: number;
  sellPrice: number;
}

interface SaleRecord {
  id: string;
  date: string;
  totalAmount: number;
  items: { name: string; quantity: number; price: number }[];
}

type PlanType = 'OGA_BOSS' | 'TYCOON';

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';

interface UserProfile {
  id: string;
  planType: PlanType;
  shopName?: string;
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: string | Date;
}

export default function SalesPage() {
  const router = useRouter();

  // --- State: General ---
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // --- State: New Sale ---
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // --- State: History ---
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [historyLoading, setHistoryLoading] = useState(false);

  // ----- Access Control (trial OR active) -----
  const trialEndsAtMs = useMemo(() => {
    if (!user?.trialEndsAt) return 0;
    const ms = new Date(user.trialEndsAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }, [user?.trialEndsAt]);

  const canAddSales = useMemo(() => {
    const status = user?.subscriptionStatus;
    if (!status) return false;
    if (status === 'active') return true;
    if (status === 'trial') return Date.now() < trialEndsAtMs;
    return false;
  }, [user?.subscriptionStatus, trialEndsAtMs]);

  const trialDaysLeft = useMemo(() => {
    if (user?.subscriptionStatus !== 'trial') return null;
    const diff = trialEndsAtMs - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [user?.subscriptionStatus, trialEndsAtMs]);

  const showLockedModal = () => {
    const isTrial = user?.subscriptionStatus === 'trial';
    const expiredTrial = isTrial && Date.now() >= trialEndsAtMs;

    Swal.fire({
      title: 'Sales Locked',
      text: expiredTrial
        ? 'Your free trial has expired. Subscribe to continue recording sales.'
        : 'You need an active subscription (or active trial) to record new sales.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Subscribe Now',
      confirmButtonColor: '#16a34a',
      cancelButtonText: 'Close',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (result.isConfirmed) router.push('/payment');
    });
  };

  // --- Initial Load ---
  useEffect(() => {
    const token = localStorage.getItem('tallyToken');

    const savedUser = localStorage.getItem('tallyUser');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as UserProfile;
        setUser(parsedUser);
      } catch {
        // ignore
      }
    }

    if (!token) {
      router.push('/login');
      return;
    }

    // default date range = current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    setDateRange({ start: firstDay, end: today });

    // fetch inventory + fresh user
    fetchInventory(token);

    axios
      .get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.data.user) {
          setUser(res.data.user);
          localStorage.setItem('tallyUser', JSON.stringify(res.data.user));
        }
      })
      .catch(() => {
        // ignore
      });
  }, [router]);

  // --- Actions ---
  const fetchInventory = async (token: string) => {
    try {
      const res = await axios.get(`${API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInventory(res.data);
    } catch (err) {
      console.error('Failed to load inventory', err);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    const token = localStorage.getItem('tallyToken');
    try {
      const res = await axios.get(`${API_URL}/sales`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { startDate: dateRange.start, endDate: dateRange.end },
      });
      setSalesHistory(res.data);
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const downloadPDF = async () => {
    if (user?.planType !== 'TYCOON') {
      setErrorMsg(`Upgrade to TYCOON to download PDF.`);
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }

    setLoading(true);
    const token = localStorage.getItem('tallyToken');

    try {
      const response = await axios.get(`${API_URL}/sales/report`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { format: 'pdf', startDate: dateRange.start, endDate: dateRange.end },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Sales_Report_${dateRange.start}_${dateRange.end}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSuccessMsg('Report downloaded!');
    } catch (err) {
      console.error('Download failed', err);
      setErrorMsg('Failed to generate PDF. Try again.');
    } finally {
      setLoading(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  // --- Cart Logic ---
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((item) => item.name.toLowerCase().includes(q));
  }, [inventory, searchQuery]);

  const addToCart = (item: InventoryItem) => {
    if (!canAddSales) {
      showLockedModal();
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, sellQty: i.sellQty + 1 } : i));
      }
      return [...prev, { ...item, sellQty: 1, sellPrice: item.price || 0 }];
    });
    setSearchQuery('');
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((item) => item.id !== id));

  const updateCartItem = (id: string, field: 'sellQty' | 'sellPrice', value: number) => {
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const calculateTotal = () => cart.reduce((acc, item) => acc + item.sellQty * item.sellPrice, 0);

  const handleCheckout = async () => {
    if (!canAddSales) {
      showLockedModal();
      return;
    }
    if (cart.length === 0) return;

    setLoading(true);
    const token = localStorage.getItem('tallyToken');

    try {
      for (const item of cart) {
        await axios.post(
          `${API_URL}/sales`,
          {
            itemId: item.id,
            quantity: item.sellQty,
            price: item.sellPrice,
            date: new Date().toISOString(),
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      setSuccessMsg('Sale recorded successfully!');
      setCart([]);
      fetchInventory(token!);
    } catch (err) {
      setErrorMsg('Failed to record sale.');
    } finally {
      setLoading(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  // --- UI helpers ---
  const planBadge = useMemo(() => {
    if (!user) return { text: 'Checking…', icon: <Loader2 className="w-3 h-3 animate-spin" />, cls: 'bg-white/40 text-slate-700 border-white/40' };
    if (user.planType === 'TYCOON')
      return { text: 'TYCOON', icon: <Crown className="w-3 h-3" />, cls: 'bg-amber-500/15 text-amber-200 border-amber-500/20' };
    return { text: 'OGA BOSS', icon: <Shield className="w-3 h-3" />, cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/20' };
  }, [user]);

  const accessBadge = useMemo(() => {
    if (!user?.subscriptionStatus) return null;
    if (canAddSales) {
      if (user.subscriptionStatus === 'trial') {
        return (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border bg-emerald-500/10 text-emerald-200 border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            Trial Active
            {typeof trialDaysLeft === 'number' && (
              <span className="text-emerald-200/80 font-semibold">• {trialDaysLeft}d left</span>
            )}
          </div>
        );
      }
      return (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border bg-emerald-500/10 text-emerald-200 border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Access Enabled
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => router.push('/payment')}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border bg-red-500/10 text-red-200 border-red-500/20 hover:bg-red-500/15 transition"
      >
        <Lock className="w-3.5 h-3.5" />
        Sales Locked
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    );
  }, [user?.subscriptionStatus, canAddSales, trialDaysLeft, router, user]);

  return (
    <div className="flex min-h-screen font-sans text-slate-100 relative overflow-hidden">
      {/* Premium light-dark background (less white, more lively) */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_60%_90%,rgba(245,158,11,0.16),transparent_45%)]" />
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-[90px] animate-pulse" />
      <div className="absolute -bottom-24 -right-24 w-[28rem] h-[28rem] bg-blue-500/10 rounded-full blur-[100px] animate-pulse" />

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/55 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 md:ml-64 p-4 md:p-8 overflow-x-hidden min-h-screen w-full">
        {/* Header */}
        <header className="mb-6">
          <div className="flex justify-between items-start mb-6 gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 -ml-2 text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl md:hidden transition"
              >
                <Menu className="w-6 h-6" />
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-extrabold tracking-tight text-white">Sales</h1>
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-extrabold border ${planBadge.cls}`}>
                    {planBadge.icon}
                    {planBadge.text}
                  </span>
                </div>
                <p className="text-sm text-slate-300 hidden sm:block">Record transactions, view history & reports</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {accessBadge}
              {/* Make History stand out always */}
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="relative overflow-hidden rounded-xl px-4 py-2.5 text-sm font-extrabold border border-white/10 bg-white/5 hover:bg-white/10 transition shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                title="View Sales History"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-emerald-500/25 via-blue-500/20 to-amber-500/20 opacity-70 animate-[gradientShift_6s_ease_infinite]" />
                <span className="relative flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/20">
                    <History className="w-4 h-4 text-emerald-200" />
                  </span>
                  History
                  <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 border border-emerald-500/20 text-emerald-200 animate-pulse">
                    NEW
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="flex p-1 rounded-2xl bg-white/5 border border-white/10 w-full max-w-xl">
              <button
                onClick={() => setActiveTab('new')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'new'
                    ? 'bg-white text-slate-900 shadow-lg'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <ShoppingCart className="w-4 h-4" /> New Sale
                {!canAddSales && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/15 border border-red-500/20 text-red-200">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'history'
                    ? 'bg-white text-slate-900 shadow-lg'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <History className="w-4 h-4" /> Sales History
              </button>
            </div>

            {/* Quick hint card */}
            <div className="w-full sm:w-auto rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-300">Quick Tip</p>
                <p className="text-sm font-semibold text-white">
                  Use History for audits & proof.
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-blue-200" />
              </div>
            </div>
          </div>
        </header>

        {/* Notifications */}
        {(errorMsg || successMsg) && (
          <div
            className={`mb-6 p-4 rounded-2xl flex items-center gap-3 border backdrop-blur-md ${
              errorMsg
                ? 'bg-red-500/10 text-red-100 border-red-500/20'
                : 'bg-emerald-500/10 text-emerald-100 border-emerald-500/20'
            }`}
          >
            {errorMsg ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            <p className="text-sm font-semibold">{errorMsg || successMsg}</p>
          </div>
        )}

        {/* VIEW: NEW SALE */}
        {activeTab === 'new' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Item Selector */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 sticky top-4 z-10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                      <Search className="w-5 h-5 text-emerald-200" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-white">Select Items</p>
                      <p className="text-xs text-slate-300">Search your inventory and tap to add</p>
                    </div>
                  </div>

                  {!canAddSales && (
                    <button
                      onClick={showLockedModal}
                      className="text-xs font-extrabold px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/20 text-red-100 hover:bg-red-500/20 transition"
                    >
                      <Lock className="w-4 h-4 inline-block mr-1" />
                      Unlock Sales
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search inventory..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-950/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 outline-none transition-all text-white placeholder:text-slate-400"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Inventory grid */}
              <div className={`${!canAddSales ? 'opacity-70' : ''}`}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {filteredItems.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition shadow-[0_0_0_1px_rgba(255,255,255,0.05)] text-left"
                    >
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition">
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-[40px]" />
                      </div>

                      <div className="relative p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-200 flex items-center justify-center font-extrabold text-xs">
                            {item.name.substring(0, 2).toUpperCase()}
                          </div>

                          <span
                            className={`text-[10px] font-extrabold px-2 py-1 rounded-full border ${
                              item.stock > 0
                                ? 'bg-white/5 text-slate-200 border-white/10'
                                : 'bg-red-500/10 text-red-100 border-red-500/20'
                            }`}
                          >
                            {item.stock} left
                          </span>
                        </div>

                        <h3 className="font-extrabold text-white truncate">{item.name}</h3>
                        <p className="text-sm text-slate-300 mt-1">
                          ₦{(item.price || 0).toLocaleString()}
                        </p>

                        <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-300">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                            <Plus className="w-3.5 h-3.5" />
                            Add
                          </span>
                          {!canAddSales && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-100">
                              <Lock className="w-3.5 h-3.5" />
                              Locked
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}

                  {filteredItems.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-300 border border-white/10 bg-white/5 rounded-2xl">
                      <Search className="w-8 h-8 mb-2 opacity-80" />
                      <p className="text-sm font-semibold">No items found for “{searchQuery}”</p>
                    </div>
                  )}
                </div>

                {!canAddSales && (
                  <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                        <Lock className="w-5 h-5 text-red-100" />
                      </div>
                      <div>
                        <p className="font-extrabold text-white">Sales Register Locked</p>
                        <p className="text-sm text-red-100/80">
                          Only <b>Trial (active)</b> or <b>Active</b> users can record new sales.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={showLockedModal}
                      className="px-4 py-2.5 rounded-xl font-extrabold text-sm bg-white text-slate-900 hover:bg-slate-100 transition"
                    >
                      Upgrade Now <ArrowRight className="w-4 h-4 inline-block ml-1" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Cart */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md flex flex-col h-[calc(100vh-8rem)] sticky top-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden">
                <div className="p-4 border-b border-white/10 bg-white/5">
                  <h2 className="font-extrabold text-white flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-emerald-200" />
                    Current Order
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">Edit qty/price, then checkout.</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-2 opacity-80">
                      <ShoppingCart className="w-12 h-12" />
                      <p className="text-sm font-semibold">Cart is empty</p>
                      <p className="text-xs text-slate-400">Tap items to add them.</p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2 p-3 rounded-2xl border border-white/10 bg-slate-950/20"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <span className="font-extrabold text-white truncate">{item.name}</span>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="text-red-200 hover:text-red-100 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 p-2 rounded-xl transition"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                            <button
                              onClick={() =>
                                updateCartItem(item.id, 'sellQty', Math.max(1, item.sellQty - 1))
                              }
                              className="px-2.5 py-2 hover:bg-white/10 text-slate-100"
                              disabled={!canAddSales}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <input
                              type="number"
                              className="w-12 text-center text-sm font-extrabold outline-none bg-transparent text-white"
                              value={item.sellQty}
                              onChange={(e) =>
                                updateCartItem(item.id, 'sellQty', parseInt(e.target.value) || 1)
                              }
                              disabled={!canAddSales}
                            />

                            <button
                              onClick={() => updateCartItem(item.id, 'sellQty', item.sellQty + 1)}
                              className="px-2.5 py-2 hover:bg-white/10 text-slate-100"
                              disabled={!canAddSales}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <span className="text-slate-400 text-xs">x</span>

                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                              ₦
                            </span>
                            <input
                              type="number"
                              className="w-full pl-5 pr-2 py-2 text-sm border border-white/10 bg-white/5 rounded-xl focus:ring-2 focus:ring-emerald-500/40 outline-none text-white"
                              value={item.sellPrice}
                              onChange={(e) =>
                                updateCartItem(item.id, 'sellPrice', parseInt(e.target.value) || 0)
                              }
                              disabled={!canAddSales}
                            />
                          </div>
                        </div>

                        <div className="text-right text-xs font-extrabold text-slate-200">
                          = ₦{(item.sellQty * item.sellPrice).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-white/10 bg-white/5">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-slate-300 text-sm font-bold">Total</span>
                    <span className="text-2xl font-extrabold text-white">
                      ₦{calculateTotal().toLocaleString()}
                    </span>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={loading || cart.length === 0 || !canAddSales}
                    className={`w-full py-3 rounded-2xl font-extrabold shadow-lg active:scale-[0.99] transition-all disabled:opacity-50 flex justify-center items-center gap-2 ${
                      canAddSales
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                        : 'bg-white/10 text-slate-300 border border-white/10'
                    }`}
                  >
                    {loading ? (
                      <Loader2 className="animate-spin w-5 h-5" />
                    ) : (
                      <>
                        {canAddSales ? <CheckCircle2 className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                        {canAddSales ? 'Check Out' : 'Checkout Locked'}
                      </>
                    )}
                  </button>

                  {!canAddSales && (
                    <button
                      type="button"
                      onClick={showLockedModal}
                      className="mt-3 w-full py-3 rounded-2xl font-extrabold bg-white text-slate-900 hover:bg-slate-100 transition flex items-center justify-center gap-2"
                    >
                      Unlock Sales <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SALES HISTORY (everyone can view) */}
        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Filters Bar */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
                <div className="flex items-center gap-2 w-full">
                  <div className="relative flex-1 sm:flex-none">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                    <input
                      type="date"
                      className="pl-9 pr-3 py-2.5 bg-slate-950/30 border border-white/10 rounded-xl text-sm w-full sm:w-44 text-white"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                  </div>
                  <span className="text-slate-400 hidden sm:inline">-</span>
                  <div className="relative flex-1 sm:flex-none">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                    <input
                      type="date"
                      className="pl-9 pr-3 py-2.5 bg-slate-950/30 border border-white/10 rounded-xl text-sm w-full sm:w-44 text-white"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                  </div>
                </div>

                <button
                  onClick={fetchHistory}
                  className="px-5 py-2.5 rounded-xl font-extrabold text-sm bg-white text-slate-900 hover:bg-slate-100 transition"
                >
                  Filter
                </button>
              </div>

              <button
                onClick={downloadPDF}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-sm border transition-all ${
                  user?.planType === 'TYCOON'
                    ? 'bg-blue-600/90 text-white hover:bg-blue-600 border-blue-500/30 shadow-lg shadow-blue-600/20'
                    : 'bg-white/5 text-slate-300 border-white/10 cursor-not-allowed'
                }`}
                title={user?.planType !== 'TYCOON' ? 'Upgrade to Tycoon to download' : 'Download PDF Report'}
                disabled={user?.planType !== 'TYCOON' || loading}
              >
                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <FileDown className="w-4 h-4" />}
                {user?.planType === 'TYCOON' ? 'Download PDF' : 'PDF Locked'}
              </button>
            </div>

            {/* Transactions List */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-slate-200 font-extrabold border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Items Sold</th>
                      <th className="px-6 py-4 text-right">Total Amount</th>
                      <th className="px-6 py-4 text-center">Receipt</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/10">
                    {historyLoading ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-300">
                          <Loader2 className="animate-spin w-6 h-6 mx-auto mb-2" />
                          Loading history...
                        </td>
                      </tr>
                    ) : salesHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-300">
                          No sales found for this period.
                        </td>
                      </tr>
                    ) : (
                      salesHistory.map((sale) => (
                        <tr key={sale.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-slate-200">
                            <div className="font-bold">{new Date(sale.date).toLocaleDateString()}</div>
                            <div className="text-xs text-slate-400">
                              {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              {sale.items?.slice(0, 2).map((i, idx) => (
                                <span key={idx} className="text-slate-100 font-semibold capitalize">
                                  {i.quantity}x {i.name}
                                </span>
                              ))}
                              {sale.items?.length > 2 && (
                                <span className="text-xs text-slate-400">+{sale.items.length - 2} more…</span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4 text-right font-extrabold text-white">
                            ₦{sale.totalAmount.toLocaleString()}
                          </td>

                          <td className="px-6 py-4 text-center">
                            <button className="text-slate-300 hover:text-emerald-200 transition-colors">
                              <Receipt className="w-4 h-4 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Global styles for subtle animated gradient */}
        <style jsx global>{`
          @keyframes gradientShift {
            0% { transform: translateX(-20%); }
            50% { transform: translateX(20%); }
            100% { transform: translateX(-20%); }
          }
        `}</style>
      </main>
    </div>
  );
}
