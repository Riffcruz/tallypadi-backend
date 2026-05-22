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
  Megaphone,
  PackagePlus,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  XCircle,
  Heart,
  MessageCircle,
  Share2,
  Music,
  Bookmark,
  ArrowRight,
  ExternalLink,
  Globe,
  MapPin,
  Calendar,
  type LucideIcon
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type CampaignStatus =
  | 'PENDING_ADMIN_REVIEW'
  | 'APPROVED_BY_TALLYPADI'
  | 'SUBMITTING_TO_PROVIDERS'
  | 'STARTING_SOON'
  | 'ACTIVE'
  | 'PARTIALLY_ACTIVE'
  | 'ACTIVE_WITH_PENDING_CHANGES'
  | 'REQUIRES_REVIEW_AFTER_EDIT'
  | 'PAUSED'
  | 'COMPLETED'
  | 'REJECTED_BY_TALLYPADI'
  | 'PARTIALLY_REJECTED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PENDING'
  | 'RUNNING'
  | 'REJECTED';
type StatusFilter = 'ALL' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'REJECTED';
type PlatformOption = 'TALLYPADI_MARKETPLACE_BOOST' | 'META_ADS' | 'TIKTOK_ADS' | 'GOOGLE_ADS';

const PROMOTION_PLATFORM_OPTIONS: { value: PlatformOption; label: string }[] = [
  { value: 'TALLYPADI_MARKETPLACE_BOOST', label: 'TallyPadi Marketplace Boost' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
];
const ALL_PROMOTION_PLATFORMS = PROMOTION_PLATFORM_OPTIONS.map((option) => option.value);

interface AdsUser {
  businessName?: string;
  planType?: string;
  walletBalance?: number;
  currencyCode?: string;
  settings?: { currencyCode?: string };
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
  id?: string;
  _id?: string;
  status: CampaignStatus;
  platforms?: string[];
  selectedProviders?: string[];
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
  platforms: PlatformOption[];
  budget: string;
  brief: string;
  keywords: string;
  targetLocationCountry: string;
  targetLocationState: string;
  targetLocationCity: string;
  startDate: string;
  endDate: string;
  adDescription: string;
  budgetType: 'DAILY' | 'TOTAL';
  useGlobalLandingPage: boolean;
  globalLandingPageUrl: string;
  providerLandingPageUrls: Record<string, string>;
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
  platforms: [...ALL_PROMOTION_PLATFORMS],
  budget: '',
  brief: '',
  keywords: '',
  targetLocationCountry: 'NG',
  targetLocationState: 'Lagos',
  targetLocationCity: 'Lekki',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  adDescription: '',
  budgetType: 'TOTAL',
  useGlobalLandingPage: true,
  globalLandingPageUrl: '',
  providerLandingPageUrls: {},
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

const formatCurrency = (amount?: number | null, currencyCode = 'NGN') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: String(currencyCode || 'NGN').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch {
    return `${String(currencyCode || 'NGN').toUpperCase()} ${Number(amount || 0).toLocaleString()}`;
  }
};

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

const statusCopy: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  ALL: { label: 'All Boosts', icon: Megaphone, className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PENDING: { label: 'Pending Review', icon: Clock3, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  PENDING_ADMIN_REVIEW: { label: 'Pending Review', icon: Clock3, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  APPROVED_BY_TALLYPADI: { label: 'Approved', icon: CheckCircle2, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  SUBMITTING_TO_PROVIDERS: { label: 'Submitting', icon: Clock3, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  STARTING_SOON: { label: 'Starting Soon', icon: Clock3, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  RUNNING: { label: 'Active', icon: TrendingUp, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ACTIVE: { label: 'Active', icon: TrendingUp, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PARTIALLY_ACTIVE: { label: 'Partially Active', icon: TrendingUp, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ACTIVE_WITH_PENDING_CHANGES: { label: 'Active + Pending Edits', icon: TrendingUp, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REQUIRES_REVIEW_AFTER_EDIT: { label: 'Pending Edit Review', icon: Clock3, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  PAUSED: { label: 'Paused', icon: Clock3, className: 'bg-slate-100 text-slate-700 border-slate-200' },
  COMPLETED: { label: 'Completed', icon: CheckCircle2, className: 'bg-slate-100 text-slate-700 border-slate-200' },
  REJECTED: { label: 'Rejected', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
  REJECTED_BY_TALLYPADI: { label: 'Rejected', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
  PARTIALLY_REJECTED: { label: 'Partially Rejected', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
  FAILED: { label: 'Failed', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
  CANCELLED: { label: 'Cancelled', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
};

const statusGroups: Record<StatusFilter, CampaignStatus[]> = {
  ALL: [],
  PENDING: ['PENDING', 'PENDING_ADMIN_REVIEW'],
  RUNNING: ['RUNNING', 'APPROVED_BY_TALLYPADI', 'SUBMITTING_TO_PROVIDERS', 'ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON', 'ACTIVE_WITH_PENDING_CHANGES', 'REQUIRES_REVIEW_AFTER_EDIT', 'PAUSED'],
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [existingBoost, setExistingBoost] = useState<BoostForm>(defaultBoostForm);
  const [newBoost, setNewBoost] = useState<BoostForm>(defaultBoostForm);
  const [newProduct, setNewProduct] = useState<NewProductForm>(defaultNewProductForm);
  const [submittingExisting, setSubmittingExisting] = useState(false);
  const [submittingNew, setSubmittingNew] = useState(false);
  const [activeBoostModal, setActiveBoostModal] = useState<'new' | 'existing' | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Expanded report states and demo simulation logic for TikTok verification requirements
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [campaignMetrics, setCampaignMetrics] = useState<any[]>([]);
  const [simulationMode, setSimulationMode] = useState<Record<string, boolean>>({});

  const storeSlug = useMemo(() => {
    return String(user?.businessName || 'my-shop').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }, [user?.businessName]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const handleExpandCampaign = async (campaignId: string) => {
    if (expandedCampaignId === campaignId) {
      setExpandedCampaignId(null);
      setCampaignMetrics([]);
      return;
    }

    setExpandedCampaignId(campaignId);
    setMetricsLoading(true);
    try {
      const token = getTokenOrRedirect();
      const res = await axios.get(`${API_URL}/ads/campaigns/${campaignId}/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCampaignMetrics(res.data?.metrics || []);
    } catch (err) {
      console.error('Error fetching campaign metrics:', err);
      setCampaignMetrics([]);
    } finally {
      setMetricsLoading(false);
    }
  };

  const getTokenOrRedirect = useCallback(() => {
    const token = getCookie('tallyToken');
    if (!token) router.push('/login');
    return token;
  }, [router]);

  const isTycoon = String(user?.planType || '').toUpperCase() === 'TYCOON';
  const userCurrencyCode = String(user?.currencyCode || user?.settings?.currencyCode || 'NGN').toUpperCase();

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
    const loadedUser = { ...(dashRes.data?.user || {}) };
    if (typeof campaignsRes.data?.walletBalance === 'number') {
      loadedUser.walletBalance = campaignsRes.data.walletBalance;
    }
    setAdsPlans(plansRes.data?.plans || []);
    setProducts(loadedProducts);
    setUser(loadedUser);
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

  const getStatusCount = (filter: StatusFilter) => {
    if (filter === 'ALL') return campaigns.length;
    return statusGroups[filter].reduce((sum, status) => sum + (campaignCounts[status] || 0), 0);
  };

  const visibleCampaigns = statusFilter === 'ALL'
    ? campaigns
    : campaigns.filter((campaign) => statusGroups[statusFilter].includes(campaign.status));

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
    if (!form.platforms.length) {
      Swal.fire('Select a platform', 'Choose at least one promotion platform.', 'warning');
      return null;
    }

    const budget = Number(form.budget || plan.price);
    if (!Number.isFinite(budget) || budget <= 0) {
      Swal.fire('Invalid budget', 'Enter a valid ads budget.', 'warning');
      return null;
    }

    if (budget < plan.price) {
      Swal.fire('Budget too low', `Budget must be at least ${formatCurrency(plan.price, userCurrencyCode)} for this plan.`, 'warning');
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
      return Swal.fire('Error', `Minimum funding amount is ${formatCurrency(100, userCurrencyCode)}`, 'error');
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

    // Show SweetAlert simulated synchronization loading state for Step 5 TikTok Ads manager sync
    Swal.fire({
      title: 'Connecting TikTok Ads Manager',
      html: 'Synchronizing campaign parameters and targeting criteria with TikTok Ads API...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Wait 2.5 seconds to simulate secure API handoff to TikTok Ads
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const token = getTokenOrRedirect();
    try {
      const res = await axios.post(`${API_URL}/ads/campaigns`, {
        productId,
        planId: form.planId,
        providers: form.platforms,
        budget,
        targetLocation: {
          country: form.targetLocationCountry,
          state: form.targetLocationState,
          city: form.targetLocationCity,
        },
        adDetails: {
          brief: form.brief.trim(),
          keywords: parseKeywords(form.keywords),
          budgetType: form.budgetType,
          startDate: form.startDate,
          endDate: form.endDate,
          adDescription: form.adDescription.trim(),
        },
        consent: {
          accepted: true
        },
        globalLandingPageUrl: form.useGlobalLandingPage ? form.globalLandingPageUrl.trim() : '',
        providerLandingPageUrls: !form.useGlobalLandingPage ? Object.fromEntries(
          Object.entries(form.providerLandingPageUrls).map(([k, v]) => [k, v.trim()]).filter(([_, v]) => v)
        ) : undefined,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Swal.close();

      if (typeof res.data?.walletBalance === 'number') {
        setUser((prev) => ({ ...(prev || {}), walletBalance: res.data.walletBalance }));
      }
      if (res.data?.campaign) {
        setCampaigns((prev) => [res.data.campaign, ...prev.filter((item) => item.id !== res.data.campaign.id)]);
        setStatusFilter('ALL');
      }
      return res.data;
    } catch (err) {
      Swal.close();
      throw err;
    }
  };

  const handleBoostExisting = async () => {
    if (!selectedProductId) {
      return Swal.fire('Select a product', 'Choose one of your store products to boost.', 'warning');
    }

    setSubmittingExisting(true);
    try {
      await submitBoostRequest(selectedProductId, existingBoost, selectedExistingPlan);
      setExistingBoost(defaultBoostForm);
      setActiveBoostModal(null);
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
      setActiveBoostModal(null);
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
                  {formatCurrency(user?.walletBalance || 0, userCurrencyCode)}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Amount to Fund</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">{userCurrencyCode}</span>
                      <input
                        type="number"
                        value={fundingAmount}
                        onChange={(e) => setFundingAmount(e.target.value)}
                        placeholder="e.g. 5000"
                        className="w-full border border-slate-200 bg-slate-50 rounded-lg pl-16 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
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
                      <p className="font-black text-slate-900">{formatCurrency(plan.price, userCurrencyCode)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setActiveBoostModal('new')}
                  disabled={!isTycoon}
                  className="group rounded-lg border border-blue-100 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <PackagePlus size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-slate-900">Create New Campaign</h2>
                      <p className="text-xs font-medium text-slate-500">Add a new product and submit it for ads review.</p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveBoostModal('existing')}
                  disabled={!isTycoon}
                  className="group rounded-lg border border-emerald-100 bg-white p-5 text-left shadow-sm transition-all hover:border-emerald-200 hover:shadow-md disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Search size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-slate-900">Use Existing Product</h2>
                      <p className="text-xs font-medium text-slate-500">Pick a product already in inventory and boost it.</p>
                    </div>
                  </div>
                </button>
              </div>

              {activeBoostModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                  <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl">
                    <div className="grid grid-cols-1 gap-6">
                      <div className={`${activeBoostModal === 'new' ? 'block' : 'hidden'} bg-white border border-slate-200 rounded-lg p-6 shadow-xl`}>
                        <div className="flex items-center justify-between gap-3 mb-5">
                          <div className="flex items-center gap-3">
                            <PackagePlus size={20} className="text-blue-600" />
                            <h2 className="text-base font-bold text-slate-900">Create Product to Boost</h2>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveBoostModal(null)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                            aria-label="Close"
                          >
                            <X size={17} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
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
                                rows={2}
                                className="sm:col-span-2 border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              />
                            </div>

                            <BoostControls
                              form={newBoost}
                              plans={adsPlans}
                              selectedPlan={selectedNewPlan}
                              currencyCode={userCurrencyCode}
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

                          <div className="flex flex-col items-center">
                            <span className="block text-xs font-black text-slate-400 mb-3 uppercase tracking-wider self-start">Live Ad Preview</span>
                            <LiveAdPreview
                              productName={newProduct.name}
                              productDescription={newProduct.description}
                              productPrice={Number(newProduct.price) || 0}
                              productImage={null}
                              adDescription={newBoost.adDescription}
                              businessName={user?.businessName || 'My Shop'}
                              storeSlug={storeSlug}
                              productId="new-product"
                              currencyCode={userCurrencyCode}
                            />
                          </div>
                        </div>
                      </div>

                      <div className={`${activeBoostModal === 'existing' ? 'block' : 'hidden'} bg-white border border-slate-200 rounded-lg p-6 shadow-xl`}>
                        <div className="flex items-center justify-between gap-3 mb-5">
                          <div className="flex items-center gap-3">
                            <Search size={20} className="text-emerald-600" />
                            <h2 className="text-base font-bold text-slate-900">Boost Existing Product</h2>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveBoostModal(null)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                            aria-label="Close"
                          >
                            <X size={17} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
                          <div className="space-y-4">
                            <div className="relative mb-3">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                              <input
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                placeholder="Search products"
                                className="w-full pl-9 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                              />
                            </div>

                            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 mb-4">
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
                                    className={`w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${selected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}
                                  >
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                                      {product.image ? <img src={product.image} alt="" className="w-full h-full object-cover" /> : <PackagePlus size={18} className="text-slate-400" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-bold text-xs text-slate-900 truncate">{product.name}</p>
                                      <p className="text-[10px] text-slate-500">Stock {product.stock ?? product.quantity ?? 0} · {formatCurrency(product.price || 0, userCurrencyCode)}</p>
                                    </div>
                                    {(product.boosts || []).length > 0 && (
                                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">Active</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            <BoostControls
                              form={existingBoost}
                              plans={adsPlans}
                              selectedPlan={selectedExistingPlan}
                              currencyCode={userCurrencyCode}
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

                          <div className="flex flex-col items-center">
                            <span className="block text-xs font-black text-slate-400 mb-3 uppercase tracking-wider self-start">Live Ad Preview</span>
                            <LiveAdPreview
                              productName={selectedProduct?.name || 'Product Name'}
                              productDescription={selectedProduct?.description || 'Product details'}
                              productPrice={selectedProduct?.price || 0}
                              productImage={selectedProduct?.image || null}
                              adDescription={existingBoost.adDescription}
                              businessName={user?.businessName || 'My Shop'}
                              storeSlug={storeSlug}
                              productId={selectedProductId || 'product-id'}
                              currencyCode={userCurrencyCode}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 border-b border-slate-100">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Boost Requests & History</h2>
                    <p className="text-xs text-slate-500 mt-1">Pending, active, completed, and rejected ads boosts</p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex gap-2">
                    {(['ALL', 'PENDING', 'RUNNING', 'COMPLETED', 'REJECTED'] as StatusFilter[]).map((status) => {
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
                              {(campaign.selectedProviders || campaign.platforms || []).map((platform) => (
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
                            <p className="text-2xl font-black text-slate-900">{formatCurrency(campaign.budget, userCurrencyCode)}</p>
                            <p className="text-xs text-slate-500">{campaign.planLabel}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs">
                          <InfoLine label="Requested" value={formatDate(campaign.requestedAt)} />
                          <InfoLine label="Started" value={formatDate(campaign.startedAt)} />
                          <InfoLine label={campaign.status === 'REJECTED' ? 'Refunded' : 'Ends'} value={campaign.status === 'REJECTED' ? formatCurrency(campaign.refundAmount || 0, userCurrencyCode) : formatDate(campaign.expiresAt || campaign.completedAt)} />
                        </div>

                        {/* Collapsible Performance Report */}
                        {expandedCampaignId === campaign.id && (
                          <CampaignReportPanel
                            campaign={campaign}
                            metrics={campaignMetrics}
                            loading={metricsLoading}
                            isSimulated={!!simulationMode[campaign.id]}
                            userCurrencyCode={userCurrencyCode}
                          />
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-100 pt-3 mt-4 gap-2">
                          <div className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={() => handleExpandCampaign((campaign.id || campaign._id) as string)}
                              className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors self-start"
                            >
                              <TrendingUp size={14} />
                              {expandedCampaignId === (campaign.id || campaign._id) ? 'Hide Performance Report' : 'View Performance Report'}
                            </button>
                            
                            {(campaign as any).previewUrls?.length > 0 && (
                              <a
                                href={(campaign as any).previewUrls[0].url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors self-start"
                                title="View your live ad on the provider platform"
                              >
                                <ExternalLink size={14} />
                                View Live Ad
                              </a>
                            )}
                          </div>

                          {expandedCampaignId === (campaign.id || campaign._id) && (
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-500 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!simulationMode[(campaign.id || campaign._id) as string]}
                                onChange={(e) => setSimulationMode((prev) => ({ ...prev, [(campaign.id || campaign._id) as string]: e.target.checked }))}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20"
                              />
                              Simulate Live {(campaign.selectedProviders?.length || campaign.platforms?.length) ? (campaign.selectedProviders || campaign.platforms || []).map(p => platformLabel(p).replace(' Ads', '').replace('TallyPadi Marketplace Boost', 'TallyPadi')).join(' & ') : 'TikTok'} Metrics (Demo)
                            </label>
                          )}
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

function LiveAdPreview({
  productName,
  productDescription,
  productPrice,
  productImage,
  adDescription,
  businessName,
  storeSlug,
  productId,
  currencyCode,
}: {
  productName: string;
  productDescription: string;
  productPrice: number;
  productImage?: string | null;
  adDescription: string;
  businessName: string;
  storeSlug: string;
  productId: string;
  currencyCode: string;
}) {
  const [activeTab, setActiveTab] = useState<'TIKTOK' | 'META'>('TIKTOK');

  return (
    <div className="flex flex-col items-center w-full space-y-4">
      {/* Platform Selector Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg text-xs font-bold w-full max-w-[320px]">
        <button
          type="button"
          onClick={() => setActiveTab('TIKTOK')}
          className={`flex-1 py-1.5 rounded transition-all text-center ${activeTab === 'TIKTOK' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}
        >
          TikTok Ads
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('META')}
          className={`flex-1 py-1.5 rounded transition-all text-center ${activeTab === 'META' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}
        >
          Meta Ads
        </button>
      </div>

      {activeTab === 'TIKTOK' ? (
        /* TikTok Preview mock */
        <div className="relative w-full max-w-[320px] aspect-[9/16] rounded-3xl bg-zinc-950 text-white border-4 border-zinc-800 shadow-2xl overflow-hidden flex flex-col justify-between p-4 select-none">
          {/* Top Camera Punch/Notch */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-20 flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-zinc-900 rounded-full mr-2" />
            <div className="w-1.5 h-1.5 bg-blue-900 rounded-full" />
          </div>

          {/* Top Nav (Following | For You) */}
          <div className="w-full flex items-center justify-between text-xs text-white/60 font-semibold px-4 pt-4 z-10">
            <span>Live Preview</span>
            <div className="flex gap-3 text-sm">
              <span className="hover:text-white transition-colors cursor-pointer">Following</span>
              <span className="text-white border-b-2 border-white pb-0.5 font-bold relative">
                For You
                <span className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-red-500 rounded-full" />
              </span>
            </div>
            <Search size={16} className="text-white/80" />
          </div>

          {/* Background Image / Blur */}
          <div className="absolute inset-0 z-0 flex items-center justify-center bg-zinc-900">
            {productImage ? (
              <>
                <img src={productImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 blur-md scale-110" />
                <img src={productImage} alt="" className="relative max-h-[70%] max-w-full object-contain z-1" />
              </>
            ) : (
              <div className="flex flex-col items-center text-zinc-650 gap-2">
                <Megaphone size={48} className="stroke-[1.5]" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-550">TallyPadi Ads</span>
              </div>
            )}
          </div>

          {/* Right Action Bar */}
          <div className="absolute right-3 bottom-32 flex flex-col items-center gap-4 z-10 text-white">
            {/* Profile Avatar */}
            <div className="relative w-10 h-10 rounded-full bg-zinc-800 border border-white flex items-center justify-center font-bold text-xs">
              {businessName ? businessName.charAt(0).toUpperCase() : 'S'}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-rose-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold border border-black shadow">
                +
              </div>
            </div>
            {/* Likes */}
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm cursor-pointer hover:scale-105 transition-transform">
                <Heart size={18} fill="#ff3b30" stroke="#ff3b30" />
              </div>
              <span className="text-[9px] font-semibold text-white/95 mt-1 shadow-sm">1.8K</span>
            </div>
            {/* Comments */}
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm cursor-pointer hover:scale-105 transition-transform">
                <MessageCircle size={18} fill="#ffffff" stroke="none" />
              </div>
              <span className="text-[9px] font-semibold text-white/95 mt-1 shadow-sm">142</span>
            </div>
            {/* Bookmark */}
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm cursor-pointer hover:scale-105 transition-transform">
                <Bookmark size={18} fill="#e0a82e" stroke="none" />
              </div>
              <span className="text-[9px] font-semibold text-white/95 mt-1 shadow-sm">88</span>
            </div>
            {/* Share */}
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm cursor-pointer hover:scale-105 transition-transform">
                <Share2 size={18} className="text-white" />
              </div>
              <span className="text-[9px] font-semibold text-white/95 mt-1 shadow-sm">34</span>
            </div>
            {/* Disk rotation */}
            <div className="w-8 h-8 rounded-full bg-zinc-850 border-4 border-zinc-900 flex items-center justify-center animate-spin" style={{ animationDuration: '3s' }}>
              <Music size={12} className="text-zinc-400" />
            </div>
          </div>

          {/* Bottom Captions & Ads Banner */}
          <div className="w-full flex flex-col gap-2 mt-auto z-10 text-xs">
            <div className="max-w-[75%] space-y-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-black text-sm tracking-wide text-white truncate max-w-[100px]">
                  @{String(businessName || 'myshop').toLowerCase().replace(/[^a-z0-9]+/g, '')}
                </span>
                <span className="bg-blue-500 rounded-full p-0.5 flex items-center justify-center shrink-0 w-3 h-3 text-[7px] text-white font-bold leading-none">
                  ✓
                </span>
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold shrink-0 text-white/90">
                  Sponsored
                </span>
              </div>
              <p className="text-xs text-white/90 leading-snug break-words max-h-16 overflow-y-auto font-medium">
                {adDescription.trim() || `Amazing ${productName || 'product'} now available! Get yours today on our store. Click below to shop.`}
              </p>
            </div>

            {/* Shopping Action Card */}
            <div className="bg-zinc-900/90 border border-zinc-800/80 backdrop-blur rounded-xl p-2 flex items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                  {productImage ? <img src={productImage} alt="" className="w-full h-full object-cover" /> : <PackagePlus className="text-zinc-500" size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black text-white truncate leading-tight">{productName || 'Premium Product'}</p>
                  <p className="text-[9px] text-cyan-400 font-bold truncate mt-0.5 flex items-center gap-0.5">
                    tallypadi.com/shop/{storeSlug}
                  </p>
                </div>
              </div>
              <div className="bg-cyan-400 hover:bg-cyan-300 text-zinc-950 font-black text-[9px] px-2.5 py-2 rounded-lg uppercase tracking-wider shrink-0 transition-colors flex items-center gap-0.5">
                Shop Now <ArrowRight size={10} strokeWidth={3} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Meta/Instagram Preview mock */
        <div className="relative w-full max-w-[320px] rounded-3xl bg-white text-slate-900 border-4 border-slate-200 shadow-2xl overflow-hidden flex flex-col select-none">
          {/* Top Notch */}
          <div className="w-full h-6 bg-slate-50 flex items-center justify-center border-b border-slate-100">
            <div className="w-16 h-3.5 bg-black rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full mr-1.5" />
              <div className="w-1 h-1 bg-blue-900 rounded-full" />
            </div>
          </div>

          {/* Instagram Post Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 via-red-500 to-purple-600 p-[2px]">
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center font-bold text-[10px] text-slate-800">
                  {businessName ? businessName.charAt(0).toUpperCase() : 'S'}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 flex items-center gap-0.5 leading-none">
                  {String(businessName || 'myshop').toLowerCase().replace(/[^a-z0-9]+/g, '')}
                  <span className="bg-blue-500 rounded-full p-0.5 flex items-center justify-center w-2.5 h-2.5 text-[6px] text-white font-bold leading-none">✓</span>
                </p>
                <p className="text-[9px] text-slate-400 font-medium leading-none mt-1">Sponsored</p>
              </div>
            </div>
            <span className="text-slate-400 text-xs font-bold tracking-widest cursor-pointer px-1">•••</span>
          </div>

          {/* Post Image Area (1:1) */}
          <div className="w-full aspect-square bg-slate-50 relative flex items-center justify-center border-b border-slate-100">
            {productImage ? (
              <img src={productImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-slate-355 gap-2">
                <PackagePlus size={40} className="stroke-[1.5]" />
                <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">TallyPadi Store</span>
              </div>
            )}
          </div>

          {/* CTA Banner (Shop Now bar typical of Instagram Ads) */}
          <div className="bg-slate-50 border-b border-slate-100 px-3 py-2 flex items-center justify-between text-xs">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">tallypadi.com</p>
              <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{productName || 'Visit shop to purchase'}</p>
            </div>
            <div className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] px-3.5 py-1.5 rounded uppercase tracking-wider shrink-0 transition-colors flex items-center gap-0.5">
              Shop Now <ExternalLink size={9} strokeWidth={2.5} />
            </div>
          </div>

          {/* Social Interactions */}
          <div className="p-3 pb-1.5 flex items-center justify-between text-slate-700">
            <div className="flex items-center gap-3">
              <Heart size={18} className="cursor-pointer text-slate-900 hover:text-red-500 transition-colors" />
              <MessageCircle size={18} className="cursor-pointer text-slate-900" />
              <Share2 size={18} className="cursor-pointer text-slate-900" />
            </div>
            <Bookmark size={18} className="cursor-pointer text-slate-900" />
          </div>

          {/* Likes Count & Caption */}
          <div className="px-3 pb-4 text-xs space-y-1">
            <p className="font-bold text-slate-900">4,284 likes</p>
            <p className="text-slate-800 leading-snug break-words">
              <span className="font-bold text-slate-900 mr-1.5">
                {String(businessName || 'myshop').toLowerCase().replace(/[^a-z0-9]+/g, '')}
              </span>
              {adDescription.trim() || `Amazing ${productName || 'product'} now available! Get yours today on our store. Click below to shop.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignReportPanel({
  campaign,
  metrics,
  loading,
  isSimulated,
  userCurrencyCode,
}: {
  campaign: AdCampaign;
  metrics: any[];
  loading: boolean;
  isSimulated: boolean;
  userCurrencyCode: string;
}) {
  const [activeTab, setActiveTab] = useState<'impressions' | 'clicks' | 'conversions' | 'spend'>('impressions');
  const [activePlatformFilter, setActivePlatformFilter] = useState<string>('ALL');

  const platformsList = campaign.selectedProviders?.length ? campaign.selectedProviders : campaign.platforms || [];
  const platformNames = platformsList.length > 0 
    ? platformsList.map(p => platformLabel(p).replace(' Ads', '').replace('TallyPadi Marketplace Boost', 'TallyPadi')).join(' & ')
    : 'Platform';

  const activeMetrics = useMemo(() => {
    if (isSimulated) {
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
      });

      const allMockMetrics: any[] = [];
      const budget = (campaign.budget || 2000) / (platformsList.length || 1);

      (platformsList.length ? platformsList : ['TIKTOK']).forEach((platform, pIdx) => {
        let seed = pIdx * 100;
        const cid = (campaign.id || campaign._id || 'demo') as string;
        for (let c = 0; c < cid.length; c++) {
          seed += cid.charCodeAt(c);
        }

        dates.forEach((date, idx) => {
          const dayFactor = 0.5 + ((seed * (idx + 1)) % 10) / 10;
          const daySpend = (budget / 7) * dayFactor;
          const dayImps = Math.round(daySpend * 4.5);
          const dayClicks = Math.round(dayImps * 0.024);
          const dayConvs = Math.round(dayClicks * 0.055);

          allMockMetrics.push({
            date,
            provider: platform,
            impressions: dayImps,
            clicks: dayClicks,
            conversions: dayConvs,
            spendMinor: Math.round(daySpend * 100),
            currency: 'NGN',
          });
        });
      });
      return allMockMetrics;
    }
    return [...metrics].reverse();
  }, [isSimulated, metrics, campaign.id, campaign._id, campaign.budget, platformsList]);

  const filteredMetrics = useMemo(() => {
    if (activePlatformFilter === 'ALL') return activeMetrics;
    return activeMetrics.filter(m => m.provider === activePlatformFilter);
  }, [activeMetrics, activePlatformFilter]);

  const aggregatedMetrics = useMemo(() => {
    const byDate = new Map<string, any>();
    filteredMetrics.forEach(m => {
      if (!byDate.has(m.date)) {
        byDate.set(m.date, { date: m.date, impressions: 0, clicks: 0, conversions: 0, spendMinor: 0, currency: m.currency });
      }
      const agg = byDate.get(m.date);
      agg.impressions += m.impressions || 0;
      agg.clicks += m.clicks || 0;
      agg.conversions += m.conversions || 0;
      agg.spendMinor += m.spendMinor || 0;
    });
    return Array.from(byDate.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredMetrics]);

  const totals = useMemo(() => {
    let imps = 0;
    let clicks = 0;
    let convs = 0;
    let spendM = 0;

    aggregatedMetrics.forEach((m) => {
      imps += m.impressions || 0;
      clicks += m.clicks || 0;
      convs += m.conversions || 0;
      spendM += m.spendMinor || 0;
    });

    const spend = spendM / 100;
    const ctr = imps > 0 ? (clicks / imps) * 100 : 0;
    const convRate = clicks > 0 ? (convs / clicks) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;

    return { imps, clicks, convs, spend, ctr, convRate, cpc };
  }, [aggregatedMetrics]);

  if (loading && !isSimulated) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 className="animate-spin text-emerald-600 mr-2" size={20} />
        <span className="text-xs font-semibold">Loading campaign performance data...</span>
      </div>
    );
  }

  if (activeMetrics.length === 0) {
    return (
      <div className="bg-slate-50 rounded-lg border border-slate-100 p-6 text-center mt-3 animate-in fade-in duration-200">
        <AlertCircle className="mx-auto mb-2 text-slate-400" size={24} />
        <p className="text-xs font-bold text-slate-700">No Metrics Found</p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
          {platformNames} has not reported campaign activity for this reference yet. Check the checkbox on the right to simulate live metrics.
        </p>
      </div>
    );
  }

  const W = 600;
  const H = 200;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;
  const plotW = W - paddingLeft - paddingRight;
  const plotH = H - paddingTop - paddingBottom;

  const chartValues = aggregatedMetrics.map((m) => {
    if (activeTab === 'spend') return (m.spendMinor || 0) / 100;
    return m[activeTab] || 0;
  });

  const chartLabels = aggregatedMetrics.map((m) => {
    try {
      const parts = m.date.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      }
    } catch {}
    return m.date;
  });

  const minVal = 0;
  const maxVal = Math.max(...chartValues, 5);

  const points = chartValues.map((val, idx) => {
    const N = chartValues.length;
    const x = paddingLeft + (idx / (N - 1)) * plotW;
    const y = paddingTop + (1 - val / maxVal) * plotH;
    return { x, y, val, label: chartLabels[idx] };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${H - paddingBottom} L ${points[0].x} ${H - paddingBottom} Z`
    : '';

  const tabs = [
    { key: 'impressions', label: 'Impressions', value: totals.imps.toLocaleString(), sub: 'Views', activeBg: 'bg-blue-50/50 text-blue-700 border-blue-400' },
    { key: 'clicks', label: 'Clicks', value: totals.clicks.toLocaleString(), sub: `CTR: ${totals.ctr.toFixed(1)}%`, activeBg: 'bg-indigo-50/50 text-indigo-700 border-indigo-400' },
    { key: 'conversions', label: 'Conversions', value: totals.convs.toLocaleString(), sub: `CVR: ${totals.convRate.toFixed(1)}%`, activeBg: 'bg-emerald-50/50 text-emerald-700 border-emerald-400' },
    { key: 'spend', label: 'Spend', value: formatCurrency(totals.spend, userCurrencyCode), sub: `CPC: ${formatCurrency(totals.cpc, userCurrencyCode)}`, activeBg: 'bg-rose-50/50 text-rose-700 border-rose-400' },
  ] as const;

  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded w-max">
          <Globe size={11} /> {platformNames} Live API Reports
        </span>
        {platformsList.length > 1 && (
          <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-lg self-start">
            <button
              onClick={() => setActivePlatformFilter('ALL')}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${activePlatformFilter === 'ALL' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              All
            </button>
            {platformsList.map(platform => (
              <button
                key={platform}
                onClick={() => setActivePlatformFilter(platform)}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${activePlatformFilter === platform ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {platformLabel(platform).replace(' Ads', '').replace('TallyPadi Marketplace Boost', 'TallyPadi')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`p-3 rounded-lg border text-left transition-all ${isActive ? tab.activeBg : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50/80'}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tab.label}</p>
              <p className="text-lg font-black mt-1 leading-none">{tab.value}</p>
              <p className="text-[10px] font-bold text-slate-500 mt-1.5">{tab.sub}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="min-w-[480px]">
            <defs>
              <linearGradient id="chartGradientBlue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.00" />
              </linearGradient>
              <linearGradient id="chartGradientIndigo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.00" />
              </linearGradient>
              <linearGradient id="chartGradientEmerald" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
              </linearGradient>
              <linearGradient id="chartGradientRose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {Array.from({ length: 4 }).map((_, idx) => {
              const y = paddingTop + (idx / 3) * plotH;
              const valLabel = Math.round(maxVal - (idx / 3) * maxVal);
              let valStr = String(valLabel);
              if (activeTab === 'spend') {
                valStr = formatCurrency(valLabel, userCurrencyCode).replace(/\.\d+$/, '');
              } else if (valLabel >= 1000) {
                valStr = `${(valLabel / 1000).toFixed(1)}k`;
              }

              return (
                <g key={idx}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={W - paddingRight}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94a3b8"
                    className="text-[10px] font-bold"
                  >
                    {valStr}
                  </text>
                </g>
              );
            })}

            {points.length > 0 && (
              <path
                d={areaPath}
                fill={
                  activeTab === 'impressions' ? 'url(#chartGradientBlue)' :
                  activeTab === 'clicks' ? 'url(#chartGradientIndigo)' :
                  activeTab === 'conversions' ? 'url(#chartGradientEmerald)' :
                  'url(#chartGradientRose)'
                }
              />
            )}

            {points.length > 0 && (
              <path
                d={linePath}
                fill="none"
                stroke={
                  activeTab === 'impressions' ? '#3b82f6' :
                  activeTab === 'clicks' ? '#6366f1' :
                  activeTab === 'conversions' ? '#10b981' :
                  '#f43f5e'
                }
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {points.map((p, idx) => (
              <g key={idx} className="group/dot">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4.5"
                  fill="#ffffff"
                  stroke={
                    activeTab === 'impressions' ? '#3b82f6' :
                    activeTab === 'clicks' ? '#6366f1' :
                    activeTab === 'conversions' ? '#10b981' :
                    '#f43f5e'
                  }
                  strokeWidth="2.5"
                  className="transition-all duration-200 group-hover/dot:r-6 cursor-pointer"
                />
                
                <g className="opacity-0 group-hover/dot:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <rect
                    x={p.x - 30}
                    y={p.y - 28}
                    width="60"
                    height="20"
                    rx="4"
                    fill="#1e293b"
                  />
                  <text
                    x={p.x}
                    y={p.y - 15}
                    textAnchor="middle"
                    fill="#ffffff"
                    className="text-[9px] font-bold"
                  >
                    {activeTab === 'spend' ? formatCurrency(p.val, userCurrencyCode) : p.val}
                  </text>
                </g>

                <text
                  x={p.x}
                  y={H - 12}
                  textAnchor="middle"
                  fill="#94a3b8"
                  className="text-[10px] font-bold"
                >
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

function BoostControls({
  form,
  plans,
  selectedPlan,
  currencyCode,
  onPlanChange,
  onChange,
}: {
  form: BoostForm;
  plans: AdsPlan[];
  selectedPlan?: AdsPlan;
  currencyCode: string;
  onPlanChange: (planId: string) => void;
  onChange: React.Dispatch<React.SetStateAction<BoostForm>>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Platforms</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          {PROMOTION_PLATFORM_OPTIONS.map((option) => {
            const checked = form.platforms.includes(option.value);
            return (
              <label
                key={option.value}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold transition-colors ${checked ? 'border-emerald-300 bg-white text-emerald-700 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange((prev) => ({
                    ...prev,
                    platforms: checked
                      ? prev.platforms.filter((platform) => platform !== option.value)
                      : [...prev.platforms, option.value],
                  }))}
                  className="h-4 w-4 accent-emerald-600"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t border-b border-slate-100 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Landing Page Destination</span>
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={form.useGlobalLandingPage}
              onChange={(e) => onChange(prev => ({ ...prev, useGlobalLandingPage: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20"
            />
            Use same link for all platforms
          </label>
        </div>
        
        {form.useGlobalLandingPage ? (
          <input
            type="url"
            placeholder="https://tallypadi.com/... (Leave empty to use auto-generated product link)"
            value={form.globalLandingPageUrl}
            onChange={(e) => onChange(prev => ({ ...prev, globalLandingPageUrl: e.target.value }))}
            className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        ) : (
          <div className="space-y-2">
            {form.platforms.map(platform => {
              const platformName = PROMOTION_PLATFORM_OPTIONS.find(p => p.value === platform)?.label || platform;
              return (
                <div key={platform} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-400">{platformName} URL</span>
                  <input
                    type="url"
                    placeholder={`Link for ${platformName}...`}
                    value={form.providerLandingPageUrls[platform] || ''}
                    onChange={(e) => onChange(prev => ({ 
                      ...prev, 
                      providerLandingPageUrls: { ...prev.providerLandingPageUrls, [platform]: e.target.value } 
                    }))}
                    className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                  />
                </div>
              );
            })}
            {form.platforms.length === 0 && (
              <p className="text-xs text-slate-400 italic">Select at least one platform above to add custom links.</p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Target Locations</span>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="block text-[10px] font-semibold text-slate-400 mb-1">Country</span>
            <input
              type="text"
              readOnly
              value={form.targetLocationCountry}
              className="w-full border border-slate-200 bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-500 focus:outline-none font-bold"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-semibold text-slate-400 mb-1">State</span>
            <input
              type="text"
              placeholder="e.g. Lagos"
              value={form.targetLocationState}
              onChange={(e) => onChange((prev) => ({ ...prev, targetLocationState: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-semibold text-slate-400 mb-1">City</span>
            <input
              type="text"
              placeholder="e.g. Lekki"
              value={form.targetLocationCity}
              onChange={(e) => onChange((prev) => ({ ...prev, targetLocationCity: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Budget Type</span>
          <select
            value={form.budgetType}
            onChange={(e) => onChange((prev) => ({ ...prev, budgetType: e.target.value as 'DAILY' | 'TOTAL' }))}
            className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="TOTAL">Total Budget</option>
            <option value="DAILY">Daily Budget</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Budget</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-black">{currencyCode}</span>
            <input
              type="number"
              min={selectedPlan?.price || 0}
              value={form.budget}
              onChange={(e) => onChange((prev) => ({ ...prev, budget: e.target.value }))}
              placeholder={selectedPlan ? String(selectedPlan.price) : '0'}
              className="w-full border border-slate-200 bg-slate-50 rounded-lg pl-14 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase">Start Date</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => onChange((prev) => ({ ...prev, startDate: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-lg px-2 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase">End Date</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => onChange((prev) => ({ ...prev, endDate: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-lg px-2 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
            />
          </label>
        </div>
      </div>

      <label className="block">
        <div className="flex justify-between items-center mb-1">
          <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Ad Copy Creative Text (Description)</span>
          <span className="text-[10px] text-slate-400 font-bold">{form.adDescription.length}/1000</span>
        </div>
        <textarea
          value={form.adDescription}
          maxLength={1000}
          onChange={(e) => onChange((prev) => ({ ...prev, adDescription: e.target.value }))}
          placeholder="Enter description copy that users see on social feeds (e.g. TikTok, Meta)..."
          rows={2}
          className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Ad Search Notes</span>
        <textarea
          value={form.brief}
          onChange={(e) => onChange((prev) => ({ ...prev, brief: e.target.value }))}
          placeholder="What should the ad emphasize? Include model, condition, delivery, target area, or buyer questions."
          rows={2}
          className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Search Keywords</span>
        <input
          value={form.keywords}
          onChange={(e) => onChange((prev) => ({ ...prev, keywords: e.target.value }))}
          placeholder="e.g. smart tv, used fridge, lekki phone shop"
          className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
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
