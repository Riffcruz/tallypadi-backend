'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Gift, Loader2, RefreshCw, Search } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type ReferralUser = {
  id: string;
  businessName?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  referralCode?: string | null;
};

type ReferralRow = {
  id: string;
  status: string;
  referralCode: string;
  referrer?: ReferralUser | null;
  referredUser?: ReferralUser | null;
  fundingAmount: number;
  rewardAmount: number;
  currency: string;
  paystackReference?: string | null;
  rewardWalletTransactionId?: string | null;
  createdAt?: string | null;
  rewardedAt?: string | null;
};

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING_VERIFICATION', label: 'Pending verification' },
  { value: 'PENDING_FUNDING', label: 'Pending funding' },
  { value: 'REWARDED', label: 'Rewarded' },
  { value: 'INELIGIBLE', label: 'Ineligible' },
];

const formatCurrency = (amount: number, currencyCode = 'NGN') => {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  } catch {
    return `${currencyCode} ${Number(amount || 0).toLocaleString()}`;
  }
};

const userLabel = (user?: ReferralUser | null) =>
  user?.businessName || user?.name || user?.phoneNumber || user?.email || 'Unknown user';

const statusClass = (status: string) => {
  if (status === 'REWARDED') return 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20';
  if (status === 'PENDING_FUNDING') return 'bg-amber-500/10 text-amber-200 border-amber-500/20';
  if (status === 'PENDING_VERIFICATION') return 'bg-sky-500/10 text-sky-200 border-sky-500/20';
  return 'bg-slate-500/10 text-slate-200 border-slate-500/20';
};

export default function ReferralsTab({ adminToken }: { adminToken: string }) {
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  }), [adminToken]);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);

      const res = await axios.get(`${API_URL}/admin/referrals?${params.toString()}`, { headers });
      setRows(Array.isArray(res.data?.transactions) ? res.data.transactions : []);
      setTotal(Number(res.data?.total || 0));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchRows().catch((error) => console.error('Referral logs failed:', error));
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, headers]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-amber-300">
            <Gift size={20} />
            <p className="text-xs font-black uppercase tracking-[0.18em]">Affiliate Program</p>
          </div>
          <h2 className="mt-1 text-2xl font-extrabold text-white">Referral Logs</h2>
          <p className="mt-1 text-sm text-slate-400">{total.toLocaleString()} referral transaction{total === 1 ? '' : 's'}</p>
        </div>

        <button
          type="button"
          onClick={() => fetchRows().catch((error) => console.error(error))}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-slate-700"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search referrer, referred user, code, or payment reference"
            className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 text-sm font-semibold text-white placeholder:text-slate-500 outline-none focus:border-emerald-500"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-11 rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white outline-none focus:border-emerald-500"
        >
          {STATUSES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-4">Referrer</th>
                <th className="px-5 py-4">Referred user</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Funding</th>
                <th className="px-5 py-4">Reward</th>
                <th className="px-5 py-4">Reference</th>
                <th className="px-5 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading referral logs...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">No referral logs found.</td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-700/30">
                  <td className="px-5 py-4">
                    <div className="font-extrabold text-white">{userLabel(row.referrer)}</div>
                    <div className="text-xs text-slate-500">{row.referrer?.phoneNumber || row.referrer?.email || '-'}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-extrabold text-white">{userLabel(row.referredUser)}</div>
                    <div className="text-xs text-slate-500">{row.referredUser?.phoneNumber || row.referredUser?.email || '-'}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass(row.status)}`}>
                      {row.status.replace(/_/g, ' ')}
                    </span>
                    <div className="mt-1 text-xs text-slate-500">{row.referralCode}</div>
                  </td>
                  <td className="px-5 py-4 font-bold">{formatCurrency(row.fundingAmount, row.currency)}</td>
                  <td className="px-5 py-4 font-bold text-emerald-200">{formatCurrency(row.rewardAmount, row.currency)}</td>
                  <td className="px-5 py-4">
                    <div className="max-w-[190px] truncate font-mono text-xs text-slate-300">{row.paystackReference || '-'}</div>
                    <div className="max-w-[190px] truncate font-mono text-[11px] text-slate-500">{row.rewardWalletTransactionId || ''}</div>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-400">
                    {row.rewardedAt || row.createdAt ? new Date(row.rewardedAt || row.createdAt || '').toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
