'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import Preloader from '../../components/Preloader';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Wallet,
  Loader2,
  Menu,
  Crown,
  TrendingUp,
  CreditCard,
  Plus
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface AdsUser {
  planType?: string;
  walletBalance?: number;
  [key: string]: unknown;
}

interface AdsPlan {
  id: string;
  durationDays: number;
  price: number;
  label: string;
}

const getAxiosMessage = (err: unknown) => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; error?: string } | undefined;
    return data?.message || data?.error || '';
  }
  return '';
};

function AdsManagerContent() {
  const [user, setUser] = useState<AdsUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [fundingAmount, setFundingAmount] = useState('');
  const [funding, setFunding] = useState(false);
  const [adsPlans, setAdsPlans] = useState<AdsPlan[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();

  const getTokenOrRedirect = useCallback(() => {
    const token = getCookie('tallyToken');
    if (!token) router.push('/login');
    return token;
  }, [router]);

  const isTycoon = String(user?.planType || '').toUpperCase() === 'TYCOON';

  useEffect(() => {
    const token = getTokenOrRedirect();
    if (!token) return;

    const fetchData = async () => {
      try {
        const reference = searchParams.get('reference') || searchParams.get('trxref');
        
        if (reference) {
          // Verify payment first before fetching dashboard data
          try {
            const verifyRes = await axios.post(`${API_URL}/ads/wallet/verify/${encodeURIComponent(reference)}`, {}, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (typeof verifyRes.data?.walletBalance === 'number') {
              setUser((prev) => ({ ...(prev || {}), walletBalance: verifyRes.data.walletBalance }));
            }
            Swal.fire('Success', 'Wallet funded successfully!', 'success');
            router.replace('/ads-manager'); // Clear URL
          } catch (verifyErr: unknown) {
            console.error('Verify error:', verifyErr);
            Swal.fire(
              'Payment verification failed',
              getAxiosMessage(verifyErr) || 'Paystack completed the payment, but TallyPadi could not verify it yet. Please refresh this page or contact support with your Paystack reference.',
              'warning'
            );
          }
        }

        const [dashRes, plansRes] = await Promise.all([
          axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/ads/plans`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        
        setUser(dashRes.data?.user || {});
        setAdsPlans(plansRes.data?.plans || []);
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [getTokenOrRedirect, searchParams, router]);

  const handleFundWallet = async () => {
    const amount = Number(fundingAmount);
    if (!amount || amount < 100) {
      return Swal.fire('Error', 'Minimum funding amount is ₦100', 'error');
    }

    setFunding(true);
    try {
      const token = getTokenOrRedirect();
      const res = await axios.post(`${API_URL}/ads/wallet/fund`, { amount }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const { authorization_url } = res.data;
      if (authorization_url) {
        window.location.href = authorization_url;
      } else {
        Swal.fire('Error', 'Failed to initialize payment', 'error');
      }
    } catch (err: unknown) {
      console.error(err);
      Swal.fire('Error', getAxiosMessage(err) || 'Failed to fund wallet', 'error');
    } finally {
      setFunding(false);
    }
  };

  if (loading) return <Preloader />;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-x-hidden min-h-screen w-full">
        <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center justify-between p-4 sm:p-6 max-w-6xl mx-auto">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-xl">
                <Menu size={24} />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Ads Manager <TrendingUp className="text-emerald-500 hidden sm:block" size={24} />
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">Boost your products on TallyPadi Marketplace</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6">
          {!isTycoon && (
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 text-white shadow-lg mb-8 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <Crown size={24} className="text-amber-200" />
                  <h2 className="text-xl font-bold">Tycoon Plan Required</h2>
                </div>
                <p className="text-amber-50 max-w-2xl text-sm leading-relaxed mb-4">
                  The TallyPadi Marketplace is an exclusive feature for Tycoon users. Upgrade your plan to list and boost your products to thousands of daily visitors.
                </p>
                <button 
                  onClick={() => router.push('/settings')}
                  className="bg-white text-amber-600 px-6 py-2 rounded-xl text-sm font-bold shadow-md hover:scale-105 transition-all"
                >
                  Upgrade to Tycoon
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Wallet Card */}
            <div className="lg:col-span-1">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm h-full flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Ads Wallet</h2>
                    <p className="text-xs text-slate-500">Available Balance</p>
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-4xl font-black text-slate-900">
                    ₦{(user?.walletBalance || 0).toLocaleString()}
                  </h3>
                </div>

                <div className="mt-auto space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Amount to Fund</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₦</span>
                      <input
                        type="number"
                        value={fundingAmount}
                        onChange={(e) => setFundingAmount(e.target.value)}
                        placeholder="e.g. 5000"
                        className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-9 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleFundWallet}
                    disabled={funding || !isTycoon}
                    className="w-full flex justify-center items-center gap-2 bg-emerald-600 text-white rounded-xl py-3.5 text-sm font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {funding ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    Fund Wallet
                  </button>
                </div>
              </div>
            </div>

            {/* Pricing Plans */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 mb-1">Boost Pricing Plans</h2>
                <p className="text-sm text-slate-500 mb-6">Use your wallet balance to promote your products on the marketplace.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {adsPlans.map((plan) => (
                    <div key={plan.id} className="border border-slate-100 bg-slate-50 rounded-2xl p-5 hover:border-emerald-200 hover:bg-emerald-50/50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-slate-900">{plan.label}</h3>
                        <span className="bg-white px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-600 border border-emerald-100 shadow-sm">
                          {plan.durationDays} Day{plan.durationDays > 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="text-2xl font-black text-slate-900 mt-3">
                        ₦{plan.price.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 bg-blue-50 border border-blue-100 rounded-2xl p-5">
                  <div className="flex gap-3">
                    <div className="shrink-0 mt-0.5">
                      <CreditCard className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-blue-900">How Boosting Works</h4>
                      <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                        Boosted products appear at the very top of marketplace search results and category pages, and they will also be highly prioritized for indexing on search engines like <strong>Google</strong>. We also dynamically syndicate boosted listings to our external ad networks (including <strong>Meta Ads</strong> and <strong>TikTok</strong>). To boost a product, go to your <strong>Online Store</strong> settings, select a product, and click &quot;Boost Product&quot;. The cost will be deducted from your Ads Wallet.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default function AdsManagerPage() {
  return (
    <Suspense fallback={<Preloader />}>
      <AdsManagerContent />
    </Suspense>
  );
}
