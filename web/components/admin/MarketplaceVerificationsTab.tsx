'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { BadgeCheck, Eye, FileText, Loader2, RefreshCcw, Search, ShieldCheck, Trash2, X, XCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

interface VerificationUser {
  businessName?: string;
  name?: string;
  phoneNumber?: string;
  email?: string;
  shopSlug?: string;
  countryCode?: string;
  marketplaceVerificationStatus?: string;
}

interface SellerVerification {
  _id?: string;
  id?: string;
  status: VerificationStatus;
  countryCode: string;
  idType: string;
  fullName: string;
  dateOfBirth?: string | null;
  address: string;
  governmentIdNumber?: string | null;
  documentFrontUrl?: string | null;
  documentBackUrl?: string | null;
  selfieCenterUrl?: string | null;
  selfieLeftUrl?: string | null;
  selfieRightUrl?: string | null;
  selfieUpUrl?: string | null;
  selfieDownUrl?: string | null;
  submittedAt?: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  user?: VerificationUser | string | null;
}

const statuses: VerificationStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

const statusClass: Record<VerificationStatus, string> = {
  PENDING: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  APPROVED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  REJECTED: 'border-red-500/30 bg-red-500/10 text-red-300',
  CANCELLED: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
};

const getId = (verification: SellerVerification) => String(verification._id || verification.id || '');

const getUser = (value: SellerVerification['user']): VerificationUser => (
  value && typeof value === 'object' ? value : {}
);

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const idTypeLabel = (value: string) => {
  if (value === 'NIN') return 'NIN';
  if (value === 'NATIONAL_ID') return 'National ID';
  if (value === 'DRIVERS_LICENSE') return 'Driver Licence';
  if (value === 'INTERNATIONAL_PASSPORT') return 'International Passport';
  if (value === 'GOVERNMENT_ID') return 'Government ID';
  return value;
};

function EvidenceCard({ label, url }: { label: string; url?: string | null }) {
  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500">
        {label}: Not submitted
      </div>
    );
  }

  const isPdf = /\.pdf($|\?)/i.test(url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-xl border border-slate-700 bg-slate-900 hover:border-emerald-500/60">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</span>
        <Eye size={14} className="text-slate-500 group-hover:text-emerald-300" />
      </div>
      {isPdf ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-300">
          <FileText size={30} />
          <span className="text-xs font-bold">Open PDF</span>
        </div>
      ) : (
        <img src={url} alt={label} className="h-40 w-full object-cover" />
      )}
    </a>
  );
}

export default function MarketplaceVerificationsTab({ adminToken }: { adminToken: string }) {
  const [status, setStatus] = useState<VerificationStatus>('PENDING');
  const [query, setQuery] = useState('');
  const [verifications, setVerifications] = useState<SellerVerification[]>([]);
  const [selected, setSelected] = useState<SellerVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  }), [adminToken]);

  const fetchVerifications = async (nextStatus = status) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/marketplace-verifications?status=${nextStatus}`, { headers });
      setVerifications(res.data?.verifications || []);
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Error', data?.error || 'Failed to load seller verifications.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerifications(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const openDetail = async (verification: SellerVerification) => {
    const id = getId(verification);
    if (!id) return;
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/marketplace-verifications/${id}`, { headers });
      setSelected(res.data?.verification || verification);
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Error', data?.error || 'Failed to open verification.', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const runAction = async (verification: SellerVerification, action: 'approve' | 'reject') => {
    const id = getId(verification);
    if (!id) return;

    let body: Record<string, string> = {};
    if (action === 'reject') {
      const result = await Swal.fire({
        title: 'Reject Seller Verification',
        input: 'textarea',
        inputLabel: 'Reason',
        inputPlaceholder: 'Explain why this verification was rejected',
        showCancelButton: true,
        confirmButtonText: 'Reject',
        confirmButtonColor: '#ef4444',
      });
      if (!result.isConfirmed) return;
      body = { reason: String(result.value || '').trim() || 'Verification rejected by admin.' };
    }

    setActionId(id);
    try {
      const res = await axios.post(`${API_URL}/admin/marketplace-verifications/${id}/${action}`, body, { headers });
      Swal.fire('Done', res.data?.message || 'Verification updated.', 'success');
      setSelected(null);
      await fetchVerifications(status);
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Error', data?.error || 'Action failed.', 'error');
    } finally {
      setActionId(null);
    }
  };

  const deleteVerification = async (verification: SellerVerification) => {
    const id = getId(verification);
    if (!id) return;

    const result = await Swal.fire({
      title: 'Delete verification?',
      text: 'This will permanently delete the verification record and its uploaded R2 files.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Record & Assets',
      confirmButtonColor: '#ef4444',
    });
    if (!result.isConfirmed) return;

    setActionId(id);
    try {
      const res = await axios.delete(`${API_URL}/admin/marketplace-verifications/${id}`, { headers });
      Swal.fire('Deleted', res.data?.message || 'Verification deleted.', 'success');
      setSelected(null);
      await fetchVerifications(status);
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Error', data?.error || 'Delete failed.', 'error');
    } finally {
      setActionId(null);
    }
  };

  const filtered = verifications.filter((verification) => {
    const user = getUser(verification.user);
    const text = [
      verification.fullName,
      verification.idType,
      verification.countryCode,
      user.businessName,
      user.name,
      user.email,
      user.phoneNumber,
      user.shopSlug,
      getId(verification),
    ].join(' ').toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <BadgeCheck className="text-sky-400" />
            Seller Verifications
          </h2>
          <p className="text-sm text-slate-400 mt-1">Review ID details and live face captures before awarding marketplace badges.</p>
        </div>
        <button
          onClick={() => fetchVerifications(status)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statuses.map((item) => (
          <button
            key={item}
            onClick={() => setStatus(item)}
            className={`rounded-xl border p-4 text-left text-sm font-black transition-colors ${status === item ? statusClass[item] : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700/70'}`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, shop, email, phone, ID type"
          className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            Loading verifications
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500">No {status.toLowerCase()} seller verifications found.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((verification) => {
              const user = getUser(verification.user);
              const id = getId(verification);
              return (
                <article key={id} className="p-4 md:p-5 hover:bg-slate-800/40 transition-colors">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass[verification.status]}`}>
                          {verification.status}
                        </span>
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-300">
                          {idTypeLabel(verification.idType)}
                        </span>
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-300">
                          {verification.countryCode}
                        </span>
                      </div>
                      <h3 className="truncate text-lg font-black text-white">{verification.fullName}</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {user.businessName || user.name || 'Seller'} · {user.phoneNumber || 'No phone'} · {user.email || 'No email'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Submitted {formatDate(verification.submittedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openDetail(verification)}
                        disabled={detailLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                      >
                        <Eye size={15} />
                        Review
                      </button>
                      <button
                        onClick={() => deleteVerification(verification)}
                        disabled={actionId === id}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                        Delete
                      </button>
                      {verification.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => runAction(verification, 'approve')}
                            disabled={actionId === id}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            <ShieldCheck size={15} />
                            Approve
                          </button>
                          <button
                            onClick={() => runAction(verification, 'reject')}
                            disabled={actionId === id}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
                          >
                            <XCircle size={15} />
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/95 p-5">
              <div>
                <h3 className="text-xl font-black text-white">{selected.fullName}</h3>
                <p className="text-sm text-slate-400">{idTypeLabel(selected.idType)} · {selected.countryCode} · Submitted {formatDate(selected.submittedAt)}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800"
                aria-label="Close verification"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[320px_1fr]">
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <Info label="Status" value={selected.status} />
                <Info label="ID Type" value={idTypeLabel(selected.idType)} />
                <Info label="ID Number" value={selected.governmentIdNumber || 'Not shown'} />
                <Info label="Date of Birth" value={selected.dateOfBirth || 'Not provided'} />
                <Info label="Address" value={selected.address} />
                <Info label="Reviewed" value={formatDate(selected.reviewedAt)} />
                {selected.rejectionReason && <Info label="Rejection Reason" value={selected.rejectionReason} />}
              </div>

              <div className="space-y-5">
                <div>
                  <h4 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-400">ID Document</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <EvidenceCard label="ID Front" url={selected.documentFrontUrl} />
                    <EvidenceCard label="ID Back" url={selected.documentBackUrl} />
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-400">Live Face Captures</h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <EvidenceCard label="Center" url={selected.selfieCenterUrl} />
                    <EvidenceCard label="Left" url={selected.selfieLeftUrl} />
                    <EvidenceCard label="Right" url={selected.selfieRightUrl} />
                    <EvidenceCard label="Up" url={selected.selfieUpUrl} />
                    <EvidenceCard label="Down" url={selected.selfieDownUrl} />
                  </div>
                </div>
              </div>
            </div>

            {selected.status === 'PENDING' && (
              <div className="sticky bottom-0 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-800 bg-slate-950/95 p-5">
                <button
                  onClick={() => deleteVerification(selected)}
                  disabled={actionId === getId(selected)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 px-5 py-3 text-sm font-bold text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
                <button
                  onClick={() => runAction(selected, 'reject')}
                  disabled={actionId === getId(selected)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  <XCircle size={16} />
                  Reject
                </button>
                <button
                  onClick={() => runAction(selected, 'approve')}
                  disabled={actionId === getId(selected)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <ShieldCheck size={16} />
                  Approve & Verify Seller
                </button>
              </div>
            )}
            {selected.status !== 'PENDING' && (
              <div className="sticky bottom-0 flex justify-end border-t border-slate-800 bg-slate-950/95 p-5">
                <button
                  onClick={() => deleteVerification(selected)}
                  disabled={actionId === getId(selected)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  Delete Record & Assets
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}
