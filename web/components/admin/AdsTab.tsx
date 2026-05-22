'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Clock3, Loader2, Megaphone, Phone, PlayCircle, RefreshCcw, Search, StopCircle, Wallet, XCircle, type LucideIcon } from 'lucide-react';
import Swal from 'sweetalert2';

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

interface Advertiser {
  _id?: string;
  businessName?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  planType?: string;
  walletBalance?: number;
  currencyCode?: string;
  settings?: { currencyCode?: string };
  shopSlug?: string;
}

interface AdminProduct {
  _id?: string;
  name?: string;
  quantity?: number;
  lastUnitPrice?: number;
  image?: string | null;
  category?: string | null;
  isPublished?: boolean;
}

interface Reviewer {
  _id?: string;
  businessName?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  role?: string;
}

interface AdminAdCampaign {
  id: string;
  user: Advertiser | string | null;
  product: AdminProduct | string | null;
  status: CampaignStatus;
  platforms: string[];
  planLabel: string;
  durationDays: number;
  basePrice: number;
  budget: number;
  walletCharged: boolean;
  refundAmount?: number | null;
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: Reviewer | string | null;
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
  targetLocation?: {
    country?: string;
    state?: string;
    city?: string;
  };
  adDetails?: {
    brief?: string;
    audience?: string;
    keywords?: string[];
    budgetType?: 'DAILY' | 'TOTAL';
    startDate?: string;
    endDate?: string;
    adDescription?: string;
  };
  seo?: {
    title?: string;
    metaDescription?: string;
    adDescription?: string;
    keywords?: string[];
    source?: 'AI' | 'FALLBACK' | null;
  };
}

const statuses: StatusFilter[] = ['ALL', 'PENDING', 'RUNNING', 'COMPLETED', 'REJECTED'];

const statusMeta: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  ALL: { label: 'All Ads', icon: Megaphone, className: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  PENDING: { label: 'Pending', icon: Clock3, className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  PENDING_ADMIN_REVIEW: { label: 'Pending', icon: Clock3, className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  APPROVED_BY_TALLYPADI: { label: 'Approved', icon: CheckCircle2, className: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  SUBMITTING_TO_PROVIDERS: { label: 'Submitting', icon: Clock3, className: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  RUNNING: { label: 'Running', icon: PlayCircle, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  STARTING_SOON: { label: 'Starting Soon', icon: Clock3, className: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
  ACTIVE: { label: 'Active', icon: PlayCircle, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  PARTIALLY_ACTIVE: { label: 'Partially Active', icon: PlayCircle, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  ACTIVE_WITH_PENDING_CHANGES: { label: 'Active + Pending Edits', icon: PlayCircle, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  REQUIRES_REVIEW_AFTER_EDIT: { label: 'Pending Edit Review', icon: Clock3, className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  PAUSED: { label: 'Paused', icon: StopCircle, className: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  COMPLETED: { label: 'Completed', icon: CheckCircle2, className: 'border-slate-500/30 bg-slate-500/10 text-slate-300' },
  REJECTED: { label: 'Rejected', icon: XCircle, className: 'border-red-500/30 bg-red-500/10 text-red-300' },
  REJECTED_BY_TALLYPADI: { label: 'Rejected', icon: XCircle, className: 'border-red-500/30 bg-red-500/10 text-red-300' },
  PARTIALLY_REJECTED: { label: 'Partially Rejected', icon: XCircle, className: 'border-red-500/30 bg-red-500/10 text-red-300' },
  FAILED: { label: 'Failed', icon: XCircle, className: 'border-red-500/30 bg-red-500/10 text-red-300' },
  CANCELLED: { label: 'Cancelled', icon: XCircle, className: 'border-red-500/30 bg-red-500/10 text-red-300' },
};

const statusGroups: Record<StatusFilter, CampaignStatus[]> = {
  ALL: [],
  PENDING: ['PENDING', 'PENDING_ADMIN_REVIEW'],
  RUNNING: ['RUNNING', 'APPROVED_BY_TALLYPADI', 'SUBMITTING_TO_PROVIDERS', 'ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON', 'ACTIVE_WITH_PENDING_CHANGES', 'REQUIRES_REVIEW_AFTER_EDIT', 'PAUSED'],
  COMPLETED: ['COMPLETED'],
  REJECTED: ['REJECTED', 'REJECTED_BY_TALLYPADI', 'PARTIALLY_REJECTED', 'FAILED', 'CANCELLED'],
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

const platformLabel = (platform: string) => {
  if (platform === 'TALLYPADI_MARKETPLACE_BOOST' || platform === 'TALLYPADI_SEO') return 'TallyPadi Marketplace Boost';
  if (platform === 'META_ADS' || platform === 'META') return 'Meta Ads';
  if (platform === 'TIKTOK_ADS' || platform === 'TIKTOK') return 'TikTok Ads';
  if (platform === 'GOOGLE_ADS' || platform === 'GOOGLE') return 'Google Ads';
  return platform;
};

const getAdvertiser = (value: AdminAdCampaign['user']): Advertiser => (
  value && typeof value === 'object' ? value : {}
);

const getProduct = (value: AdminAdCampaign['product']): AdminProduct => (
  value && typeof value === 'object' ? value : {}
);

export default function AdsTab({ adminToken }: { adminToken: string }) {
  const [campaigns, setCampaigns] = useState<AdminAdCampaign[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  }), [adminToken]);

  useEffect(() => {
    fetchAds(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const fetchAds = async (nextStatus = status) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/ads?status=${nextStatus}&limit=100`, { headers });
      setCampaigns(res.data?.campaigns || []);
      setCounts(res.data?.counts || {});
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { message?: string } | undefined : undefined;
      console.error('Fetch admin ads error:', data || error);
      Swal.fire('Error', data?.message || 'Failed to load ads campaigns.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (campaignId: string, action: 'approve' | 'complete' | 'reject') => {
    let body: Record<string, string> = {};
    if (action === 'reject') {
      const result = await Swal.fire({
        title: 'Reject Boost Request',
        input: 'textarea',
        inputLabel: 'Reason',
        inputPlaceholder: 'Tell the user why this boost was rejected',
        showCancelButton: true,
        confirmButtonText: 'Reject & Refund',
        confirmButtonColor: '#ef4444',
      });
      if (!result.isConfirmed) return;
      body = { reason: String(result.value || '').trim() || 'Rejected by admin' };
    }

    setActionId(campaignId);
    try {
      const res = await axios.patch(`${API_URL}/admin/ads/${campaignId}/${action}`, body, { headers });
      setCampaigns((prev) => prev.map((campaign) => (
        campaign.id === campaignId ? res.data.campaign : campaign
      )));
      await fetchAds(status);
      Swal.fire('Done', res.data?.message || 'Ad campaign updated.', 'success');
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { message?: string } | undefined : undefined;
      console.error('Admin ads action error:', data || error);
      Swal.fire('Error', data?.message || 'Action failed.', 'error');
    } finally {
      setActionId(null);
    }
  };

  const filteredCampaigns = campaigns.filter((campaign) => {
    const advertiser = getAdvertiser(campaign.user);
    const text = [
      campaign.productSnapshot?.name,
      campaign.planLabel,
      advertiser.businessName,
      advertiser.name,
      advertiser.email,
      advertiser.phoneNumber,
      campaign.id,
    ].join(' ').toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }).filter((campaign) => status === 'ALL' || statusGroups[status].includes(campaign.status));

  const getStatusCount = (filter: StatusFilter) => {
    if (filter === 'ALL') return counts.ALL || campaigns.length;
    return statusGroups[filter].reduce((sum, item) => sum + (counts[item] || 0), 0);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Megaphone className="text-emerald-400" />
            Ads Review
          </h2>
          <p className="text-sm text-slate-400 mt-1">Review pending boosts, monitor running ads, and audit completed campaigns.</p>
        </div>
        <button
          onClick={() => fetchAds(status)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statuses.map((item) => {
          const meta = statusMeta[item];
          const Icon = meta.icon;
          return (
            <button
              key={item}
              onClick={() => setStatus(item)}
              className={`rounded-xl border p-4 text-left transition-colors ${status === item ? meta.className : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700/70'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <Icon size={20} />
                <span className="text-2xl font-black">{getStatusCount(item)}</span>
              </div>
              <p className="mt-3 text-sm font-bold">{meta.label}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ads, product, user, phone"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{filteredCampaigns.length} records</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="animate-spin w-8 h-8" />
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="py-16 text-center text-slate-400">No {statusMeta[status].label.toLowerCase()} ads found.</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filteredCampaigns.map((campaign) => {
              const advertiser = getAdvertiser(campaign.user);
              const product = getProduct(campaign.product);
              const currencyCode = String(advertiser.currencyCode || advertiser.settings?.currencyCode || 'NGN').toUpperCase();
              const meta = statusMeta[campaign.status] || statusMeta.RUNNING;
              const Icon = meta.icon;

              return (
                <article key={campaign.id} className="p-5 hover:bg-slate-700/20 transition-colors">
                  <div className="flex flex-col 2xl:flex-row gap-5 2xl:items-start 2xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}>
                          <Icon size={13} />
                          {meta.label}
                        </span>
                        {campaign.platforms.map((platform) => (
                          <span key={platform} className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-300 border border-slate-700">
                            {platformLabel(platform)}
                          </span>
                        ))}
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-300 border border-blue-500/20">
                          {campaign.planLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-5">
                        <div className="flex gap-4 min-w-0">
                          <div className="w-16 h-16 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                            {campaign.productSnapshot?.image ? (
                              <img src={campaign.productSnapshot.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Megaphone size={22} className="text-slate-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg font-black text-white truncate">{campaign.productSnapshot?.name || product.name || 'Product boost'}</h3>
                            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{campaign.productSnapshot?.description || 'No product description supplied.'}</p>
                            <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-400">
                              <span>Product price: {formatCurrency(campaign.productSnapshot?.price || product.lastUnitPrice || 0, currencyCode)}</span>
                              <span>Stock: {product.quantity ?? 'Unknown'}</span>
                              <span>Category: {campaign.productSnapshot?.category || product.category || 'None'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Advertiser</p>
                          <h4 className="font-black text-white">{advertiser.businessName || advertiser.name || 'Unknown user'}</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs text-slate-400">
                            <span className="inline-flex items-center gap-1.5"><Phone size={13} /> {advertiser.phoneNumber || 'No phone'}</span>
                            <span>{advertiser.email || 'No email'}</span>
                            <span>Plan: {advertiser.planType || 'Unknown'}</span>
                            <span className="inline-flex items-center gap-1.5"><Wallet size={13} /> {formatCurrency(advertiser.walletBalance || 0, currencyCode)}</span>
                            <span>Shop: {advertiser.shopSlug || 'No slug'}</span>
                            <span>User ID: {String(advertiser._id || (typeof campaign.user === 'string' ? campaign.user : '')).slice(-8)}</span>
                          </div>
                        </div>
                      </div>

                      {campaign.rejectionReason && (
                        <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                          Rejection reason: {campaign.rejectionReason}
                        </p>
                      )}

                      {(campaign.adDetails?.brief ||
                        (campaign.adDetails?.keywords || []).length > 0 ||
                        campaign.adDetails?.adDescription ||
                        campaign.targetLocation ||
                        campaign.adDetails?.budgetType ||
                        campaign.adDetails?.startDate) && (
                        <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-4 space-y-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-blue-300">Submitted ad details</p>
                            {campaign.adDetails?.brief && (
                              <p className="mt-2 text-sm leading-6 text-blue-100">{campaign.adDetails.brief}</p>
                            )}
                            {(campaign.adDetails?.keywords || []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {campaign.adDetails?.keywords?.map((keyword) => (
                                  <span key={keyword} className="rounded-full bg-slate-950/60 px-2.5 py-1 text-xs font-bold text-blue-100">
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Target Location */}
                          {campaign.targetLocation && (campaign.targetLocation.city || campaign.targetLocation.state || campaign.targetLocation.country) && (
                            <div className="border-t border-blue-500/20 pt-2.5">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300/80">Target Location</p>
                              <p className="mt-1 text-xs text-blue-100">
                                {[campaign.targetLocation.city, campaign.targetLocation.state, campaign.targetLocation.country].filter(Boolean).join(', ') || 'Not set'}
                              </p>
                            </div>
                          )}

                          {/* Budget & Schedule */}
                          {(campaign.adDetails?.budgetType || campaign.adDetails?.startDate || campaign.adDetails?.endDate) && (
                            <div className="border-t border-blue-500/20 pt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {campaign.adDetails?.budgetType && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300/80">Budget Type</p>
                                  <p className="mt-1 text-xs text-blue-100 font-semibold">
                                    {campaign.adDetails.budgetType === 'DAILY' ? 'Daily Budget' : 'Total Budget'}
                                  </p>
                                </div>
                              )}
                              {(campaign.adDetails?.startDate || campaign.adDetails?.endDate) && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300/80">Schedule Run</p>
                                  <p className="mt-1 text-xs text-blue-100">
                                    {campaign.adDetails?.startDate ? new Date(campaign.adDetails.startDate).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : 'Starts immediately'}
                                    {' - '}
                                    {campaign.adDetails?.endDate ? new Date(campaign.adDetails.endDate).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : 'Runs indefinitely'}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Creative Ad Copy / Description */}
                          {campaign.adDetails?.adDescription && (
                            <div className="border-t border-blue-500/20 pt-2.5">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300/80">Creative Copy (Description)</p>
                              <p className="mt-1 text-xs text-blue-100 whitespace-pre-wrap leading-relaxed">{campaign.adDetails.adDescription}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {campaign.seo?.title && (
                        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Generated SEO</p>
                          <p className="mt-2 text-sm font-bold text-emerald-50">{campaign.seo.title}</p>
                          {campaign.seo.metaDescription && (
                            <p className="mt-1 text-sm leading-6 text-emerald-100">{campaign.seo.metaDescription}</p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
                        <Detail label="Budget" value={formatCurrency(campaign.budget, currencyCode)} />
                        <Detail label="Minimum" value={formatCurrency(campaign.basePrice, currencyCode)} />
                        <Detail label="Requested" value={formatDate(campaign.requestedAt)} />
                        <Detail label="Started" value={formatDate(campaign.startedAt)} />
                        <Detail label={campaign.status === 'REJECTED' ? 'Refund' : 'Ends'} value={campaign.status === 'REJECTED' ? formatCurrency(campaign.refundAmount || 0, currencyCode) : formatDate(campaign.expiresAt || campaign.completedAt)} />
                      </div>
                    </div>

                    <div className="flex 2xl:flex-col gap-2 2xl:w-40 shrink-0">
                      {['PENDING', 'PENDING_ADMIN_REVIEW'].includes(campaign.status) && (
                        <>
                          <ActionButton
                            label="Approve"
                            icon={CheckCircle2}
                            loading={actionId === campaign.id}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white"
                            onClick={() => runAction(campaign.id, 'approve')}
                          />
                          <ActionButton
                            label="Reject"
                            icon={XCircle}
                            loading={actionId === campaign.id}
                            className="bg-red-600 hover:bg-red-500 text-white"
                            onClick={() => runAction(campaign.id, 'reject')}
                          />
                        </>
                      )}
                      {['RUNNING', 'ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON', 'ACTIVE_WITH_PENDING_CHANGES', 'PAUSED'].includes(campaign.status) && (
                        <ActionButton
                          label="Complete"
                          icon={StopCircle}
                          loading={actionId === campaign.id}
                          className="bg-slate-700 hover:bg-slate-600 text-white border border-slate-600"
                          onClick={() => runAction(campaign.id, 'complete')}
                        />
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-bold text-slate-200 break-words">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  loading,
  className,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  loading: boolean;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex flex-1 2xl:flex-none items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 ${className}`}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
  );
}
