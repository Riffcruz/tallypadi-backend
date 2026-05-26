'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import Preloader from '../../components/Preloader';
import { getCookie } from '../../utils/cookies';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  Coins,
  CreditCard,
  Loader2,
  Megaphone,
  Menu,
  TrendingDown,
  Wallet,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type ActivityType = 'WALLET_FUNDING' | 'AD_BOOST' | 'SUBSCRIPTION' | 'REFERRAL_REWARD' | 'LOW_STOCK' | 'EXPENSE' | 'OTHER';

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  message: string;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  actor?: {
    name?: string;
    role?: string | null;
  } | null;
}

const formatCurrency = (amount: number, currencyCode = 'NGN', locale = 'en-NG') => {
  const safe = Number(amount) || 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(safe);
};

const getActivityIcon = (type: ActivityType) => {
  if (type === 'WALLET_FUNDING') return Wallet;
  if (type === 'AD_BOOST') return Megaphone;
  if (type === 'SUBSCRIPTION') return CreditCard;
  if (type === 'REFERRAL_REWARD') return Coins;
  if (type === 'LOW_STOCK') return AlertCircle;
  if (type === 'EXPENSE') return TrendingDown;
  return Bell;
};

const getActivityAccent = (type: ActivityType) => {
  if (type === 'WALLET_FUNDING') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (type === 'AD_BOOST') return 'bg-indigo-50 text-indigo-700 border-indigo-100';
  if (type === 'SUBSCRIPTION') return 'bg-purple-50 text-purple-700 border-purple-100';
  if (type === 'REFERRAL_REWARD') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (type === 'LOW_STOCK') return 'bg-red-50 text-red-700 border-red-100';
  if (type === 'EXPENSE') return 'bg-orange-50 text-orange-700 border-orange-100';
  return 'bg-slate-50 text-slate-700 border-slate-100';
};

const getTypeLabel = (type: ActivityType) => {
  if (type === 'WALLET_FUNDING') return 'Wallet';
  if (type === 'AD_BOOST') return 'Ads Boost';
  if (type === 'SUBSCRIPTION') return 'Subscription';
  if (type === 'REFERRAL_REWARD') return 'Referral';
  if (type === 'LOW_STOCK') return 'Inventory';
  if (type === 'EXPENSE') return 'Expense';
  return 'Other';
};

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  const authHeaders = () => {
    const token = getCookie('tallyToken');
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const loadActivities = async (pageToLoad = 1) => {
    const headers = authHeaders();
    if (!headers) {
      router.push('/login');
      return;
    }

    try {
      if (pageToLoad === 1) setLoading(true);
      else setLoadingMore(true);

      const res = await axios.get(`${API_URL}/activities?page=${pageToLoad}&limit=20`, { headers });
      const nextActivities = res.data?.activities || [];

      setActivities((prev) => pageToLoad === 1 ? nextActivities : [...prev, ...nextActivities]);
      setPage(Number(res.data?.page || pageToLoad));
      setTotalPages(Number(res.data?.totalPages || 1));
      setUnreadCount(Number(res.data?.unreadCount || 0));
    } catch (err) {
      console.error('Activity fetch failed:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadActivities(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedCounts = useMemo(() => {
    return activities.reduce((acc: Record<ActivityType, number>, activity) => {
      acc[activity.type] = (acc[activity.type] || 0) + 1;
      return acc;
    }, {} as Record<ActivityType, number>);
  }, [activities]);

  const markActivityRead = async (activityId: string) => {
    const headers = authHeaders();
    if (!headers) return;

    const current = activities.find((activity) => activity.id === activityId);
    try {
      await axios.patch(`${API_URL}/activities/${activityId}/read`, {}, { headers });
      setActivities((prev) => prev.map((activity) => (
        activity.id === activityId ? { ...activity, isRead: true, readAt: new Date().toISOString() } : activity
      )));
      if (current && !current.isRead) setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      console.error('Mark activity read failed:', err);
    }
  };

  const markAllRead = async () => {
    const headers = authHeaders();
    if (!headers) return;

    try {
      await axios.patch(`${API_URL}/activities/read-all`, {}, { headers });
      setUnreadCount(0);
      setActivities((prev) => prev.map((activity) => ({ ...activity, isRead: true, readAt: activity.readAt || new Date().toISOString() })));
    } catch (err) {
      console.error('Mark all activities read failed:', err);
    }
  };

  if (loading) return <Preloader />;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 relative overflow-x-hidden">
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 min-h-screen w-full">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-xl md:hidden transition-all"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Activity</h1>
              <p className="text-sm font-semibold text-slate-500 mt-1">
                {unreadCount} unread
              </p>
            </div>
          </div>

          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="self-start md:self-auto inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-200 px-4 py-3 rounded-2xl text-sm font-black shadow-sm transition-all disabled:opacity-50 disabled:hover:text-slate-600 disabled:hover:border-slate-200"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        </header>

        {activities.length > 0 && (
          <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-3">
            {(['WALLET_FUNDING', 'AD_BOOST', 'SUBSCRIPTION', 'REFERRAL_REWARD', 'LOW_STOCK', 'EXPENSE'] as ActivityType[]).map((type) => {
              const Icon = getActivityIcon(type);
              return (
                <div key={type} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <div className={`h-9 w-9 rounded-xl border flex items-center justify-center ${getActivityAccent(type)}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{getTypeLabel(type)}</p>
                  <p className="text-2xl font-black text-slate-900 mt-0.5">{groupedCounts[type] || 0}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          {activities.length ? (
            <div className="divide-y divide-slate-100">
              {activities.map((activity) => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <button
                    key={activity.id}
                    onClick={() => markActivityRead(activity.id)}
                    className={`w-full text-left p-5 md:p-6 flex gap-4 transition-colors ${
                      activity.isRead ? 'hover:bg-slate-50' : 'bg-emerald-50/30 hover:bg-emerald-50/60'
                    }`}
                  >
                    <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center shrink-0 ${getActivityAccent(activity.type)}`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="font-black text-slate-900 truncate">{activity.title}</h2>
                            {!activity.isRead && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />}
                          </div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-1">
                            {getTypeLabel(activity.type)}
                            {activity.actor?.name ? ` · ${activity.actor.name}` : ''}
                          </p>
                        </div>

                        <div className="md:text-right shrink-0">
                          <p className="text-xs font-black text-slate-500">
                            {new Date(activity.createdAt).toLocaleString('en-NG', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {typeof activity.amount === 'number' && (
                            <p className="text-sm font-black text-slate-900 mt-1 tabular-nums">
                              {formatCurrency(activity.amount)}
                            </p>
                          )}
                        </div>
                      </div>

                      <p className="mt-3 text-sm font-semibold text-slate-600 leading-relaxed">{activity.message}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-20 text-center">
              <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-slate-300">
                <Bell className="w-7 h-7" />
              </div>
              <p className="mt-4 text-sm font-black uppercase tracking-widest text-slate-300">No activity yet</p>
            </div>
          )}
        </div>

        {page < totalPages && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => loadActivities(page + 1)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl text-sm font-black shadow-sm hover:bg-slate-800 disabled:opacity-60 transition-all"
            >
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
              Load more
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
