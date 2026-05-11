'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import Preloader from '../../components/Preloader';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Crown,
  Loader2,
  Menu,
  PackagePlus,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Wallet,
  XCircle
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type CampaignStatus =
  | 'PENDING_ADMIN_REVIEW'
  | 'STARTING_SOON'
  | 'ACTIVE'
  | 'PARTIALLY_ACTIVE'
  | 'ACTIVE_WITH_PENDING_CHANGES'
  | 'PAUSED'
  | 'COMPLETED'
  | 'REJECTED_BY_TALLYPADI'
  | 'PARTIALLY_REJECTED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PENDING'
  | 'RUNNING'
  | 'REJECTED';
type StatusFilter = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'REJECTED';
type PlatformOption = 'ALL' | 'TALLYPADI_MARKETPLACE_BOOST' | 'META_ADS' | 'TIKTOK_ADS' | 'GOOGLE_ADS';

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

interface InventoryProduct {
  id: string;
  name: string;
  stock?: number;
  quantity?: number;
  price?: number;
  image?: string | null;
  category?: string | null;
  description?: string;
  boosts?: { platform: string; expiresAt: string; planId: string }[];
}

interface AdCampaign {
  id: string;
  status: CampaignStatus;
  platforms: string[];
  planId: string;
  planLabel: string;
  durationDays: number;
  basePrice: number;
  budget: number;
  walletCharged: boolean;
  refundAmount?: number | null;
  requestedAt: string;
  reviewedAt?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  completedAt?: string | null;
  rejectionReason?: string | null;
  productSnapshot: {
    name: string;
    description?: string;
    image?: string | null;
    price?: number;
    category?: string | null;
  };
}

interface BoostForm {
  planId: string;
  platform: PlatformOption;
  budget: string;
  brief: string;
  keywords: string;
}

interface NewProductForm {
  name: string;
  price: string;
  stock: string;
  category: string;
  description: string;
}

const defaultBoostForm: BoostForm = {
  planId: '',
  platform: 'ALL',
  budget: '',
  brief: '',
  keywords: '',
};

const defaultNewProductForm: NewProductForm = {
  name: '',
  price: '',
  stock: '1',
  category: '',
  description: '',
};

const getAxiosMessage = (err: unknown) => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; error?: string } | undefined;
    return data?.message || data?.error || '';
  }
  return '';
};

const formatCurrency = (amount?: number | null) => `₦${Number(amount || 0).toLocaleString()}`;

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const parseKeywords = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

const platformLabel = (platform: string) => {
  if (platform === 'TALLYPADI_MARKETPLACE_BOOST' || platform === 'TALLYPADI_SEO') return 'TallyPadi Marketplace Boost';
  if (platform === 'META_ADS' || platform === 'META') return 'Meta Ads';
  if (platform === 'TIKTOK_ADS' || platform === 'TIKTOK') return 'TikTok Ads';
  if (platform === 'GOOGLE_ADS' || platform === 'GOOGLE') return 'Google Ads';
  return platform;
};

const statusCopy: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  PENDING: { label: 'Pending Review', icon: Clock3, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  PENDING_ADMIN_REVIEW: { label: 'Pending Review', icon: Clock3, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  STARTING_SOON: { label: 'Starting Soon', icon: Clock3, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  RUNNING: { label: 'Active', icon: TrendingUp, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ACTIVE: { label: 'Active', icon: TrendingUp, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PARTIALLY_ACTIVE: { label: 'Partially Active', icon: TrendingUp, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ACTIVE_WITH_PENDING_CHANGES: { label: 'Active + Pending Edits', icon: TrendingUp, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PAUSED: { label: 'Paused', icon: Clock3, className: 'bg-slate-100 text-slate-700 border-slate-200' },
  COMPLETED: { label: 'Completed', icon: CheckCircle2, className: 'bg-slate-100 text-slate-700 border-slate-200' },
  REJECTED: { label: 'Rejected', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
  REJECTED_BY_TALLYPADI: { label: 'Rejected', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
  PARTIALLY_REJECTED: { label: 'Partially Rejected', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
  FAILED: { label: 'Failed', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: 'Cancelled', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
};

const statusGroups: Record<StatusFilter, CampaignStatus[]> = {
  PENDING: ['PENDING', 'PENDING_ADMIN_REVIEW'],
  RUNNING: ['RUNNING', 'ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON', 'ACTIVE_WITH_PENDING_CHANGES', 'PAUSED'],
  COMPLETED: ['COMPLETED'],
  REJECTED: ['REJECTED', 'REJECTED_BY_TALLYPADI', 'PARTIALLY_REJECTED', 'FAILED', 'CANCELLED'],
};

function AdsManagerContent() {
  const [user, setUser] = useState<AdsUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [fundingAmount, setFundingAmount] = useState('');
  const [funding, setFunding] = useState(false);
  const [adsPlans, setAdsPlans] = useState<AdsPlan[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [existingBoost, setExistingBoost] = useState<BoostForm>(defaultBoostForm);
  const [newBoost, setNewBoost] = useState<BoostForm>(defaultBoostForm);
  const [newProduct, setNewProduct] = useState<NewProductForm>(defaultNewProductForm);
  const [submittingExisting, setSubmittingExisting] = useState(false);
  const [submittingNew, setSubmittingNew] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const getTokenOrRedirect = useCallback(() => {
    const token = getCookie('tallyToken');
    if (!token) router.push('/login');
    return token;
  }, [router]);

  const isTycoon = String(user?.planType || '').toUpperCase() === 'TYCOON';

  const normalizeProducts = (payload: unknown): InventoryProduct[] => {
    if (Array.isArray(payload)) return payload as InventoryProduct[];
    const data = payload as { data?: InventoryProduct[] };
    return Array.isArray(data?.data) ? data.data : [];
  };

  const refreshData = useCallback(async (token: string) => {
    const [dashRes, plansRes, invRes, campaignsRes] = await Promise.all([
      axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${API_URL}/ads/plans`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${API_URL}/ads/campaigns?limit=100`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const loadedProducts = normalizeProducts(invRes.data);
    setUser(dashRes.data?.user || {});
    setAdsPlans(plansRes.data?.plans || []);
    setProducts(loadedProducts);
    setCampaigns(campaignsRes.data?.campaigns || []);
    setSelectedProductId((current) => current || loadedProducts[0]?.id || '');
  }, []);

  useEffect(() => {
    const token = getTokenOrRedirect();
    if (!token) return;

    const fetchData = async () => {
      try {
        const reference = searchParams.get('reference') || searchParams.get('trxref');

        if (reference) {
          try {
            const verifyRes = await axios.post(`${API_URL}/ads/wallet/verify/${encodeURIComponent(reference)}`, {}, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (typeof verifyRes.data?.walletBalance === 'number') {
              setUser((prev) => ({ ...(prev || {}), walletBalance: verifyRes.data.walletBalance }));
            }
            Swal.fire('Success', 'Wallet funded successfully!', 'success');
            router.replace('/ads-manager');
          } catch (verifyErr: unknown) {
            Swal.fire(
              'Payment verification failed',
              getAxiosMessage(verifyErr) || 'Paystack completed the payment, but TallyPadi could not verify it yet. Please refresh this page or contact support with your Paystack reference.',
              'warning'
            );
          }
        }

        await refreshData(token);
      } catch (err) {
        console.error('Fetch error:', err);
        Swal.fire('Error', getAxiosMessage(err) || 'Failed to load ads manager', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [getTokenOrRedirect, searchParams, router, refreshData]);

  const selectedExistingPlan = useMemo(
    () => adsPlans.find((plan) => plan.id === existingBoost.planId),
    [adsPlans, existingBoost.planId]
  );

  const selectedNewPlan = useMemo(
    () => adsPlans.find((plan) => plan.id === newBoost.planId),
    [adsPlans, newBoost.planId]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      const text = `${product.name} ${product.category || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [products, productSearch]);

  const campaignCounts = useMemo(() => campaigns.reduce((acc, campaign) => {
    acc[campaign.status] = (acc[campaign.status] || 0) + 1;
    return acc;
  }, {} as Record<CampaignStatus, number>), [campaigns]);

  const getStatusCount = (filter: StatusFilter) => statusGroups[filter].reduce((sum, status) => sum + (campaignCounts[status] || 0), 0);

  const visibleCampaigns = campaigns.filter((campaign) => statusGroups[statusFilter].includes(campaign.status));

  const setBoostPlan = (planId: string, form: BoostForm, setter: React.Dispatch<React.SetStateAction<BoostForm>>) => {
    const plan = adsPlans.find((item) => item.id === planId);
    const currentBudget = Number(form.budget);
    setter({
      ...form,
      planId,
      budget: plan && (!currentBudget || currentBudget < plan.price) ? String(plan.price) : form.budget,
    });
  };

  const validateBoost = (form: BoostForm, plan?: AdsPlan) => {
    if (!plan) {
      Swal.fire('Select a duration', 'Choose an ads plan before submitting.', 'warning');
      return null;
    }

    const budget = Number(form.budget || plan.price);
    if (!Number.isFinite(budget) || budget <= 0) {
      Swal.fire('Invalid budget', 'Enter a valid ads budget.', 'warning');
      return null;
    }

    if (budget < plan.price) {
      Swal.fire('Budget too low', `Budget must be at least ${formatCurrency(plan.price)} for this plan.`, 'warning');
      return null;
    }

    if ((user?.walletBalance || 0) < budget) {
      Swal.fire('Insufficient Balance', 'Please fund your Ads Wallet before requesting this boost.', 'warning');
      return null;
    }

    return budget;
  };

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

  const submitBoostRequest = async (productId: string, form: BoostForm, plan?: AdsPlan) => {
    const budget = validateBoost(form, plan);
    if (!budget) return null;

    const token = getTokenOrRedirect();
    const res = await axios.post(`${API_URL}/ads/boost/${productId}`, {
      planId: form.planId,
      platform: form.platform,
      budget,
      adDetails: {
        brief: form.brief.trim(),
        keywords: parseKeywords(form.keywords),
      },
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (typeof res.data?.walletBalance === 'number') {
      setUser((prev) => ({ ...(prev || {}), walletBalance: res.data.walletBalance }));
    }
    if (res.data?.campaign) {
      setCampaigns((prev) => [res.data.campaign, ...prev.filter((item) => item.id !== res.data.campaign.id)]);
      setStatusFilter('PENDING');
    }
    return res.data;
  };

  const handleBoostExisting = async () => {
    if (!selectedProductId) {
      return Swal.fire('Select a product', 'Choose one of your store products to boost.', 'warning');
    }

    setSubmittingExisting(true);
    try {
      await submitBoostRequest(selectedProductId, existingBoost, selectedExistingPlan);
      setExistingBoost(defaultBoostForm);
      Swal.fire('Submitted', 'Boost request is pending admin review.', 'success');
      const token = getTokenOrRedirect();
      if (token) await refreshData(token);
    } catch (err: unknown) {
      console.error(err);
      Swal.fire('Error', getAxiosMessage(err) || 'Failed to submit boost request', 'error');
    } finally {
      setSubmittingExisting(false);
    }
  };

  const handleCreateAndBoost = async () => {
    const name = newProduct.name.trim();
    const price = Number(newProduct.price);
    const stock = Number(newProduct.stock || 0);

    if (!name) return Swal.fire('Product name required', 'Enter a product name before boosting.', 'warning');
    if (!Number.isFinite(price) || price <= 0) return Swal.fire('Product price required', 'Enter a valid selling price.', 'warning');

    setSubmittingNew(true);
    try {
      const token = getTokenOrRedirect();
      const createRes = await axios.post(`${API_URL}/inventory`, {
        name,
        price,
        stock: Number.isFinite(stock) ? stock : 0,
        costPrice: 0,
        category: newProduct.category.trim(),
        description: newProduct.description.trim(),
        isPublished: true,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const productId = createRes.data?.id;
      if (!productId) throw new Error('Product was created without an ID');

      await submitBoostRequest(productId, newBoost, selectedNewPlan);
      setNewProduct(defaultNewProductForm);
      setNewBoost(defaultBoostForm);
      Swal.fire('Submitted', 'Product created and boost request is pending admin review.', 'success');
      if (token) await refreshData(token);
    } catch (err: unknown) {
      console.error(err);
      Swal.fire('Error', getAxiosMessage(err) || 'Failed to create and boost product', 'error');
    } finally {
      setSubmittingNew(false);
    }
  };

  if (loading) return <Preloader />;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 relative">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 overflow-x-hidden min-h-screen w-full">
        <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center justify-between p-4 sm:p-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                <Menu size={24} />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Ads Manager <TrendingUp className="text-emerald-500 hidden sm:block" size={24} />
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">Wallet, campaign requests, and boost history</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
          {!isTycoon && (
            <div className="bg-amber-500 rounded-lg p-6 text-white shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <Crown size={24} className="text-amber-100" />
                <h2 className="text-lg font-bold">Tycoon Plan Required</h2>
              </div>
              <p className="text-amber-50 max-w-2xl text-sm leading-relaxed mb-4">
                Ads boosts are available for Tycoon users. Upgrade your plan to request marketplace and social platform boosts.
              </p>
              <button
                onClick={() => router.push('/settings')}
                className="bg-white text-amber-700 px-5 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-amber-50 transition-colors"
              >
                Upgrade to Tycoon
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
            <section className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Ads Wallet</h2>
                    <p className="text-xs text-slate-500">Available balance</p>
                  </div>
                </div>

                <h3 className="text-4xl font-black text-slate-900 mb-6">
                  {formatCurrency(user?.walletBalance || 0)}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Amount to Fund</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₦</span>
                      <input
                        type="number"
                        value={fundingAmount}
                        onChange={(e) => setFundingAmount(e.target.value)}
                        placeholder="e.g. 5000"
                        className="w-full border border-slate-200 bg-slate-50 rounded-lg pl-9 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleFundWallet}
                    disabled={funding || !isTycoon}
                    className="w-full flex justify-center items-center gap-2 bg-emerald-600 text-white rounded-lg py-3.5 text-sm font-bold shadow-sm hover:bg-emerald-700 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    {funding ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    Fund Wallet
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-4">Admin Minimums</h2>
                <div className="space-y-3">
                  {adsPlans.map((plan) => (
                    <div key={plan.id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-lg p-3 bg-slate-50">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{plan.label}</p>
                        <p className="text-xs text-slate-500">{plan.durationDays} day{plan.durationDays > 1 ? 's' : ''}</p>
                      </div>
                      <p className="font-black text-slate-900">{formatCurrency(plan.price)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-5">
                    <PackagePlus size={20} className="text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Create Product to Boost</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        value={newProduct.name}
                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                        placeholder="Product name"
                        className="sm:col-span-2 border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <input
                        type="number"
                        value={newProduct.price}
                        onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                        placeholder="Price"
                        className="border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <input
                        type="number"
                        value={newProduct.stock}
                        onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                        placeholder="Stock"
                        className="border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <input
                        value={newProduct.category}
                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                        placeholder="Category"
                        className="sm:col-span-2 border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <textarea
                        value={newProduct.description}
                        onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                        placeholder="Product details"
                        rows={3}
                        className="sm:col-span-2 border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    <BoostControls
                      form={newBoost}
                      plans={adsPlans}
                      selectedPlan={selectedNewPlan}
                      onPlanChange={(planId) => setBoostPlan(planId, newBoost, setNewBoost)}
                      onChange={setNewBoost}
                    />

                    <button
                      onClick={handleCreateAndBoost}
                      disabled={submittingNew || !isTycoon}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submittingNew ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                      Create Product & Submit Boost
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-5">
                    <Search size={20} className="text-emerald-600" />
                    <h2 className="text-base font-bold text-slate-900">Boost Existing Product</h2>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search products"
                      className="w-full pl-9 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1 mb-4">
                    {filteredProducts.length === 0 ? (
                      <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500">
                        No products found.
                      </div>
                    ) : filteredProducts.map((product) => {
                      const selected = selectedProductId === product.id;
                      return (
                        <button
                          key={product.id}
                          onClick={() => setSelectedProductId(product.id)}
                          className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}
                        >
                          <div className="w-11 h-11 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                            {product.image ? <img src={product.image} alt="" className="w-full h-full object-cover" /> : <PackagePlus size={18} className="text-slate-400" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-slate-900 truncate">{product.name}</p>
                            <p className="text-xs text-slate-500">Stock {product.stock ?? product.quantity ?? 0} · {formatCurrency(product.price || 0)}</p>
                          </div>
                          {(product.boosts || []).length > 0 && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-1">Active</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <BoostControls
                    form={existingBoost}
                    plans={adsPlans}
                    selectedPlan={selectedExistingPlan}
                    onPlanChange={(planId) => setBoostPlan(planId, existingBoost, setExistingBoost)}
                    onChange={setExistingBoost}
                  />

                  <button
                    onClick={handleBoostExisting}
                    disabled={submittingExisting || !selectedProductId || !isTycoon}
                    className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {submittingExisting ? <Loader2 size={17} className="animate-spin" /> : <TrendingUp size={17} />}
                    Submit Boost for Review
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 border-b border-slate-100">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Boost Requests & History</h2>
                    <p className="text-xs text-slate-500 mt-1">Pending, active, completed, and rejected ads boosts</p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex gap-2">
                    {(['PENDING', 'RUNNING', 'COMPLETED', 'REJECTED'] as StatusFilter[]).map((status) => {
                      const config = statusCopy[status];
                      const Icon = config.icon;
                      return (
                        <button
                          key={status}
                          onClick={() => setStatusFilter(status)}
                          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${statusFilter === status ? config.className : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        >
                          <Icon size={14} />
                          {status === 'RUNNING' ? 'Active' : config.label.replace(' Review', '')}
                          <span className="rounded-full bg-white/70 px-1.5 py-0.5">{getStatusCount(status)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-6 space-y-3">
                  {visibleCampaigns.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
                      <AlertCircle className="mx-auto mb-3 text-slate-300" size={28} />
                      <p className="text-sm font-semibold text-slate-600">No {statusCopy[statusFilter].label.toLowerCase()} boosts yet.</p>
                    </div>
                  ) : visibleCampaigns.map((campaign) => {
                    const config = statusCopy[campaign.status] || statusCopy.RUNNING;
                    const Icon = config.icon;
                    return (
                      <article key={campaign.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${config.className}`}>
                                <Icon size={13} />
                                {config.label}
                              </span>
                              {campaign.platforms.map((platform) => (
                                <span key={platform} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                                  {platformLabel(platform)}
                                </span>
                              ))}
                            </div>
                            <h3 className="font-black text-slate-900 truncate">{campaign.productSnapshot?.name || 'Product boost'}</h3>
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{campaign.productSnapshot?.description || campaign.planLabel}</p>
                            {campaign.rejectionReason && (
                              <p className="text-sm text-red-600 mt-2">Reason: {campaign.rejectionReason}</p>
                            )}
                          </div>
                          <div className="md:text-right shrink-0">
                            <p className="text-2xl font-black text-slate-900">{formatCurrency(campaign.budget)}</p>
                            <p className="text-xs text-slate-500">{campaign.planLabel}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs">
                          <InfoLine label="Requested" value={formatDate(campaign.requestedAt)} />
                          <InfoLine label="Started" value={formatDate(campaign.startedAt)} />
                          <InfoLine label={campaign.status === 'REJECTED' ? 'Refunded' : 'Ends'} value={campaign.status === 'REJECTED' ? formatCurrency(campaign.refundAmount || 0) : formatDate(campaign.expiresAt || campaign.completedAt)} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function BoostControls({
  form,
  plans,
  selectedPlan,
  onPlanChange,
  onChange,
}: {
  form: BoostForm;
  plans: AdsPlan[];
  selectedPlan?: AdsPlan;
  onPlanChange: (planId: string) => void;
  onChange: React.Dispatch<React.SetStateAction<BoostForm>>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Platform</span>
          <select
            value={form.platform}
            onChange={(e) => onChange((prev) => ({ ...prev, platform: e.target.value as PlatformOption }))}
            className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">All Platforms</option>
            <option value="TALLYPADI_MARKETPLACE_BOOST">TallyPadi Marketplace Boost</option>
            <option value="META_ADS">Meta Ads</option>
            <option value="TIKTOK_ADS">TikTok Ads</option>
            <option value="GOOGLE_ADS">Google Ads</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Duration</span>
          <select
            value={form.planId}
            onChange={(e) => onPlanChange(e.target.value)}
            className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="">Choose plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Budget</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₦</span>
            <input
              type="number"
              min={selectedPlan?.price || 0}
              value={form.budget}
              onChange={(e) => onChange((prev) => ({ ...prev, budget: e.target.value }))}
              placeholder={selectedPlan ? String(selectedPlan.price) : '0'}
              className="w-full border border-slate-200 bg-slate-50 rounded-lg pl-8 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </label>
      </div>

      <label className="block">
        <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Ad Search Notes</span>
        <textarea
          value={form.brief}
          onChange={(e) => onChange((prev) => ({ ...prev, brief: e.target.value }))}
          placeholder="What should the ad emphasize? Include model, condition, delivery, target area, or buyer questions."
          rows={3}
          className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Search Keywords</span>
        <input
          value={form.keywords}
          onChange={(e) => onChange((prev) => ({ ...prev, keywords: e.target.value }))}
          placeholder="e.g. smart tv, used fridge, lekki phone shop"
          className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </label>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
      <p className="font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="font-semibold text-slate-700 mt-1">{value}</p>
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
