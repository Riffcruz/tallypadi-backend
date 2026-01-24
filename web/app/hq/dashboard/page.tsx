'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { getCookie } from '../../../utils/cookies';
import { Wallet, ShoppingBag, Store, TrendingUp } from 'lucide-react';
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

function StatCard({ title, value, sub, icon: Icon, accent }: any) {
    const accentMap: any = {
        emerald: 'bg-emerald-100 text-emerald-700',
        blue: 'bg-blue-100 text-blue-700',
        purple: 'bg-purple-100 text-purple-700',
        orange: 'bg-orange-100 text-orange-700'
    };
    
    return (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</p>
                    <h3 className="text-3xl font-black mt-2 text-slate-900">{value}</h3>
                    {sub && <p className="text-xs font-semibold text-slate-400 mt-1">{sub}</p>}
                </div>
                <div className={`p-3 rounded-xl ${accentMap[accent]}`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
        </div>
    );
}

export default function HqDashboardPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const token = getCookie('tallyToken');
        if (!token) {
            router.push('/login');
            return;
        }

        axios.get(`${API_URL}/hq/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setData(res.data))
            .catch(err => {
                console.error("HQ Dash Error", err);
                if (err.response?.status === 403) router.push('/dashboard'); // Fallback if not HQ
            })
            .finally(() => setLoading(false));
    }, [router]);

    if (loading) return <div className="p-10 text-center font-bold text-slate-400">Loading HQ...</div>;
    if (!data) return <div className="p-10 text-center font-bold text-slate-400">Failed to load data.</div>;

    const { overview, recentNetworkSales } = data;

    return (
        <div>
            <header className="mb-8">
                <h1 className="text-3xl font-black text-slate-900">HQ Overview</h1>
                <p className="text-slate-500 font-medium">Network-wide performance</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard 
                    title="Total Revenue" 
                    value={`₦${Number(overview.totalRevenue).toLocaleString()}`} 
                    sub="All time"
                    icon={Wallet} 
                    accent="emerald" 
                />
                 <StatCard 
                    title="Today's Revenue" 
                    value={`₦${Number(overview.todayRevenue).toLocaleString()}`} 
                    sub="Network wide"
                    icon={TrendingUp} 
                    accent="blue" 
                />
                <StatCard 
                    title="Active Branches" 
                    value={overview.activeBranches} 
                    sub="Linked Shops"
                    icon={Store} 
                    accent="purple" 
                />
                <StatCard 
                    title="Total Sales" 
                    value={overview.totalSales} 
                    sub="Transactions count"
                    icon={ShoppingBag} 
                    accent="orange" 
                />
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-xl font-black mb-6 text-slate-900">Recent Network Activity</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-400 text-xs font-black uppercase tracking-wider">
                            <tr>
                                <th className="p-4 rounded-l-xl">Branch</th>
                                <th className="p-4">Items</th>
                                <th className="p-4 text-right">Amount</th>
                                <th className="p-4 rounded-r-xl text-right">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {recentNetworkSales.map((t: any) => (
                                <tr key={t.id} className="hover:bg-slate-50">
                                    <td className="p-4 font-bold text-slate-700">{t.branchName}</td>
                                    <td className="p-4 text-slate-600 font-medium">{t.items}</td>
                                    <td className="p-4 text-right font-black text-emerald-600">₦{Number(t.amount).toLocaleString()}</td>
                                    <td className="p-4 text-right text-slate-400 text-xs font-bold">
                                        {new Date(t.date).toLocaleTimeString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {recentNetworkSales.length === 0 && (
                        <p className="text-center py-10 text-slate-400 font-bold">No recent sales found across branches.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
