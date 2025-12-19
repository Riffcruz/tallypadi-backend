'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
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
    initials?: string;
    currencyCode?: string; // e.g. NGN, USD, GHS
    locale?: string; // e.g. en-NG
    countryCode?: string; // optional
  };
  stats?: {
    revenue?: number; // in user's currency
    itemsSold?: number;
    // Optional: If your backend supports it, you can send multi-currency totals:
    // revenueByCurrency?: Record<string, number>;
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
  accent?: 'emerald' | 'blue' | 'orange' | 'purple';
}) {
  const accentMap: Record<string, string> = {
    emerald: 'from-emerald-500/10 to-emerald-500/0 text-emerald-700 border-emerald-100',
    blue: 'from-blue-500/10 to-blue-500/0 text-blue-700 border-blue-100',
    orange: 'from-orange-500/10 to-orange-500/0 text-orange-700 border-orange-100',
    purple: 'from-purple-500/10 to-purple-500/0 text-purple-700 border-purple-100',
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

// --- CHAT DOCK (admin-like helper) ---
function ChatDock({
  open,
  onToggle,
  onSend,
  sending,
  placeholder,
}: {
  open: boolean;
  onToggle: () => void;
  onSend: (text: string) => Promise<void>;
  sending: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState('');

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    await onSend(t);
    setText('');
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={onToggle}
        className="fixed bottom-5 right-5 z-[60] md:bottom-6 md:right-6 rounded-2xl shadow-lg border bg-slate-900 text-white px-4 py-3 flex items-center gap-2 hover:bg-slate-800 active:scale-95 transition"
        aria-label="Open chat"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-sm font-extrabold hidden sm:block">Chat</span>
        <Sparkles className="w-4 h-4 opacity-70" />
      </button>

      {/* Panel */}
      <div
        className={`fixed z-[70] left-0 right-0 bottom-0 md:left-auto md:right-6 md:bottom-20 md:w-[420px] transition-all duration-300 ${
          open ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0 pointer-events-none'
        }`}
      >
        <div className="mx-auto md:mx-0 rounded-t-3xl md:rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Quick Chat</p>
              <p className="text-sm font-extrabold text-slate-900 truncate">Send message to TallyPadi</p>
            </div>
            <button
              onClick={onToggle}
              className="p-2 rounded-xl hover:bg-black/5 active:scale-95 transition"
              aria-label="Close chat"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
              Tip: Type like <span className="font-bold">“Report today”</span> or <span className="font-bold">“Stock remaining”</span>.
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder || 'Type a message...'}
              className="w-full h-28 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
            />

            <button
              disabled={sending || !text.trim()}
              onClick={send}
              className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white py-3 font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {sending ? (
                <span className="text-sm">Sending...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [fx, setFx] = useState<FxRatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Chat dock
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSending, setChatSending] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
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

  const topTransactions = data?.transactions?.slice(0, 6) || [];
  const chartData = data?.salesChart || [];

  const sendChat = async (text: string) => {
    const token = localStorage.getItem('tallyToken');
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-emerald-100 rounded-full" />
            <div className="absolute top-0 left-0 w-12 h-12 border-4 border-emerald-600 rounded-full border-t-transparent animate-spin" />
          </div>
          <p className="text-slate-500 font-extrabold text-xs tracking-[0.25em] uppercase">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 relative overflow-x-hidden">
      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      {/* Main */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full max-w-full min-h-screen overflow-x-hidden">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2.5 bg-white border border-slate-200 rounded-2xl md:hidden text-slate-600 shadow-sm active:scale-95 transition"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="min-w-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                {getGreeting()},{' '}
                <span className="text-emerald-700">{data?.user?.shopName || 'Owner'}</span>
              </h1>
              <p className="text-slate-500 text-sm mt-2 flex items-center gap-2 font-semibold">
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

          <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
            <button className="p-3 bg-white rounded-2xl border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-all relative shadow-sm">
              <Bell className="w-5 h-5" />
              <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className="h-12 w-12 bg-emerald-100 text-emerald-800 rounded-2xl border border-emerald-50 flex items-center justify-center font-black text-lg shadow-sm">
              {data?.user?.initials || 'TP'}
            </div>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatCard
            title="Total Revenue"
            value={formattedRevenue}
            sub={formattedRevenueConverted ? `≈ ${formattedRevenueConverted} (${baseCurrency})` : undefined}
            icon={Wallet}
            accent="emerald"
          />
          <StatCard
            title="Estimated Stock Value"
            value={formatCurrency(stockValue, currencyCode, userLocale)}
            sub="Based on last unit price"
            icon={Coins}
            accent="blue"
          />
          <StatCard
            title="Items Sold Today"
            value={String(data?.stats?.itemsSold || 0)}
            sub="Live count"
            icon={ShoppingBag}
            accent="orange"
          />
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

      {/* ✅ Chat Dock */}
      <ChatDock
        open={chatOpen}
        onToggle={() => setChatOpen((v) => !v)}
        onSend={sendChat}
        sending={chatSending}
        placeholder="Type message (e.g. Report today, Stock remaining, Sales this week...)"
      />
    </div>
  );
}
