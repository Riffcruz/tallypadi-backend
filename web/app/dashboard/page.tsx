'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import PushNotificationPrompt from '../../components/PushNotificationPrompt';
import Preloader from '../../components/Preloader';
import {
  Wallet,
  Coins,
  ShoppingBag,
  Menu,
  Bell,
  ArrowUpRight,
  Calendar,
  TrendingUp,
  ArrowRight,
  Clock,
  Layout,
  MessageSquare,
  Send,
  X,
  Sparkles,
  Clipboard,
  CreditCard,
  Package,
  Banknote,
  Eye,
  Copy,
  ExternalLink,
  TrendingDown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- TYPES ---
interface InventoryItem {
  name: string;
  quantity?: number;
  stock?: number;
  price?: number;
  lastUnitPrice?: number;
}

interface TransactionRow {
  id: number | string;
  type: 'SALE' | 'RESTOCK' | 'DEBT_PAYMENT';
  item: string;
  qty: number;
  amount: number;
  date: string;
}

interface ChartDataPoint {
  day: string;
  sales: number;
}

interface DashboardResponse {
  user?: {
    name?: string;
    shopName?: string;
    shopSlug?: string;
    initials?: string;
    currencyCode?: string; // e.g. NGN, USD, GHS
    locale?: string; // e.g. en-NG
    countryCode?: string; // optional
  };
  stats?: {
    revenue?: number; // in user's currency
    grossProfit?: number; // ✅ added
    netProfit?: number; // ✅ added
    totalExpenses?: number; 
    itemsSold?: number;
    totalOrders?: number; // ✅ added
    debtorsCount?: number;
    debtorsAmount?: number;
    pendingOrders?: number;
    paymentMethods?: Record<string, number>; // ✅ added mapping mapping like { "CASH": 5000, "TRANSFER": 12000 }
    visits?: {
      today: number;
      week: number;
      month: number;
      year: number;
    };
  };
  inventory?: InventoryItem[];
  transactions?: TransactionRow[];
  salesChart?: ChartDataPoint[];
}

// ✅ FX rates endpoint response (you’ll add it below)
interface FxRatesResponse {
  base: string; // e.g. "USD"
  rates: Record<string, number>; // {"NGN": 1650, "GHS": 14.9, ...}
  updatedAt?: string;
}

// --- CURRENCY FORMATTER ---
const formatCurrency = (amount: number, currencyCode = 'NGN', locale = 'en-NG') => {
  const safe = Number(amount) || 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(safe);
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const isUnknownItemTx = (t: any) => {
  // if your backend sends item string (like TransactionRow.item)
  const item = String(t?.item ?? '').trim().toLowerCase();

  // hide empty / unknown / null-like placeholders
  return (
    !item ||
    item === 'unknown_item' ||
    item === 'unknown' ||
    item === 'item' ||
    item === 'null' ||
    item === 'undefined'
  );
};

// --- STAT CARD (modern) ---
function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  accent = 'emerald',
}: {
  title: string;
  value: string;
  sub?: string;
  icon: any;
  accent?: 'emerald' | 'blue' | 'orange' | 'purple' | 'red';
}) {
  const accentMap: Record<string, string> = {
    emerald: 'from-emerald-500/10 to-emerald-500/0 text-emerald-700 border-emerald-100',
    blue: 'from-blue-500/10 to-blue-500/0 text-blue-700 border-blue-100',
    orange: 'from-orange-500/10 to-orange-500/0 text-orange-700 border-orange-100',
    purple: 'from-purple-500/10 to-purple-500/0 text-purple-700 border-purple-100',
    red: 'from-red-500/10 to-red-500/0 text-red-700 border-red-100',
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border bg-white shadow-sm hover:shadow-md transition-all">
      <div className={`absolute inset-0 bg-gradient-to-br ${accentMap[accent]} pointer-events-none`} />
      <div className="relative p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{title}</p>
            <div className="mt-2 text-3xl font-black tracking-tight text-slate-900 break-words">{value}</div>
            {sub ? <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p> : null}
          </div>
          <div className="h-11 w-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Icon className="w-5 h-5 text-slate-700" />
          </div>
        </div>
      </div>
    </div>
  );
}



export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [fx, setFx] = useState<FxRatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [visitDuration, setVisitDuration] = useState<'today' | 'week' | 'month' | 'year'>('today');
  const [copied, setCopied] = useState(false); // New state for copy feedback

  // Chat dock
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (data?.user) {
      const u = data.user as any;
      const status = u.subscriptionStatus;
      const trialEnds = u.trialEndsAt ? new Date(u.trialEndsAt) : null;
      const now = new Date();

      let isExpired = false;
      if (status === 'past_due' || status === 'cancelled' || status === 'suspended') {
        isExpired = true;
      } else if (status === 'trial' && trialEnds && now > trialEnds) {
        isExpired = true;
      }

      if (isExpired) {
        setShowExpiredModal(true);
      }
    }
  }, [data]);

  useEffect(() => {
    const token = getCookie('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchAll = async () => {
      try {
        setLoading(true);
        const [dashRes, fxRes] = await Promise.all([
          axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/fx`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        ]);

        setData(dashRes.data as DashboardResponse);
        if (fxRes?.data) setFx(fxRes.data as FxRatesResponse);

        // ✅ Staff Permission Check
        const u = dashRes.data.user as any;
        if (u?.role === 'STAFF') {
           const canView = u?.settings?.staffPermissions?.canViewDashboard === true;
           // Default: staff -> sales if no specific permission (or even if canView is false)
           if (!canView) {
             router.replace('/sales');
             return;
           }
        }
      } catch (err) {
        console.error('Dashboard Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [router]);

  const currencyCode = data?.user?.currencyCode || 'NGN';
  const userLocale = data?.user?.locale || 'en-NG';
  const inventory = data?.inventory || [];

  const shopUrl = useMemo(() => {
    const slug = data?.user?.shopSlug;
    if (slug) {
      return `https://tallypadi.com/shop/${slug}`;
    }
    return '';
  }, [data?.user?.shopSlug]);

  const handleCopyShopLink = async () => {
    if (shopUrl) {
      try {
        await navigator.clipboard.writeText(shopUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // Reset "Copied!" after 2 seconds
      } catch (err) {
        console.error('Failed to copy shop link: ', err);
      }
    }
  };

  const stockValue = useMemo(() => {
    return inventory.reduce((acc, curr) => {
      const qty = Number(curr.quantity ?? curr.stock ?? 0);
      const price = Number(curr.price ?? curr.lastUnitPrice ?? 0);
      return acc + qty * price;
    }, 0);
  }, [inventory]);

  // ✅ Multi-currency safe “Converted” value
  // If user is NGN: it will just display NGN.
  // If admin/base currency is USD: show “Revenue (USD converted)” using FX.
  const baseCurrency = fx?.base || 'USD';
  const revenue = Number(data?.stats?.revenue || 0);

  const revenueConverted = useMemo(() => {
    // If no fx, return null (we’ll hide it).
    if (!fx?.rates) return null;

    // fx.rates is "1 base = X currency"
    // To convert revenue in userCurrency -> base:
    // revenueBase = revenue / rate(userCurrency)
    const rate = Number(fx.rates[currencyCode]);
    if (!Number.isFinite(rate) || rate <= 0) return null;

    return revenue / rate;
  }, [fx, revenue, currencyCode]);

  const formattedRevenue = formatCurrency(revenue, currencyCode, userLocale);

  const formattedRevenueConverted = revenueConverted == null
    ? null
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: baseCurrency,
        maximumFractionDigits: 0,
      }).format(revenueConverted);

  const headerDate = useMemo(() => {
    return new Date().toLocaleDateString(userLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  }, [userLocale]);

const filteredTransactions = useMemo(() => {
  const txs = data?.transactions || [];

  // ✅ hide undone + hide unknown-item sales/rows
  return txs.filter((t: any) => !t?.isUndone && !isUnknownItemTx(t));
}, [data?.transactions]);

const topTransactions = filteredTransactions.slice(0, 6);

  const chartData = data?.salesChart || [];

  const sendChat = async (text: string) => {
    const token = getCookie('tallyToken');
    if (!token) return;

    try {
      setChatSending(true);

      // ✅ You need a backend route for this (shown below)
      await axios.post(
        `${API_URL}/chat/send`,
        { message: text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      console.error('Chat send failed', e);
    } finally {
      setChatSending(false);
    }
  };

  if (loading || !data) {
    return <Preloader />;
  }

  const visitCount = data?.stats?.visits?.[visitDuration] || 0;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 relative overflow-x-hidden">
      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      {/* Main */}
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 w-full max-w-full min-h-screen overflow-x-hidden">
        {/* Header */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2.5 bg-white border border-slate-200 rounded-2xl lg:hidden text-slate-600 shadow-sm active:scale-95 transition"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="min-w-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                {getGreeting()},{' '}
                <span className="text-emerald-700">
                  <span className="inline-flex items-center gap-2"> {/* New wrapper for shop name and button */}
                    {data?.user?.shopName || 'Owner'}
                  </span>
                </span>
              </h1>
              <div className="mt-4">
                {shopUrl && (
                  <div className="inline-flex flex-col sm:flex-row items-start sm:items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm gap-2">
                     <div className="flex items-center bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm text-slate-500 font-medium min-w-[200px]">
                        tallypadi.com/shop/<span className="text-slate-900 font-bold ml-0.5">{data?.user?.shopSlug}</span>
                     </div>
                     
                     <div className="flex items-center gap-1 w-full sm:w-auto">
                       <button
                         onClick={handleCopyShopLink}
                         className="flex-1 sm:flex-none px-3 py-2 bg-white hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-lg text-slate-600 transition-all flex items-center justify-center gap-2 text-xs font-bold"
                       >
                         {copied ? <Clipboard className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                         <span className={copied ? "text-emerald-600" : ""}>{copied ? 'Copied!' : 'Copy Link'}</span>
                       </button>

                       <div className="hidden sm:block w-px h-5 bg-slate-200 mx-1"></div>

                       <a
                         href={shopUrl}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="flex-1 sm:flex-none px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-lg text-emerald-700 transition-all flex items-center justify-center gap-2 text-xs font-bold"
                       >
                         <ExternalLink className="w-3.5 h-3.5" />
                         <span>Go to Shop</span>
                       </a>
                     </div>
                  </div>
                )}
              </div>
              <p className="text-slate-500 text-sm mt-4 flex items-center gap-2 font-semibold">
                <Calendar className="w-4 h-4 text-emerald-600" />
                {headerDate}
                <span className="ml-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
                  {currencyCode}
                </span>
              </p>

              {formattedRevenueConverted && (
                <p className="mt-2 text-xs text-slate-500 font-semibold">
                  Converted: <span className="font-black text-slate-700">{formattedRevenueConverted}</span>{' '}
                  <span className="text-slate-400">({baseCurrency} base)</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 self-end lg:self-auto shrink-0">
            <button className="p-3 bg-white rounded-2xl border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-all relative shadow-sm">
              <Bell className="w-5 h-5" />
              <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className="h-12 w-12 bg-emerald-100 text-emerald-800 rounded-2xl border border-emerald-50 flex items-center justify-center font-black text-lg shadow-sm">
              {data?.user?.initials || 'TP'}
            </div>
          </div>
        </header>

        {/* Top Stats Grid (POSA Look) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <StatCard
            title="Sales"
            value={formattedRevenue}
            sub={formattedRevenueConverted ? `≈ ${formattedRevenueConverted} (${baseCurrency})` : undefined}
            icon={Wallet}
            accent="emerald"
          />
          <StatCard
            title="Gross Profit"
            value={formatCurrency(data?.stats?.grossProfit || 0, currencyCode, userLocale)}
            icon={TrendingUp}
            accent="blue"
          />
          <StatCard
            title="Net Profit"
            value={formatCurrency(data?.stats?.netProfit || 0, currencyCode, userLocale)}
            icon={Coins}
            accent="purple"
          />
          <StatCard
            title="Receivables"
            value={formatCurrency(data?.stats?.debtorsAmount || 0, currencyCode, userLocale)}
            sub={`${data?.stats?.debtorsCount || 0} people owing`}
            icon={CreditCard}
            accent="orange"
          />
          <StatCard
            title="Orders"
            value={String(data?.stats?.totalOrders || 0)}
            icon={Clipboard}
            accent="emerald"
          />
        </div>

        {/* Sales by Payment Method Grid */}
        {data?.stats?.paymentMethods && Object.keys(data.stats.paymentMethods).length > 0 && (
           <div className="mt-8">
              <h3 className="text-xl font-black tracking-tight text-slate-900 mb-4">Sales by payment method</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {['CASH', 'POS', 'TRANSFER', 'OPAY'].map((pm) => {
                  const val = data?.stats?.paymentMethods?.[pm] || 0;
                  if (val === 0) return null; // Only show active payment methods
                  return (
                    <div key={pm} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        {pm === 'CASH' && <Banknote className="w-4 h-4 text-emerald-600" />}
                        {(pm === 'POS' || pm === 'CARD') && <CreditCard className="w-4 h-4 text-blue-600" />}
                        {pm === 'TRANSFER' && <Layout className="w-4 h-4 text-purple-600" />}
                        {pm === 'OPAY' && <Wallet className="w-4 h-4 text-emerald-600" />}
                        <span className="text-sm font-bold text-slate-500 capitalize">{pm === 'POS' ? 'Card' : pm.toLowerCase()}</span>
                      </div>
                      <div className="text-2xl font-black text-slate-900">{formatCurrency(val, currencyCode, userLocale)}</div>
                    </div>
                  );
                })}
              </div>
           </div>
        )}

        {/* Visit Stats */}
        <div className="mt-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-6">
             <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                   <Eye className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                   <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Shop Visits</h3>
                   <p className="text-3xl font-black tracking-tight text-slate-900 mt-1">
                      {visitCount}
                      <span className="text-sm text-slate-400 font-bold ml-2 lowercase">visits</span>
                   </p>
                </div>
             </div>

             <div className="flex bg-slate-100 p-1 rounded-xl">
                {(['today', 'week', 'month', 'year'] as const).map((d) => (
                   <button
                      key={d}
                      onClick={() => setVisitDuration(d)}
                      className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                         visitDuration === d
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                      }`}
                   >
                      {d}
                   </button>
                ))}
             </div>
          </div>
        </div>

        {/* Mid row */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-[420px]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-900">Sales Overview</h3>
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mt-1">
                  Recent days
                </p>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-slate-500" />
              </div>
            </div>

            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
                  />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9', radius: 12 }}
                    contentStyle={{
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 20px 40px -20px rgba(0,0,0,0.25)',
                    }}
                    formatter={(value: any) => [formatCurrency(Number(value) || 0, currencyCode, userLocale), 'Sales']}
                  />
                  <Bar dataKey="sales" fill="#10b981" radius={[10, 10, 10, 10]} barSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Inventory */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-[420px]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-900">Top Inventory</h3>
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mt-1">
                  Current stock status
                </p>
              </div>
              <button
                onClick={() => router.push('/inventory')}
                className="text-xs font-black text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-2xl transition-all flex items-center gap-2 border border-emerald-100"
              >
                VIEW ALL <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {inventory.length ? (
                inventory.slice(0, 7).map((item, i) => {
                  const qty = Number(item.quantity ?? item.stock ?? 0);
                  const price = Number(item.price ?? item.lastUnitPrice ?? 0);
                  const low = qty > 0 && qty < 5;

                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-white hover:border-emerald-200 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-500">
                          {String(item.name || '').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-slate-900 truncate">{item.name}</p>
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-0.5 flex items-center gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${low ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                            {qty} in stock
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-slate-900">{formatCurrency(price, currencyCode, userLocale)}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                  <Layout className="w-10 h-10 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest">No items found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div className="mt-6 bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="font-black text-slate-900 text-xl tracking-tight">Recent Activity</h3>
              <p className="text-xs text-slate-400 font-extrabold uppercase tracking-widest mt-1">Latest store activity</p>
            </div>
            <button
              onClick={() => router.push('/sales')}
              className="p-3 bg-white rounded-2xl border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm"
            >
              <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead className="bg-white text-slate-400 text-[10px] font-black uppercase tracking-[2px] border-b border-slate-100">
                <tr>
                  <th className="px-8 py-5">Product Details</th>
                  <th className="px-8 py-5 text-center">Timestamp</th>
                  <th className="px-8 py-5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topTransactions.length ? (
                  topTransactions.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm ${
                              t.type === 'SALE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-blue-50 text-blue-700 border-blue-100'
                            }`}
                          >
                            {t.type === 'SALE' ? <ShoppingBag className="w-5 h-5" /> : <Coins className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-extrabold text-slate-900 truncate">{t.item}</p>
                            <p className="text-xs font-semibold text-slate-500">
                              Qty: <span className="font-black">{t.qty}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-8 py-6 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-extrabold text-slate-700">
                            {new Date(t.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-[10px] font-black text-slate-400 flex items-center gap-1 uppercase tracking-tighter">
                            <Clock className="w-3 h-3" />
                            {new Date(t.date).toLocaleTimeString(userLocale, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>

                      <td className="px-8 py-6 text-right font-black text-slate-900 text-lg tabular-nums">
                        {formatCurrency(Number(t.amount || 0), currencyCode, userLocale)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-8 py-16 text-center text-slate-300 font-black uppercase tracking-widest text-xs">
                      No transactions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Expired Plan Modal */}
      {showExpiredModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <Clock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Plan Expired</h2>
            <p className="text-slate-500 font-medium mb-8 leading-relaxed">
              Your subscription plan has expired. Please renew to continue accessing all features.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push('/payment')}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 active:scale-95"
              >
                Renew Plan Now
              </button>
              <button
                onClick={() => setShowExpiredModal(false)}
                className="w-full py-3.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-bold transition-all active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push Notification Opt-in Banner */}
      <PushNotificationPrompt />
    </div>
  );
}


