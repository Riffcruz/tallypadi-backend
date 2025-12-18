'use client';

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
// ✅ Verified sidebar import path
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

// --- STAT CARD COMPONENT ---
const StatCard = ({ title, value, icon: Icon, bgClass, iconColor, trend }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${bgClass} ${iconColor}`}>
        <Icon className="w-6 h-6" />
      </div>
      {trend && (
        <div className="flex items-center gap-1 px-2.5 py-1 bg-green-50 rounded-full text-green-700 text-xs font-bold">
          <TrendingUp className="w-3 h-3" />
          <span>{trend}</span>
        </div>
      )}
    </div>
    <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
    <h3 className="font-extrabold text-gray-900 text-3xl truncate">{value}</h3>
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
          <p className="text-gray-400 text-sm font-medium">Syncing your shop...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900">
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
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-gray-600 md:hidden"><Menu className="w-6 h-6" /></button>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900">
                {getGreeting()}, <span className="text-emerald-700">{data?.user?.shopName || 'Owner'}</span>
              </h1>
              <p className="text-gray-500 text-sm mt-1 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {new Date().toLocaleDateString(userLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 self-end md:self-auto">
            <div className="h-10 w-10 bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200 flex items-center justify-center font-bold text-sm">
              {data?.user?.initials || 'IO'}
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Money Made" value={formatCurrency(data?.stats?.revenue || 0, currencyCode, userLocale)} icon={Wallet} bgClass="bg-emerald-50" iconColor="text-emerald-600" trend="Up" />
          <StatCard title="Stock Value" value={formatCurrency(stockValue, currencyCode, userLocale)} icon={Coins} bgClass="bg-blue-50" iconColor="text-blue-600" trend="Stable" />
          <StatCard title="Sales Today" value={data?.stats?.itemsSold || 0} icon={ShoppingBag} bgClass="bg-orange-50" iconColor="text-orange-600" trend="Active" />
        </div>

        {/* Charts & Tables Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales Chart */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-80 flex flex-col">
            <h3 className="font-bold text-lg mb-4">Weekly Performance</h3>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.salesChart || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
  cursor={{fill: '#f1f5f9', radius: 8}}
  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}}
  // ✅ This is the line that was failing
  formatter={(val: any) => [formatCurrency(Number(val) || 0, currencyCode, userLocale), 'Sales']}
/>
                  <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Sales List */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-gray-50 flex justify-between items-center">
               <h3 className="font-bold text-lg">Recent Transactions</h3>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold">
                   <tr>
                     <th className="px-6 py-4">Item</th>
                     <th className="px-6 py-4 text-right">Amount</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {data?.transactions?.slice(0, 5).map((t, i) => (
                     <tr key={i} className="hover:bg-slate-50 transition-colors">
                       <td className="px-6 py-4 font-medium text-gray-900 capitalize truncate max-w-[150px]">{t.item}</td>
                       <td className="px-6 py-4 text-right font-bold">{formatCurrency(t.amount, currencyCode, userLocale)}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}