'use client';

import React, { useState, useEffect } from 'react';
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
  ArrowRight,
  BarChart3,
  TrendingDown,
  Package,
  ShoppingCart,
  DollarSign,
  Activity
} from 'lucide-react';

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
  salesChart?: Array<{ day: string; sales: number }>;
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

// --- SIMPLE BAR CHART COMPONENT (No Recharts) ---
const SimpleBarChart = ({ data }: { data: Array<{ day: string; sales: number }> }) => {
  const maxValue = Math.max(...data.map(d => d.sales), 1);
  
  return (
    <div className="w-full h-full">
      <div className="flex items-end justify-between h-48 px-2">
        {data.map((item, index) => {
          const height = (item.sales / maxValue) * 100;
          return (
            <div key={index} className="flex flex-col items-center flex-1">
              <div className="relative w-8 md:w-10">
                <div 
                  className="w-full bg-emerald-500 rounded-t-lg transition-all duration-500 hover:bg-emerald-600 cursor-pointer relative group"
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {formatCurrency(item.sales, 'NGN', 'en-NG')}
                  </div>
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 opacity-0 group-hover:opacity-100"></div>
                </div>
              </div>
              <div className="mt-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {item.day.substring(0, 3)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- STAT CARD COMPONENT ---
const StatCard = ({ title, value, icon: Icon, bgClass, iconColor, trend }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full relative overflow-hidden group">
    <div className="absolute top-0 right-0 w-24 h-24 bg-gray-50 rounded-bl-[100px] -mr-10 -mt-10 transition-all group-hover:bg-emerald-50/50" />
    
    <div className="relative z-10">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${bgClass} ${iconColor} shadow-sm`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 px-2.5 py-1 ${trend.startsWith('Up') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'} rounded-full text-[10px] font-bold uppercase tracking-wider`}>
            {trend.startsWith('Up') ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
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

// --- ACTIVITY INDICATOR ---
const ActivityIndicator = ({ type }: { type: 'SALE' | 'RESTOCK' | 'DEBT_PAYMENT' }) => {
  const config = {
    SALE: { color: 'bg-emerald-500', icon: ShoppingCart },
    RESTOCK: { color: 'bg-blue-500', icon: Package },
    DEBT_PAYMENT: { color: 'bg-amber-500', icon: DollarSign }
  };
  
  const { color, icon: Icon } = config[type] || config.SALE;
  
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} text-white shadow-sm`}>
      <Icon className="w-5 h-5" />
    </div>
  );
};

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

  // Generate sample chart data if none exists
  const chartData = data?.salesChart || [
    { day: 'Mon', sales: 42000 },
    { day: 'Tue', sales: 52000 },
    { day: 'Wed', sales: 38000 },
    { day: 'Thu', sales: 61000 },
    { day: 'Fri', sales: 48000 },
    { day: 'Sat', sales: 72000 },
    { day: 'Sun', sales: 35000 },
  ];

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
            <button className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 hover:text-emerald-600 hover:border-emerald-200 transition-all relative">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                3
              </span>
            </button>
            <div className="h-12 w-12 bg-emerald-100 text-emerald-700 rounded-2xl border-2 border-emerald-50 flex items-center justify-center font-black text-lg shadow-sm">
              {data?.user?.initials || 'IO'}
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          <StatCard 
            title="Money Made" 
            value={formatCurrency(data?.stats?.revenue || 0, currencyCode, userLocale)} 
            icon={Wallet} 
            bgClass="bg-emerald-50" 
            iconColor="text-emerald-600" 
            trend="Up 12%" 
          />
          <StatCard 
            title="Stock Value" 
            value={formatCurrency(stockValue, currencyCode, userLocale)} 
            icon={Coins} 
            bgClass="bg-blue-50" 
            iconColor="text-blue-600" 
            trend="Stable" 
          />
          <StatCard 
            title="Sales Today" 
            value={data?.stats?.itemsSold || 0} 
            icon={ShoppingBag} 
            bgClass="bg-orange-50" 
            iconColor="text-orange-600" 
            trend="Up 5%" 
          />
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
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-bold text-emerald-600">+12.5% from last week</span>
              </div>
            </div>

            <div className="flex-1 w-full">
              <SimpleBarChart data={chartData} />
              
              {/* Chart Summary */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Total Sales</p>
                    <p className="font-black text-gray-900 text-lg">
                      {formatCurrency(
                        chartData.reduce((sum, day) => sum + day.sales, 0),
                        currencyCode,
                        userLocale
                      )}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Avg/Day</p>
                    <p className="font-black text-gray-900 text-lg">
                      {formatCurrency(
                        chartData.reduce((sum, day) => sum + day.sales, 0) / chartData.length,
                        currencyCode,
                        userLocale
                      )}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Peak Day</p>
                    <p className="font-black text-gray-900 text-lg">
                      {chartData.reduce((max, day) => day.sales > max.sales ? day : max).day}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Inventory Card */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                 <h3 className="font-black text-gray-900 text-xl tracking-tight">Top Inventory</h3>
                 <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Stock Status</p>
              </div>
              <button 
                onClick={() => router.push('/inventory')} 
                className="text-xs font-black text-emerald-600 hover:bg-emerald-50 px-4 py-2 rounded-xl transition-all flex items-center gap-2 border border-emerald-100"
              >
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
                      <p className="text-[10px] font-bold text-gray-400">
                        {Number(item.quantity ?? item.stock ?? 0)} × {formatCurrency(Number(item.price ?? item.lastUnitPrice ?? 0) / (Number(item.quantity ?? item.stock ?? 0) || 1), currencyCode, userLocale)}
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
                <h3 className="font-black text-gray-900 text-xl tracking-tight">Recent Activity</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Store Transactions</p>
             </div>
             <button 
               onClick={() => router.push('/sales')} 
               className="p-3 bg-white rounded-2xl border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm"
             >
                <ArrowUpRight className="w-5 h-5" />
             </button>
          </div>

          <div className="p-2">
            {data?.transactions?.slice(0, 5).map((t, i) => (
              <div 
                key={i} 
                className="flex items-center justify-between p-6 hover:bg-slate-50/80 transition-colors border-b border-gray-50 last:border-0 group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <ActivityIndicator type={t.type} />
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-900 capitalize text-sm group-hover:text-emerald-700 transition-colors truncate max-w-[200px]">
                      {t.item}
                    </h4>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      {t.type === 'SALE' ? 'Sale' : t.type === 'RESTOCK' ? 'Restock' : 'Debt Payment'} • Qty: {t.qty}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-700">
                      {new Date(t.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-xs text-gray-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(t.date).toLocaleTimeString(userLocale, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="font-black text-gray-900 text-lg tabular-nums">
                      {formatCurrency(t.amount, currencyCode, userLocale)}
                    </div>
                    <div className={`text-xs font-bold ${t.type === 'SALE' ? 'text-emerald-600' : 'text-blue-600'}`}>
                      {t.type === 'SALE' ? 'Revenue' : t.type === 'RESTOCK' ? 'Investment' : 'Payment'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {(!data?.transactions || data.transactions.length === 0) && (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Activity className="w-8 h-8 text-gray-400" />
                </div>
                <h4 className="font-bold text-gray-900 text-lg mb-2">No Activity Yet</h4>
                <p className="text-gray-500 max-w-md mx-auto">
                  Start making sales or adding inventory to see your transaction history here.
                </p>
                <button 
                  onClick={() => router.push('/sales/new')}
                  className="mt-6 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all inline-flex items-center gap-2"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Create First Sale
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <button 
            onClick={() => router.push('/sales/new')}
            className="p-6 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <ShoppingCart className="w-8 h-8" />
              <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h4 className="font-black text-lg mb-2">New Sale</h4>
            <p className="text-emerald-100 text-sm">Record a customer purchase</p>
          </button>
          
          <button 
            onClick={() => router.push('/inventory/add')}
            className="p-6 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <Package className="w-8 h-8" />
              <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h4 className="font-black text-lg mb-2">Add Stock</h4>
            <p className="text-blue-100 text-sm">Update inventory items</p>
          </button>
          
          <button 
            onClick={() => router.push('/analytics')}
            className="p-6 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <BarChart3 className="w-8 h-8" />
              <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h4 className="font-black text-lg mb-2">Analytics</h4>
            <p className="text-purple-100 text-sm">View detailed reports</p>
          </button>
          
          <button 
            onClick={() => router.push('/customers')}
            className="p-6 bg-amber-600 text-white rounded-2xl hover:bg-amber-700 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <Wallet className="w-8 h-8" />
              <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h4 className="font-black text-lg mb-2">Customers</h4>
            <p className="text-amber-100 text-sm">Manage customer debts</p>
          </button>
        </div>
      </main>
    </div>
  );
}