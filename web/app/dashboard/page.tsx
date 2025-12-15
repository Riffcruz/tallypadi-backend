'use client';

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
// Ensure this path matches where you saved your Sidebar component
import Sidebar from '../../components/Sidebar';
import { 
    Wallet, Coins, ShoppingBag, Menu, Bell, Smartphone, X,
    ArrowUpRight, Calendar, TrendingUp, ChevronDown
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
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

interface Transaction {
    id: number | string;
    type: 'SALE' | 'RESTOCK';
    item: string;
    qty: number;
    amount: number;
    date: string;
}

interface ChartDataPoint {
    day: string;
    sales: number;
}

// --- HELPERS ---
const formatNaira = (amount: number) => {
    if (isNaN(amount)) return '₦0';
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
};

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
};

// --- COMPONENTS ---

const StatCard = ({ title, value, icon: Icon, bgClass, iconColor, trend }: any) => (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${bgClass} ${iconColor}`}>
                <Icon className="w-6 h-6" />
            </div>
            {trend && (
                <div className="flex items-center gap-1 px-2.5 py-1 bg-green-50 rounded-full text-green-700 text-xs font-bold whitespace-nowrap">
                    <TrendingUp className="w-3 h-3" />
                    <span>{trend}</span>
                </div>
            )}
        </div>
        <div>
            <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
            {/* Auto-scaling text for large numbers */}
            <h3 className={`font-extrabold text-gray-900 tracking-tight leading-none ${String(value).length > 10 ? 'text-2xl' : 'text-3xl'}`}>
                {value}
            </h3>
        </div>
    </div>
);

// --- MAIN DASHBOARD PAGE ---

export default function DashboardPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    
    // Install Prompt State
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null); 
    const [showInstallBtn, setShowInstallBtn] = useState(false);
    
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('tallyToken');
        if (!token) {
            router.push('/login');
            return;
        }

        axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` }})
            .then(res => {
                setData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Dashboard Fetch Error:", err);
                setLoading(false); 
            });

        // 🟢 PWA INSTALL LISTENER
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallBtn(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, [router]);

    // --- REAL DATA PROCESSING ---
    const chartData: ChartDataPoint[] = useMemo(() => {
        if (data?.salesChart) return data.salesChart;

        if (data?.transactions) {
            const daysMap: Record<string, number> = { 'Sun': 0, 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0 };
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            data.transactions.forEach((t: Transaction) => {
                if (t.type === 'SALE' && t.date) {
                    const date = new Date(t.date);
                    if (!isNaN(date.getTime())) {
                        const day = dayNames[date.getDay()];
                        if (day in daysMap) {
                            daysMap[day] += Number(t.amount);
                        }
                    }
                }
            });

            const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            return orderedDays.map(day => ({
                day,
                sales: daysMap[day]
            }));
        }

        return [
            { day: 'Mon', sales: 0 }, { day: 'Tue', sales: 0 }, { day: 'Wed', sales: 0 },
            { day: 'Thu', sales: 0 }, { day: 'Fri', sales: 0 }, { day: 'Sat', sales: 0 }, { day: 'Sun', sales: 0 },
        ];
    }, [data]);

    const handleInstallClick = () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult: { outcome: string }) => {
            if (choiceResult.outcome === 'accepted') {
                setShowInstallBtn(false);
            }
            setDeferredPrompt(null);
        });
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
                <p className="text-gray-400 text-sm font-medium animate-pulse">Loading...</p>
            </div>
        </div>
    );

    const totalRevenue = data?.stats?.revenue || 0;
    const itemsSold = data?.stats?.itemsSold || 0;
    
    const stockValue = data?.inventory?.reduce((acc: number, curr: InventoryItem) => {
        const qty = curr.quantity || curr.stock || 0;
        const unitPrice = curr.price || curr.lastUnitPrice || 0;
        return acc + (qty * unitPrice);
    }, 0) || 0;
    
    const inventory = data?.inventory || [];
    const transactions = data?.transactions || [];

    return (
        <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative">
            
            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <Sidebar />
            </div>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-x-hidden min-h-screen w-full">
                
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <button 
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="p-2 -ml-2 text-gray-600 hover:bg-white hover:shadow-sm rounded-lg md:hidden transition-all"
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                                {getGreeting()}, <span className="text-green-700">{data?.user?.shopName || 'Owner'}</span>
                            </h1>
                            <p className="text-gray-500 text-sm mt-1 flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> 
                                {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 self-end md:self-auto">
                        <button className="p-2 bg-white rounded-full border border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-200 hover:shadow-sm transition-all relative">
                            <Bell className="w-5 h-5" />
                            {/* Notification Dot */}
                            <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>
                        <div className="h-10 w-10 bg-green-100 text-green-700 rounded-full border border-green-200 flex items-center justify-center font-bold text-sm">
                           {data?.user?.initials || 'IO'}
                        </div>
                    </div>
                </header>

                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    
                    {/* Stats Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard 
                            title="Total Money Made" 
                            value={formatNaira(totalRevenue)} 
                            icon={Wallet} 
                            bgClass="bg-green-50"
                            iconColor="text-green-600"
                            trend="Going Up"
                        />
                        <StatCard 
                            title="Value of Goods" 
                            value={formatNaira(stockValue)} 
                            icon={Coins} 
                            bgClass="bg-blue-50"
                            iconColor="text-blue-600"
                            trend="Stable"
                        />
                        <StatCard 
                            title="Items Sold Today" 
                            value={itemsSold} 
                            icon={ShoppingBag} 
                            bgClass="bg-orange-50"
                            iconColor="text-orange-600"
                            trend="Active"
                        />
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Sales Bar Chart */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-80">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800">Sales Overview</h3>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                                    Weekly <ChevronDown className="w-3 h-3" />
                                </div>
                            </div>
                            <div className="flex-1 w-full -ml-4">
                                {chartData.reduce((a, b) => a + b.sales, 0) > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} barSize={32}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis 
                                                dataKey="day" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{fill: '#94a3b8', fontSize: 12}} 
                                                dy={10}
                                            />
                                            <YAxis 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{fill: '#94a3b8', fontSize: 12}}
                                                tickFormatter={(value: number) => value >= 1000 ? `${value/1000}k` : `${value}`}
                                            />
                                            <Tooltip 
                                                cursor={{fill: '#f0fdf4', radius: 4}}
                                                contentStyle={{
                                                    borderRadius: '8px', 
                                                    border: 'none', 
                                                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                                                    padding: '12px'
                                                }}
                                                // FIX: Allow any value type to prevent "undefined not assignable to number" error
                                                formatter={(value: any) => [formatNaira(Number(value) || 0), 'Sales']}
                                            />
                                            <Bar dataKey="sales" radius={[6, 6, 6, 6]}>
                                                {chartData.map((entry, index) => (
                                                    <Cell 
                                                        key={`cell-${index}`} 
                                                        fill={entry.sales > 0 ? '#16a34a' : '#e2e8f0'} 
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <Wallet className="w-8 h-8 text-gray-200 mb-2" />
                                        <p className="text-sm">No sales data recorded yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Top Items List */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-80">
                             <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg text-gray-800">Top Items</h3>
                                <button 
                                    onClick={() => router.push('/inventory')} 
                                    className="text-xs font-semibold text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                >
                                    View All <ArrowUpRight className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                                {inventory.slice(0, 5).map((item: InventoryItem, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-green-200 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center border border-gray-200 font-bold text-gray-500 text-xs shadow-sm shrink-0">
                                                {item.name.substring(0,2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm text-gray-900 capitalize truncate w-32">{item.name}</p>
                                                <p className="text-[10px] text-gray-500">
                                                    {(item.quantity || 0) < 5 ? <span className="text-red-500">Low Stock</span> : 'In Stock'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-gray-900">{item.quantity || item.stock || 0}</p>
                                            <p className="text-[10px] text-gray-500">{formatNaira(item.price || item.lastUnitPrice || 0)}</p>
                                        </div>
                                    </div>
                                ))}
                                {inventory.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <p className="text-sm">No inventory data.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Recent Transactions Table */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800">Recent Transactions</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 font-medium whitespace-nowrap">Item</th>
                                        <th className="px-6 py-4 font-medium whitespace-nowrap text-center">Date</th>
                                        <th className="px-6 py-4 font-medium text-center whitespace-nowrap">Status</th>
                                        <th className="px-6 py-4 font-medium text-right whitespace-nowrap">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {transactions.slice(0, 5).map((t: any) => (
                                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900 capitalize flex items-center gap-3 whitespace-nowrap">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${t.type === 'SALE' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {t.type === 'SALE' ? <ArrowUpRight className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                                                </div>
                                                <span>{t.item}</span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 whitespace-nowrap text-center text-xs">
                                                {new Date(t.date).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                                                <span className="text-gray-300 ml-1">|</span> {new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </td>
                                            <td className="px-6 py-4 text-center whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                                    t.type === 'SALE' 
                                                        ? 'bg-green-50 text-green-700 border border-green-100' 
                                                        : 'bg-blue-50 text-blue-700 border border-blue-100'
                                                }`}>
                                                    {t.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">
                                                {t.type === 'SALE' ? '+' : ''}{formatNaira(t.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                    {transactions.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                                                <p>No recent transactions.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* 🟢 FLOATY INSTALL BUTTON (With Hide Logic) */}
            {showInstallBtn && (
                <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="relative group">
                        {/* Close Button */}
                        <button 
                            onClick={() => setShowInstallBtn(false)}
                            className="absolute -top-3 -right-3 bg-white text-gray-400 hover:text-gray-600 rounded-full p-1 shadow-md border border-gray-100 opacity-0 group-hover:opacity-100 transition-all z-10"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        {/* Install Action */}
                        <button 
                            onClick={handleInstallClick}
                            className="flex items-center gap-3 bg-gray-900 text-white px-5 py-3.5 rounded-2xl shadow-xl hover:bg-gray-800 hover:scale-105 transition-all duration-300 border border-gray-700/50"
                        >
                            <div className="p-1.5 bg-gray-700 rounded-lg">
                                <Smartphone className="w-5 h-5 text-green-400" />
                            </div>
                            <div className="text-left">
                                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Get the App</p>
                                <p className="text-sm font-bold text-white">Install TallyPadi</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}