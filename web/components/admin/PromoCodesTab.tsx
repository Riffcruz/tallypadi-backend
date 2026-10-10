'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { Copy, Loader2, Plus, Power, RefreshCw, TicketPercent } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type Audience =
  | 'ALL_USERS'
  | 'RECENTLY_REGISTERED'
  | 'TYCOON_USERS'
  | 'OGA_BOSS_USERS'
  | 'ACTIVE_SUBSCRIBERS'
  | 'ACTIVE_TRIALS'
  | 'PAST_DUE_USERS'
  | 'EXPIRED_USERS'
  | 'EXPIRED_TRIALS'
  | 'EXPIRED_SUBSCRIPTIONS';

type PromoCodeRow = {
  id: string;
  code: string;
  description?: string;
  planType: 'OGA_BOSS' | 'TYCOON';
  durationValue: number;
  durationUnit: 'DAYS' | 'MONTHS';
  audience: Audience;
  recentRegistrationDays?: number | null;
  expiresAt: string;
  isActive: boolean;
  redemptionCount: number;
};

const AUDIENCES: Array<{ value: Audience; label: string }> = [
  { value: 'ALL_USERS', label: 'All registered users' },
  { value: 'RECENTLY_REGISTERED', label: 'Recently registered' },
  { value: 'TYCOON_USERS', label: 'All Tycoon users' },
  { value: 'OGA_BOSS_USERS', label: 'All Oga Boss users' },
  { value: 'ACTIVE_SUBSCRIBERS', label: 'Active subscribers' },
  { value: 'ACTIVE_TRIALS', label: 'Active trials' },
  { value: 'PAST_DUE_USERS', label: 'Past-due users' },
  { value: 'EXPIRED_USERS', label: 'All expired users' },
  { value: 'EXPIRED_TRIALS', label: 'Expired trials only' },
  { value: 'EXPIRED_SUBSCRIPTIONS', label: 'Expired paid subscriptions' },
];

const defaultExpiryValue = () => {
  const date = new Date(Date.now() + 30 * 86_400_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const audienceLabel = (value: Audience) => AUDIENCES.find((item) => item.value === value)?.label || value;

export default function PromoCodesTab({ adminToken }: { adminToken: string }) {
  const [rows, setRows] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [planType, setPlanType] = useState<'OGA_BOSS' | 'TYCOON'>('TYCOON');
  const [durationValue, setDurationValue] = useState(30);
  const [durationUnit, setDurationUnit] = useState<'DAYS' | 'MONTHS'>('DAYS');
  const [audience, setAudience] = useState<Audience>('ALL_USERS');
  const [recentRegistrationDays, setRecentRegistrationDays] = useState(7);
  const [expiresAt, setExpiresAt] = useState(defaultExpiryValue);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  }), [adminToken]);

  const loadPromos = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/admin/promo-codes`, { headers });
      setRows(Array.isArray(response.data?.promoCodes) ? response.data.promoCodes : []);
    } catch (error) {
      console.error('Promo codes load failed:', error);
      Swal.fire('Error', 'Could not load promotional codes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPromos().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers]);

  const createPromo = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await axios.post(`${API_URL}/admin/promo-codes`, {
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        planType,
        durationValue,
        durationUnit,
        audience,
        recentRegistrationDays: audience === 'RECENTLY_REGISTERED' ? recentRegistrationDays : null,
        expiresAt: new Date(expiresAt).toISOString(),
      }, { headers });
      setCode('');
      setDescription('');
      await loadPromos();
      Swal.fire({ title: 'Code created', icon: 'success', timer: 1300, showConfirmButton: false });
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      Swal.fire('Could not create code', message || 'Check the fields and try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePromo = async (row: PromoCodeRow) => {
    try {
      await axios.patch(`${API_URL}/admin/promo-codes/${row.id}`, { isActive: !row.isActive }, { headers });
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, isActive: !item.isActive } : item));
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      Swal.fire('Update failed', message || 'Could not update this code.', 'error');
    }
  };

  const copyCode = async (value: string) => {
    await navigator.clipboard.writeText(value);
    Swal.fire({ title: 'Copied', text: value, icon: 'success', timer: 900, showConfirmButton: false });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-amber-300">
            <TicketPercent size={20} />
            <p className="text-xs font-black uppercase tracking-[0.18em]">Subscriptions</p>
          </div>
          <h2 className="mt-1 text-2xl font-extrabold text-white">Promotional Codes</h2>
        </div>
        <button type="button" onClick={() => loadPromos()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      <form onSubmit={createPromo} className="rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-slate-400">Code</span>
            <input required minLength={4} maxLength={32} value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9_-]/gi, '').toUpperCase())} placeholder="WELCOME30" className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 font-black uppercase text-white outline-none focus:border-emerald-500" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-slate-400">Plan</span>
            <select value={planType} onChange={(event) => setPlanType(event.target.value as typeof planType)} className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 font-bold text-white outline-none focus:border-emerald-500">
              <option value="TYCOON">Tycoon</option>
              <option value="OGA_BOSS">Oga Boss</option>
            </select>
          </label>
          <div className="grid grid-cols-[1fr_130px] gap-2">
            <label className="space-y-1.5">
              <span className="text-xs font-bold uppercase text-slate-400">Duration</span>
              <input required type="number" min={1} max={durationUnit === 'MONTHS' ? 120 : 3650} value={durationValue} onChange={(event) => setDurationValue(Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 font-bold text-white outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold uppercase text-slate-400">Unit</span>
              <select value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as typeof durationUnit)} className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 font-bold text-white outline-none focus:border-emerald-500">
                <option value="DAYS">Days</option>
                <option value="MONTHS">Months</option>
              </select>
            </label>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-slate-400">Code expires</span>
            <input required type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-sm font-bold text-white outline-none focus:border-emerald-500" />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold uppercase text-slate-400">Audience</span>
            <select value={audience} onChange={(event) => setAudience(event.target.value as Audience)} className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 font-bold text-white outline-none focus:border-emerald-500">
              {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {audience === 'RECENTLY_REGISTERED' && (
            <label className="space-y-1.5">
              <span className="text-xs font-bold uppercase text-slate-400">Registered within</span>
              <div className="relative">
                <input required type="number" min={1} max={365} value={recentRegistrationDays} onChange={(event) => setRecentRegistrationDays(Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 pr-14 font-bold text-white outline-none focus:border-emerald-500" />
                <span className="absolute right-3 top-3 text-xs font-bold text-slate-500">days</span>
              </div>
            </label>
          )}
          <label className={`space-y-1.5 ${audience === 'RECENTLY_REGISTERED' ? '' : 'md:col-span-2'}`}>
            <span className="text-xs font-bold uppercase text-slate-400">Internal note</span>
            <input maxLength={240} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional campaign note" className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-white outline-none focus:border-emerald-500" />
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}
            Create Code
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm text-slate-300">
            <thead className="bg-slate-900/60 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-4">Code</th>
                <th className="px-5 py-4">Reward</th>
                <th className="px-5 py-4">Audience</th>
                <th className="px-5 py-4">Expires</th>
                <th className="px-5 py-4">Uses</th>
                <th className="px-5 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">{loading ? 'Loading codes…' : 'No promotional codes yet.'}</td></tr>
              ) : rows.map((row) => {
                const expired = new Date(row.expiresAt).getTime() <= Date.now();
                return (
                  <tr key={row.id} className="hover:bg-slate-700/30">
                    <td className="px-5 py-4">
                      <button type="button" onClick={() => copyCode(row.code)} className="inline-flex items-center gap-2 font-black text-white hover:text-emerald-300">
                        {row.code}<Copy size={13} />
                      </button>
                      {row.description && <div className="mt-1 max-w-[260px] truncate text-xs text-slate-500">{row.description}</div>}
                    </td>
                    <td className="px-5 py-4 font-bold text-white">{row.planType.replace(/_/g, ' ')} · {row.durationValue} {row.durationUnit.toLowerCase()}</td>
                    <td className="px-5 py-4">{audienceLabel(row.audience)}{row.audience === 'RECENTLY_REGISTERED' ? ` (${row.recentRegistrationDays || 7} days)` : ''}</td>
                    <td className="px-5 py-4">{new Date(row.expiresAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-5 py-4 font-black text-white">{row.redemptionCount.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" disabled={expired} onClick={() => togglePromo(row)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black disabled:cursor-not-allowed ${row.isActive && !expired ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-600 bg-slate-900 text-slate-400'}`}>
                        <Power size={13} />{expired ? 'Expired' : row.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
