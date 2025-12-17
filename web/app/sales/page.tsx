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
  X,
  ChevronDown,
  ChevronUp,
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
  const [isCartExpanded, setIsCartExpanded] = useState(false);

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

    if (!token) {
      setHistoryLoading(false);
      router.push('/login');
      return;
    }

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

  // --- Initial Load ---
  useEffect(() => {
    const token = localStorage.getItem('tallyToken');

    // quick UI from storage
    const savedUser = localStorage.getItem('tallyUser');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as UserProfile;
        setUser(parsedUser);
      } catch {
        // ignore
      }
    }

    // ✅ Token guard
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

    // Prevent zoom on mobile
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', preventZoom, { passive: false });

    return () => {
      document.removeEventListener('touchstart', preventZoom);
    };
  }, [router]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Add swipe gesture for mobile cart
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let startY = 0;
    let isSwiping = false;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      // Only handle swipe on cart header
      if (target.closest('.mobile-cart-header')) {
        startY = e.touches[0].clientY;
        isSwiping = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwiping) return;

      const currentY = e.touches[0].clientY;
      const diff = startY - currentY;

      // Swipe up to expand cart
      if (diff > 50 && !isCartExpanded) {
        setIsCartExpanded(true);
        isSwiping = false;
      }
      // Swipe down to collapse cart
      else if (diff < -50 && isCartExpanded) {
        setIsCartExpanded(false);
        isSwiping = false;
      }
    };

    const handleTouchEnd = () => {
      isSwiping = false;
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isCartExpanded]);

  const downloadPDF = async () => {
    if (user?.planType !== 'TYCOON') {
      setErrorMsg('Upgrade to TYCOON to download PDF.');
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }

    const token = localStorage.getItem('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    setLoading(true);

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
    if (!canAddSales) return showLockedModal();

    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, sellQty: i.sellQty + 1 } : i));
      }
      return [...prev, { ...item, sellQty: 1, sellPrice: item.price || 0 }];
    });

    setSearchQuery('');
    // Auto-expand cart on mobile when adding items
    if (window.innerWidth < 1024) {
      setIsCartExpanded(true);
    }
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((item) => item.id !== id));

  const updateCartItem = (id: string, field: 'sellQty' | 'sellPrice', value: number) => {
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const calculateTotal = () => cart.reduce((acc, item) => acc + item.sellQty * item.sellPrice, 0);

  const handleCheckout = async () => {
    if (!canAddSales) return showLockedModal();
    if (cart.length === 0) return;

    const token = localStorage.getItem('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    setLoading(true);

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
      setIsCartExpanded(false);
      fetchInventory(token);
    } catch (err) {
      setErrorMsg('Failed to record sale.');
    } finally {
      setLoading(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  // --- UI helpers ---
  const planBadge = useMemo(() => {
    if (!user) {
      return {
        text: 'Checking…',
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        cls: 'bg-slate-50 text-slate-700 border-slate-200',
      };
    }
    if (user.planType === 'TYCOON') {
      return {
        text: 'TYCOON',
        icon: <Crown className="w-3 h-3" />,
        cls: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    }
    return {
      text: 'OGA BOSS',
      icon: <Shield className="w-3 h-3" />,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }, [user]);

  const accessBadge = useMemo(() => {
    if (!user?.subscriptionStatus) return null;

    if (canAddSales) {
      if (user.subscriptionStatus === 'trial') {
        return (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-extrabold border bg-emerald-50 text-emerald-700 border-emerald-200">
            <Sparkles className="w-3.5 h-3.5" />
            Trial Active
            {typeof trialDaysLeft === 'number' && (
              <span className="text-emerald-700/70 font-bold">• {trialDaysLeft}d left</span>
            )}
          </div>
        );
      }

      return (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-extrabold border bg-emerald-50 text-emerald-700 border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Access Enabled
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => router.push('/payment')}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-extrabold border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 transition"
      >
        <Lock className="w-3.5 h-3.5" />
        Sales Locked
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    );
  }, [user?.subscriptionStatus, canAddSales, trialDaysLeft, router]);

  // Mobile Cart Summary Component
  const MobileCartSummary = () => (
    <div className="lg:hidden">
      {/* Cart Summary Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 mobile-cart-header">
        <button
          onClick={() => setIsCartExpanded(!isCartExpanded)}
          className="w-full p-4 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-blue-50 active:bg-emerald-100 transition-colors"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="w-6 h-6 text-emerald-700" />
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-900">Current Order</p>
              <p className="text-sm text-gray-600">
                {cart.length} {cart.length === 1 ? 'item' : 'items'} • ₦{calculateTotal().toLocaleString()}
              </p>
            </div>
          </div>
          {isCartExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronUp className="w-5 h-5 text-gray-600" />
          )}
        </button>

        {/* Expanded Cart Content */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            isCartExpanded ? 'max-h-[70vh]' : 'max-h-0'
          }`}
        >
          <div className="p-4 bg-white border-t">
            {/* Cart Items */}
            <div className="mb-4 max-h-[40vh] overflow-y-auto">
              {cart.length === 0 ? (
                <div className="py-6 flex flex-col items-center justify-center text-gray-400 space-y-2">
                  <ShoppingCart className="w-12 h-12 opacity-50" />
                  <p className="text-sm font-semibold">Cart is empty</p>
                  <p className="text-xs text-gray-400">Tap items to add them.</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate capitalize">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center bg-gray-50 rounded-lg overflow-hidden">
                          <button
                            onClick={() => updateCartItem(item.id, 'sellQty', Math.max(1, item.sellQty - 1))}
                            className="px-2 py-1.5 hover:bg-gray-200 text-gray-700 disabled:opacity-50"
                            disabled={!canAddSales}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-sm font-bold">{item.sellQty}</span>
                          <button
                            onClick={() => updateCartItem(item.id, 'sellQty', item.sellQty + 1)}
                            className="px-2 py-1.5 hover:bg-gray-200 text-gray-700 disabled:opacity-50"
                            disabled={!canAddSales}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-gray-400">×</span>
                        <span className="text-sm text-gray-600">
                          ₦{item.sellPrice.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <p className="font-bold text-gray-900 whitespace-nowrap">
                        ₦{(item.sellQty * item.sellPrice).toLocaleString()}
                      </p>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg active:scale-95 transition-transform"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Checkout Button */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-2xl font-extrabold text-gray-900">
                  ₦{calculateTotal().toLocaleString()}
                </span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={loading || cart.length === 0 || !canAddSales}
                className={`w-full py-4 rounded-xl font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 flex justify-center items-center gap-2 ${
                  canAddSales
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:bg-emerald-800'
                    : 'bg-gray-100 text-gray-400'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {loading ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : (
                  <>
                    {canAddSales ? <CheckCircle2 className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                    {canAddSales ? 'Complete Sale' : 'Checkout Locked'}
                  </>
                )}
              </button>

              {!canAddSales && (
                <button
                  type="button"
                  onClick={showLockedModal}
                  className="mt-3 w-full py-3 rounded-xl font-bold bg-gray-900 text-white hover:bg-black active:bg-gray-800 transition flex items-center justify-center gap-2"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  Unlock Sales <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Spacer to prevent content being hidden behind fixed cart */}
      <div className="h-24"></div>
    </div>
  );

  return (
    <div className="flex min-h-screen font-sans text-gray-900 relative overflow-x-hidden bg-slate-50">
      {/* soft color blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 bg-emerald-200/40 rounded-full blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-28 -right-24 w-[30rem] h-[30rem] bg-blue-200/40 rounded-full blur-[90px]" />
      <div className="pointer-events-none absolute top-1/3 -right-24 w-[28rem] h-[28rem] bg-amber-200/30 rounded-full blur-[90px]" />

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
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
      <main className="relative z-10 flex-1 md:ml-64 p-4 md:p-8 min-h-screen w-full max-w-full">
        {/* Header */}
        <header className="mb-6">
          <div className="flex justify-between items-start mb-6 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 -ml-2 text-gray-700 bg-white shadow-sm border border-gray-100 rounded-xl md:hidden active:scale-95 transition-transform"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Menu className="w-6 h-6" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Sales</h1>
                  <span
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-extrabold border ${planBadge.cls}`}
                  >
                    {planBadge.icon}
                    {planBadge.text}
                  </span>
                  {accessBadge}
                </div>
                <p className="text-sm text-gray-500 hidden sm:block">
                  Record transactions, view history & reports
                </p>
              </div>
            </div>

            {/* History CTA */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                setIsCartExpanded(false);
              }}
              className="shrink-0 relative overflow-hidden rounded-2xl px-4 py-3 text-sm font-extrabold border border-emerald-200 bg-white shadow-md hover:shadow-lg active:scale-95 transition-all"
              title="View Sales History"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="absolute inset-0 bg-gradient-to-r from-emerald-50 via-blue-50 to-amber-50 opacity-80" />
              <span className="relative flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-600 text-white shadow">
                  <History className="w-4 h-4" />
                </span>
                <span className="hidden sm:inline">Sales History</span>
                <span className="sm:hidden">History</span>
                <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  NEW
                </span>
              </span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="flex p-1 rounded-2xl bg-white border border-gray-200 w-full max-w-xl shadow-sm">
              <button
                onClick={() => {
                  setActiveTab('new');
                  setIsCartExpanded(false);
                }}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-2 active:scale-95 ${
                  activeTab === 'new'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ShoppingCart className="w-4 h-4" /> New Sale
                {!canAddSales && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-50 border border-red-200 text-red-700">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-2 active:scale-95 ${
                  activeTab === 'history'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <History className="w-4 h-4" /> Sales History
              </button>
            </div>

            {/* Quick hint card */}
            <div className="w-full sm:w-auto rounded-2xl border border-gray-200 bg-white p-4 flex items-center justify-between gap-4 shadow-sm">
              <div>
                <p className="text-xs font-extrabold text-gray-500">Quick Tip</p>
                <p className="text-sm font-semibold text-gray-900">Use History for audits & proof.</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
        </header>

        {/* Notifications */}
        {(errorMsg || successMsg) && (
          <div
            className={`mb-6 p-4 rounded-2xl flex items-center gap-3 border shadow-sm ${
              errorMsg ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
            }`}
          >
            {errorMsg ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            <p className="text-sm font-semibold">{errorMsg || successMsg}</p>
          </div>
        )}

        {/* VIEW: NEW SALE */}
        {activeTab === 'new' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left - Inventory Section */}
            <div className="lg:col-span-2 space-y-6">
              {/* Search */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                      <Search className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-gray-900">Select Items</p>
                      <p className="text-xs text-gray-500">Search your inventory and tap to add</p>
                    </div>
                  </div>

                  {!canAddSales && (
                    <button
                      onClick={showLockedModal}
                      className="text-xs font-extrabold px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 active:bg-red-200 transition"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <Lock className="w-4 h-4 inline-block mr-1" />
                      Unlock Sales
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search inventory..."
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-gray-900 placeholder:text-gray-400 text-base"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ WebkitAppearance: 'none' }}
                  />
                </div>
              </div>

              {/* Inventory Grid */}
              <div className={`${!canAddSales ? 'opacity-80' : ''}`}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredItems.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="group rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-md active:scale-95 transition-all duration-200 active:bg-emerald-50"
                      style={{
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      disabled={!canAddSales}
                    >
                      <div className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-extrabold text-xs">
                            {item.name.substring(0, 2).toUpperCase()}
                          </div>

                          <span
                            className={`text-[10px] font-extrabold px-2 py-1 rounded-full border ${
                              item.stock > 0
                                ? 'bg-gray-50 text-gray-600 border-gray-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {item.stock} left
                          </span>
                        </div>

                        <h3 className="font-bold text-gray-900 truncate capitalize text-sm">{item.name}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">₦{(item.price || 0).toLocaleString()}</p>

                        <div className="mt-3 flex items-center gap-2 text-xs font-extrabold text-gray-600">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                            <Plus className="w-3 h-3" />
                            Add
                          </span>

                          {!canAddSales && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700">
                              <Lock className="w-3 h-3" />
                              Locked
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}

                  {filteredItems.length === 0 && (
                    <div className="col-span-full py-8 flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-200 bg-white rounded-xl">
                      <Search className="w-8 h-8 mb-2 opacity-60" />
                      <p className="text-sm font-semibold">No items found for "{searchQuery}"</p>
                    </div>
                  )}
                </div>

                {!canAddSales && (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-red-200 flex items-center justify-center">
                        <Lock className="w-5 h-5 text-red-700" />
                      </div>
                      <div>
                        <p className="font-extrabold text-gray-900">Sales Register Locked</p>
                        <p className="text-sm text-red-700/80">
                          Only <b>Trial (active)</b> or <b>Active</b> users can record new sales.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={showLockedModal}
                      className="px-4 py-2.5 rounded-xl font-extrabold text-sm bg-gray-900 text-white hover:bg-black active:bg-gray-800 transition"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      Upgrade Now <ArrowRight className="w-4 h-4 inline-block ml-1" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right - Desktop Cart */}
            <div className="lg:col-span-1">
              {/* Desktop Cart */}
              <div className="hidden lg:block bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden sticky top-4 max-h-[calc(100vh-8rem)]">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <h2 className="font-extrabold text-gray-900 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-emerald-700" />
                    Current Order
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Edit qty/price, then checkout.</p>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                  {cart.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center text-gray-400 space-y-2">
                      <ShoppingCart className="w-12 h-12 opacity-50" />
                      <p className="text-sm font-semibold">Cart is empty</p>
                      <p className="text-xs text-gray-400">Tap items to add them.</p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.id} className="flex flex-col gap-2 p-3 rounded-2xl border border-gray-200 bg-gray-50">
                        <div className="flex justify-between items-start gap-3">
                          <span className="font-extrabold text-gray-900 truncate capitalize">{item.name}</span>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 p-2 rounded-xl transition"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <button
                              onClick={() => updateCartItem(item.id, 'sellQty', Math.max(1, item.sellQty - 1))}
                              className="px-3 py-2 hover:bg-gray-50 text-gray-700"
                              disabled={!canAddSales}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <input
                              type="number"
                              className="w-12 text-center text-sm font-extrabold outline-none bg-transparent text-gray-900"
                              value={item.sellQty}
                              onChange={(e) =>
                                updateCartItem(item.id, 'sellQty', parseInt(e.target.value) || 1)
                              }
                              disabled={!canAddSales}
                            />

                            <button
                              onClick={() => updateCartItem(item.id, 'sellQty', item.sellQty + 1)}
                              className="px-3 py-2 hover:bg-gray-50 text-gray-700"
                              disabled={!canAddSales}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <span className="text-gray-400 text-xs">x</span>

                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₦</span>
                            <input
                              type="number"
                              className="w-full pl-5 pr-2 py-2 text-sm border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900"
                              value={item.sellPrice}
                              onChange={(e) =>
                                updateCartItem(item.id, 'sellPrice', parseInt(e.target.value) || 0)
                              }
                              disabled={!canAddSales}
                            />
                          </div>
                        </div>

                        <div className="text-right text-xs font-extrabold text-gray-700">
                          = ₦{(item.sellQty * item.sellPrice).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-500 text-sm font-bold">Total</span>
                    <span className="text-2xl font-extrabold text-gray-900">
                      ₦{calculateTotal().toLocaleString()}
                    </span>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={loading || cart.length === 0 || !canAddSales}
                    className={`w-full py-3.5 rounded-2xl font-extrabold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 flex justify-center items-center gap-2 ${
                      canAddSales
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                        : 'bg-white text-gray-400 border border-gray-200'
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
                      className="mt-3 w-full py-3 rounded-2xl font-extrabold bg-gray-900 text-white hover:bg-black transition flex items-center justify-center gap-2"
                    >
                      Unlock Sales <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Mobile Cart */}
              <MobileCartSummary />
            </div>
          </div>
        )}

        {/* VIEW: SALES HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-6 pb-24 md:pb-0">
            {/* Filters */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
                <div className="flex items-center gap-2 w-full">
                  <div className="relative flex-1 sm:flex-none">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="date"
                      className="pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm w-full sm:w-44 text-gray-900"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                  </div>
                  <span className="text-gray-400 hidden sm:inline">-</span>
                  <div className="relative flex-1 sm:flex-none">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="date"
                      className="pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm w-full sm:w-44 text-gray-900"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                  </div>
                </div>

                <button
                  onClick={fetchHistory}
                  className="px-5 py-2.5 rounded-xl font-extrabold text-sm bg-gray-900 text-white hover:bg-black active:bg-gray-800 transition"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  Filter
                </button>
              </div>

              <button
                onClick={downloadPDF}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-sm border transition-all active:scale-95 ${
                  user?.planType === 'TYCOON'
                    ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-500 shadow-lg shadow-blue-600/20 active:bg-blue-800'
                    : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
                title={user?.planType !== 'TYCOON' ? 'Upgrade to Tycoon to download' : 'Download PDF Report'}
                disabled={user?.planType !== 'TYCOON' || loading}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <FileDown className="w-4 h-4" />}
                {user?.planType === 'TYCOON' ? 'Download PDF' : 'PDF Locked'}
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-extrabold border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Date</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Items Sold</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Total Amount</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-center">Receipt</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {historyLoading ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          <Loader2 className="animate-spin w-6 h-6 mx-auto mb-2" />
                          Loading history...
                        </td>
                      </tr>
                    ) : salesHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          No sales found for this period.
                        </td>
                      </tr>
                    ) : (
                      salesHistory.map((sale) => (
                        <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-gray-700">
                            <div className="font-bold">{new Date(sale.date).toLocaleDateString()}</div>
                            <div className="text-xs text-gray-400">
                              {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          <td className="px-4 py-3 sm:px-6 sm:py-4">
                            <div className="flex flex-col gap-1">
                              {sale.items?.slice(0, 2).map((i, idx) => (
                                <span key={idx} className="text-gray-900 font-semibold capitalize">
                                  {i.quantity}x {i.name}
                                </span>
                              ))}
                              {sale.items?.length > 2 && (
                                <span className="text-xs text-gray-400">+{sale.items.length - 2} more…</span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 sm:px-6 sm:py-4 text-right font-extrabold text-gray-900">
                            ₦{sale.totalAmount.toLocaleString()}
                          </td>

                          <td className="px-4 py-3 sm:px-6 sm:py-4 text-center">
                            <button className="text-gray-400 hover:text-emerald-700 transition-colors active:scale-95">
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

        {/* Floating Action Button for Mobile */}
        {activeTab === 'new' && cart.length > 0 && (
          <div className="lg:hidden fixed bottom-24 right-4 z-40">
            <button
              onClick={() => setIsCartExpanded(!isCartExpanded)}
              className="w-14 h-14 rounded-full bg-emerald-600 text-white shadow-lg flex items-center justify-center hover:bg-emerald-700 active:scale-95 transition-all active:bg-emerald-800"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {isCartExpanded ? (
                <ChevronDown className="w-6 h-6" />
              ) : (
                <div className="relative">
                  <ShoppingCart className="w-6 h-6" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {cart.length}
                  </span>
                </div>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}