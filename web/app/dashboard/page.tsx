'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Clock,
  Layout,
  ArrowRight
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

interface DashboardUser {
  name?: string;
  shopName?: string;
  initials?: string;
  planType?: 'OGA_BOSS' | 'TYCOON';
  currencyCode?: string;   
  locale?: string;         
}

interface DashboardResponse {
  user?: DashboardUser;
  stats?: {
    revenue?: number;
    itemsSold?: number;
  };
  inventory?: InventoryItem[];
  transactions?: TransactionRow[];
  salesChart?: ChartDataPoint[];
}

// --- DYNAMIC FORMATTER ---
const formatCurrency = (amount: number, currencyCode = 'NGN', locale = 'en-NG') => {
  const safe = Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(safe) ? safe : 0);
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

// --- RICH STAT CARD COMPONENT ---
const StatCard = ({ title, value, icon: Icon, bgClass, iconColor, trend }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full relative overflow-hidden group">
    {/* Decorative background circle */}
    <div className="absolute top-0 right-0 w-24 h-24 bg-gray-50 rounded-bl-[100px] -mr-10 -mt-10 transition-all group-hover:bg-emerald-50/50" />
    
    <div className="relative z-10">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${bgClass} ${iconColor} shadow-sm`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div className="flex items-center gap-1 px-2.5 py-1 bg-green-50 rounded-full text-green-700 text-[10px] font-bold uppercase tracking-wider">
            <TrendingUp className="w-3 h-3" />
            <span>{trend}</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-gray-500 text-sm font-semibold mb-1 uppercase tracking-tight">{title}</p>
        <h3 className="font-black text-gray-900 text-3xl tracking-tight leading-none truncate">
          {value}
        </h3>
      </div>
    </div>
  </div>
);

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    axios
      .get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setData(res.data as DashboardResponse);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Dashboard Fetch Error:', err);
        setLoading(false);
      });
  }, [router]);

  const currencyCode = data?.user?.currencyCode || 'NGN';
  const userLocale = data?.user?.locale || 'en-NG';

  const inventory = data?.inventory || [];
  const stockValue = inventory.reduce((acc, curr) => {
    const qty = Number(curr.quantity ?? curr.stock ?? 0);
    const price = Number(curr.price ?? curr.lastUnitPrice ?? 0);
    return acc + (qty * price);
  }, 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-emerald-100 rounded-full" />
            <div className="absolute top-0 left-0 w-12 h-12 border-4 border-emerald-600 rounded-full border-t-transparent animate-spin" />
          </div>
          <p className="text-gray-500 font-bold text-sm tracking-widest uppercase">Syncing Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative overflow-x-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full max-w-full overflow-x-hidden">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2.5 bg-white border border-gray-200 rounded-xl md:hidden text-gray-600 shadow-sm active:scale-95 transition-transform">
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight leading-tight">
                {getGreeting()}, <span className="text-emerald-700">{data?.user?.shopName || 'Owner'}</span>
              </h1>
              <p className="text-gray-500 text-sm mt-1 flex items-center gap-2 font-medium">
                <Calendar className="w-4 h-4 text-emerald-600" />
                {new Date().toLocaleDateString(userLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 self-end md:self-auto shrink-0">
            <div className="h-12 w-12 bg-emerald-100 text-emerald-700 rounded-2xl border-2 border-emerald-50 flex items-center justify-center font-black text-lg shadow-sm">
              {data?.user?.initials || 'IO'}
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <StatCard title="Money Made" value={formatCurrency(data?.stats?.revenue || 0, currencyCode, userLocale)} icon={Wallet} bgClass="bg-emerald-50" iconColor="text-emerald-600" trend="Up" />
          <StatCard title="Stock Value" value={formatCurrency(stockValue, currencyCode, userLocale)} icon={Coins} bgClass="bg-blue-50" iconColor="text-blue-600" trend="Stable" />
          <StatCard title="Sales Today" value={data?.stats?.itemsSold || 0} icon={ShoppingBag} bgClass="bg-orange-50" iconColor="text-orange-600" trend="Active" />
        </div>

        {/* Charts & Tables Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Sales Performance Card */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                 <h3 className="font-black text-gray-900 text-xl tracking-tight">Sales Overview</h3>
                 <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Weekly Performance</p>
              </div>
            </div>

            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.salesChart || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}} dy={10} />
                  <YAxis 
  axisLine={false} 
  tickLine={false} 
  tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}} 
  // ✅ Fix: Add ': number' type to val
  tickFormatter={(val: number) => (val >= 1000 ? `${val / 1000}k` : val.toString())} 
/>
                 <Tooltip 
  cursor={{fill: '#f1f5f9', radius: 8}}
  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}}
  // ✅ Fix: Allow 'any' type and handle undefined with a fallback to 0
  formatter={(val: any) => [formatCurrency(Number(val) || 0, currencyCode, userLocale), 'Sales']}
/>
                  <Bar dataKey="sales" fill="#10b981" radius={[8, 8, 8, 8]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Inventory Card */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                 <h3 className="font-black text-gray-900 text-xl tracking-tight">Top Inventory</h3>
                 <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Stock Status</p>
              </div>
              <button onClick={() => router.push('/inventory')} className="text-xs font-black text-emerald-600 hover:bg-emerald-50 px-4 py-2 rounded-xl transition-all flex items-center gap-2 border border-emerald-100">
                ALL <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-gray-100">
                {inventory.slice(0, 6).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 border border-gray-100 hover:bg-white hover:border-emerald-200 transition-all group">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-gray-200 font-black text-gray-400 text-sm shadow-sm group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                        {String(item.name || '').substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 capitalize truncate text-sm">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`w-2 h-2 rounded-full ${(Number(item.quantity ?? item.stock ?? 0) < 5) ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {Number(item.quantity ?? item.stock ?? 0)} In Stock
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-gray-900">
                        {formatCurrency(Number(item.price ?? item.lastUnitPrice ?? 0), currencyCode, userLocale)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Recent Transactions Table Section */}
        <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden mb-8">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
             <div>
                <h3 className="font-black text-gray-900 text-xl tracking-tight">Recent Sales</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Store Activity</p>
             </div>
             <button onClick={() => router.push('/sales')} className="p-3 bg-white rounded-2xl border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm">
                <ArrowUpRight className="w-5 h-5" />
             </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-gray-50/50 text-gray-400 text-[10px] font-black uppercase tracking-[2px] border-b border-gray-100">
                <tr>
                  <th className="px-8 py-5">Product Details</th>
                  <th className="px-8 py-5 text-center">Timestamp</th>
                  <th className="px-8 py-5 text-right">Transaction Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.transactions?.slice(0, 5).map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                          t.type === 'SALE' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {t.type === 'SALE' ? <ShoppingBag className="w-5 h-5" /> : <Coins className="w-5 h-5" />}
                        </div>
                        <span className="font-bold text-gray-900 capitalize text-sm group-hover:text-emerald-700 transition-colors truncate max-w-[250px]">{t.item}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-bold text-gray-700">{new Date(t.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })}</span>
                        <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-tighter">
                          <Clock className="w-3 h-3" /> {new Date(t.date).toLocaleTimeString(userLocale, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right font-black text-gray-900 text-lg tabular-nums">
                      {formatCurrency(t.amount, currencyCode, userLocale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}