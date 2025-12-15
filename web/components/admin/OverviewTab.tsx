'use client';
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Activity, Users, Shield, Crown, TrendingUp } from 'lucide-react';

const StatCard = ({ title, value, sub, color, icon: Icon }: any) => {
    const colorClasses: any = {
        green: 'text-green-400 bg-green-900/30',
        blue: 'text-blue-400 bg-blue-900/30',
        purple: 'text-purple-400 bg-purple-900/30',
        white: 'text-white bg-slate-700'
    };
    return (
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${colorClasses[color] || colorClasses.white}`}>
                    <Icon size={24} />
                </div>
            </div>
            <p className="text-slate-400 text-sm mb-1">{title}</p>
            <h3 className={`text-3xl font-bold ${color === 'white' ? 'text-white' : colorClasses[color].split(' ')[0]}`}>{value}</h3>
            <p className="text-xs text-slate-500 mt-1">{sub}</p>
        </div>
    );
};

export default function OverviewTab({ stats }: any) {
    if (!stats) return null;
    return (
        // Added pt-16 md:pt-0 to ensure the mobile menu button doesn't overlap the title
        <div className="space-y-8 animate-in fade-in duration-500 pt-16 md:pt-0">
            <h2 className="text-2xl font-bold text-slate-100">System Health</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Platform GMV" value={`₦${stats.financials.gmv.toLocaleString()}`} sub={`${stats.financials.txCount} txns`} color="green" icon={Activity} />
                <StatCard title="Total Users" value={stats.users.total} sub={`${stats.users.active24h} active today`} color="white" icon={Users} />
                <StatCard title="Oga Boss Plan" value={stats.users.ogaBoss} sub="Standard Users" color="blue" icon={Shield} />
                <StatCard title="Tycoon Plan" value={stats.users.tycoon} sub="Premium Users" color="purple" icon={Crown} />
            </div>

            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 h-96 shadow-xl">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <TrendingUp className="text-green-500" /> 7-Day Revenue Trend
                </h3>
                <ResponsiveContainer width="100%" height="85%">
                    <AreaChart data={stats.graph}>
                        <defs>
                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                        <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis 
                            stroke="#9ca3af" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                            tickFormatter={(val: any) => `₦${(Number(val) || 0)/1000}k`} 
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff', borderRadius: '8px' }} 
                            formatter={(val: any) => [`₦${(Number(val) || 0).toLocaleString()}`, 'Revenue']} 
                        />
                        <Area type="monotone" dataKey="sales" stroke="#10b981" fillOpacity={1} fill="url(#colorSales)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}