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
  ArrowRight,
  Clock,
  Layout
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

interface DashboardResponse {
  user?: {
    name?: string;
    shopName?: string;
    initials?: string;
    currencyCode?: string;
    locale?: string;
  };
  stats?: {
    revenue?: number;
    itemsSold?: number;
  };
  inventory?: InventoryItem[];
  transactions?: TransactionRow[];
  salesChart?: ChartDataPoint[];
}

// --- DYNAMIC CURRENCY FORMATTER ---
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

// --- RESTORED STAT CARD ---
const StatCard = ({ title, value, icon: Icon, bgClass, iconColor, trend }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full relative overflow-hidden group">
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
        <h3 className="font-black text-gray-900 text-3xl tracking-tight leading-none break-words">
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

  // Derived settings
  const currencyCode = data?.user?.currencyCode || 'NGN';
  const userLocale = data?.user?.locale || 'en-NG';
  const inventory = data?.inventory || [];
  
  const stockValue = useMemo(() => {
    return inventory.reduce((acc, curr) => {
      const qty = Number(curr.quantity ?? curr.stock ?? 0);
      const price = Number(curr.price ?? curr.lastUnitPrice ?? 0);
      return acc + (qty * price);
    }, 0);
  }, [inventory]);

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
      
      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar Container */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      {/* Main Container */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full max-w-full min-h-screen overflow-x-hidden">
        
        {/* --- HEADER STRUCTURE --- */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2.5 bg-white border border-gray-200 rounded-xl md:hidden text-gray-600 shadow-sm active:scale-95 transition-transform">
              <Menu className="w-6 h-6" />
            </button>
            <div className="min-w-0">
              <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-tight">
                {getGreeting()}, <span className="text-emerald-700">{data?.user?.shopName || 'Owner'}</span>
              </h1>
              <p className="text-gray-500 text-sm mt-1 flex items-center gap-2 font-medium">
                <Calendar className="w-4 h-4 text-emerald-600" />
                {new Date().toLocaleDateString(userLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 self-end md:self-auto shrink-0">
            <button className="p-3 bg-white rounded-full border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-all relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className="h-12 w-12 bg-emerald-100 text-emerald-700 rounded-2xl border-2 border-emerald-50 flex items-center justify-center font-black text-lg shadow-sm">
              {data?.user?.initials || 'IO'}
            </div>
          </div>
        </header>

        {/* --- CONTENT STRUCTURE --- */}
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
          
          {/* 1. Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
              title="Total Revenue" 
              value={formatCurrency(data?.stats?.revenue || 0, currencyCode, userLocale)} 
              icon={Wallet} 
              bgClass="bg-emerald-50" 
              iconColor="text-emerald-600" 
              trend="Performance" 
            />
            <StatCard 
              title="Estimated Stock" 
              value={formatCurrency(stockValue, currencyCode, userLocale)} 
              icon={Coins} 
              bgClass="bg-blue-50" 
              iconColor="text-blue-600" 
            />
            <StatCard 
              title="Items Sold Today" 
              value={data?.stats?.itemsSold || 0} 
              icon={ShoppingBag} 
              bgClass="bg-orange-50" 
              iconColor="text-orange-600" 
              trend="Live" 
            />
          </div>

          {/* 2. Charts & Items Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Sales Performance Card */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col h-[400px]">
              <div className="flex justify-between items-center mb-6">
                <div>
                   <h3 className="font-black text-gray-900 text-xl tracking-tight">Sales Overview</h3>
                   <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Weekly Performance</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                   <TrendingUp className="w-5 h-5" />
                </div>
              </div>

            <div className="flex-1 w-full mt-2">
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data?.salesChart || []}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
      <XAxis 
        dataKey="day" 
        axisLine={false} 
        tickLine={false} 
        tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}} 
        dy={10} 
      />
      <YAxis 
        axisLine={false} 
        tickLine={false} 
        tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 600}} 
        tickFormatter={(val: number) => val >= 1000 ? `${val/1000}k` : val} // Type val
      />
      <Tooltip 
        cursor={{fill: '#f1f5f9', radius: 8}}
        contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}}
        formatter={(val: number) => [formatCurrency(val, currencyCode, userLocale), 'Sales']} // Type val
      />
      <Bar dataKey="sales" fill="#10b981" radius={[8, 8, 8, 8]} barSize={32} />
    </BarChart>
  </ResponsiveContainer>
</div>
            </div>

            {/* Inventory List Card */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col h-[400px]">
              <div className="flex justify-between items-center mb-6">
                <div>
                   <h3 className="font-black text-gray-900 text-xl tracking-tight">Top Inventory</h3>
                   <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Current Stock Status</p>
                </div>
                <button onClick={() => router.push('/inventory')} className="text-xs font-black text-emerald-600 hover:bg-emerald-50 px-4 py-2 rounded-xl transition-all flex items-center gap-2 border border-emerald-100">
                  ALL <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-gray-100">
                {inventory.length > 0 ? (
                  inventory.slice(0, 6).map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 border border-gray-100 hover:bg-white hover:border-emerald-200 transition-all group">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-gray-200 font-black text-gray-400 text-sm shadow-sm group-hover:bg-emerald-50 group-hover:text-emerald-600 group-hover:border-emerald-100 transition-colors">
                          {String(item.name || '').substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 capitalize truncate">{item.name}</p>
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
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                    <Layout className="w-10 h-10 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">No Items Found</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Transactions Table Section */}
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
               <div>
                  <h3 className="font-black text-gray-900 text-xl tracking-tight">Recent Sales</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Latest Store Activity</p>
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
                  {data?.transactions && data.transactions.length > 0 ? (
                    data.transactions.slice(0, 5).map((t, i) => (
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
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center text-gray-300 font-bold uppercase tracking-widest text-xs">
                        No transactions recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}