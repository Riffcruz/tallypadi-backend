'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { getCookie, removeCookie } from '../../../utils/cookies';
import { Users, UserCheck, UserPlus, Crown, LogOut } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface InvestorStats {
  registeredUsers: number;
  activeTycoon: number;
  activeOgaBoss: number;
  onTrial: number;
}

export default function InvestorDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<InvestorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getCookie('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchStats = async () => {
      try {
        const res = await axios.get(`${API_URL}/investor/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success) {
          setStats(res.data.stats);
        }
      } catch (error) {
        console.error('Failed to fetch stats', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [router]);

  const handleLogout = () => {
    removeCookie('tallyToken');
    sessionStorage.removeItem('tallyUser');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-sans">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-emerald-600/20">I</div>
            <h1 className="text-xl font-bold tracking-tight">Investor Dashboard</h1>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-600 transition-colors bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:shadow-md"
        >
          <LogOut size={18} />
          Logout
        </button>
      </header>

      <main className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="mb-8">
            <h2 className="text-3xl font-black tracking-tight mb-2 text-slate-900">Platform Overview</h2>
            <p className="text-slate-500 font-medium">Real-time user growth metrics and subscriptions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Registered Users"
            value={stats?.registeredUsers || 0}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="Active Tycoon"
            value={stats?.activeTycoon || 0}
            icon={UserCheck}
            color="emerald"
          />
          <StatCard
            title="Active Oga Boss"
            value={stats?.activeOgaBoss || 0}
            icon={Crown}
            color="purple"
          />
           <StatCard
            title="Users on Trial"
            value={stats?.onTrial || 0}
            icon={UserPlus}
            color="orange"
          />
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: any) {
    const colorStyles: any = {
        blue: "bg-blue-50 text-blue-700 border-blue-100",
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
        purple: "bg-purple-50 text-purple-700 border-purple-100",
        orange: "bg-orange-50 text-orange-700 border-orange-100"
    };

    return (
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex items-start justify-between hover:shadow-lg transition-shadow duration-300">
            <div>
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">{title}</p>
                <p className="text-4xl font-black text-slate-900 tracking-tight">{Number(value).toLocaleString()}</p>
            </div>
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${colorStyles[color]} border shadow-sm`}>
                <Icon size={24} />
            </div>
        </div>
    )
}
