'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Check, Copy, Gift, Loader2, Menu, Trophy, Users, Wallet, X } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type ReferralTransaction = {
  id: string;
  status: string;
  referredUser?: {
    businessName?: string | null;
    name?: string | null;
    phoneNumber?: string | null;
  } | null;
  rewardAmount: number;
  fundingAmount: number;
  currency: string;
  createdAt?: string | null;
  rewardedAt?: string | null;
};

type ReferralSummary = {
  referralCode: string;
  referralLink: string;
  totals: {
    totalReferrals: number;
    pendingReferrals: number;
    successfulReferrals: number;
    totalEarned: number;
    currency: string;
  };
  transactions: ReferralTransaction[];
};

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

const statusClass = (status: string) => {
  if (status === 'REWARDED') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'PENDING_FUNDING') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-sky-50 text-sky-700 border-sky-100';
};

export default function ReferralsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currency = summary?.totals.currency || 'NGN';

  const stats = useMemo(() => [
    { label: 'Total earned', value: formatCurrency(summary?.totals.totalEarned || 0, currency), icon: Wallet },
    { label: 'Successful', value: String(summary?.totals.successfulReferrals || 0), icon: Trophy },
    { label: 'Pending', value: String(summary?.totals.pendingReferrals || 0), icon: Users },
  ], [summary, currency]);

  useEffect(() => {
    const token = getCookie('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    axios.get(`${API_URL}/referrals/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => setSummary(res.data))
      .catch((error) => {
        console.error('Referral summary failed:', error);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const copyLink = async () => {
    if (!summary?.referralLink) return;
    await navigator.clipboard.writeText(summary.referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <Sidebar />
      </div>

      <main className="md:ml-64">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-700"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="font-black text-slate-900">Referrals</span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-2 text-slate-400"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
          <div className="mb-7 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <Gift size={20} />
              <p className="text-xs font-black uppercase tracking-[0.18em]">Affiliate Program</p>
            </div>
            <h1 className="text-3xl font-black text-slate-950">Referrals</h1>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm md:p-6">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-sm font-bold text-slate-500">Your referral link</p>
                    <div className="mt-2 break-all rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm font-bold text-slate-900">
                      {summary?.referralLink || '-'}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500">Code: {summary?.referralCode || '-'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-700"
                  >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                {stats.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <item.icon size={20} />
                    </div>
                    <p className="text-sm font-bold text-slate-500">{item.label}</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{item.value}</p>
                  </div>
                ))}
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-lg font-black text-slate-950">Referral History</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {(summary?.transactions || []).length === 0 ? (
                    <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500">No referrals yet.</div>
                  ) : summary?.transactions.map((transaction) => (
                    <div key={transaction.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div>
                        <p className="font-black text-slate-950">
                          {transaction.referredUser?.businessName || transaction.referredUser?.name || transaction.referredUser?.phoneNumber || 'Referred user'}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {transaction.rewardedAt || transaction.createdAt ? new Date(transaction.rewardedAt || transaction.createdAt || '').toLocaleString() : ''}
                        </p>
                      </div>
                      <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass(transaction.status)}`}>
                        {transaction.status.replace(/_/g, ' ')}
                      </span>
                      <div className="text-left md:text-right">
                        <p className="text-xs font-bold text-slate-500">Reward</p>
                        <p className="font-black text-emerald-700">{formatCurrency(transaction.rewardAmount, transaction.currency)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
