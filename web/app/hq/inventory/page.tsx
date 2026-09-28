'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Boxes, Building2, Check, ChevronDown, ClipboardList, Loader2, PackageCheck, Plus, Search, Store, Truck, X } from 'lucide-react';
import { getCookie } from '../../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600';
const errorMessage = (error: unknown, fallback: string) => axios.isAxiosError(error) ? (error.response?.data?.error || fallback) : fallback;

type Location = { _id: string; businessName: string; branchType: 'SHOP' | 'WAREHOUSE'; city?: string };
type StockItem = { _id: string; user: string; name: string; sku?: string; barcode?: string; quantity: number; lowStockThreshold?: number | null; category?: string; isLowStock: boolean; location?: Location };
type Transfer = { _id: string; reference: string; itemName: string; quantity: number; status: string; note?: string; fromLocation: Location; toLocation: Location; createdAt: string };

const statusStyle: Record<string, string> = {
  REQUESTED: 'bg-amber-50 text-amber-700 ring-amber-200', APPROVED: 'bg-blue-50 text-blue-700 ring-blue-200',
  DISPATCHED: 'bg-violet-50 text-violet-700 ring-violet-200', RECEIVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200', REJECTED: 'bg-red-50 text-red-700 ring-red-200',
};

export default function StockHubPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'stock' | 'transfers'>('stock');
  const [locations, setLocations] = useState<Location[]>([]);
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [summary, setSummary] = useState({ locations: 0, warehouses: 0, units: 0, lowStock: 0, pendingTransfers: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromLocationId: '', toLocationId: '', itemId: '', quantity: '', note: '' });
  const [receiveForm, setReceiveForm] = useState({ locationId: '', itemId: '', quantity: '', supplier: '', reference: '' });

  const auth = useCallback(() => {
    const token = getCookie('tallyToken');
    if (!token) { router.push('/login'); return null; }
    return { Authorization: `Bearer ${token}` };
  }, [router]);

  const load = useCallback(async () => {
    const headers = auth(); if (!headers) return;
    setError('');
    try {
      const [stockResult, transferResult] = await Promise.all([
        axios.get(`${API_URL}/hq/stock`, { headers }), axios.get(`${API_URL}/hq/transfers`, { headers }),
      ]);
      setLocations(stockResult.data.locations || []); setInventory(stockResult.data.inventory || []);
      setSummary(stockResult.data.summary || {}); setTransfers(transferResult.data.transfers || []);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && [401, 403].includes(Number(err.response?.status))) router.push('/dashboard');
      else setError(errorMessage(err, 'Could not load the Stock Hub.'));
    } finally { setLoading(false); }
  }, [auth, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredInventory = useMemo(() => inventory.filter((item) => {
    const term = search.trim().toLowerCase();
    return (!locationFilter || String(item.user) === locationFilter) && (!term || item.name.toLowerCase().includes(term) || item.sku?.toLowerCase().includes(term) || item.barcode?.includes(term));
  }), [inventory, locationFilter, search]);
  const sourceItems = useMemo(() => inventory.filter((item) => String(item.user) === transferForm.fromLocationId && item.quantity > 0), [inventory, transferForm.fromLocationId]);
  const receiveItems = useMemo(() => {
    const seen = new Set<string>();
    return inventory.filter((item) => {
      const key = item.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [inventory]);

  const createTransfer = async (event: React.FormEvent) => {
    event.preventDefault(); const headers = auth(); if (!headers) return;
    setBusy('create'); setError('');
    try {
      await axios.post(`${API_URL}/hq/transfers`, { ...transferForm, quantity: Number(transferForm.quantity) }, { headers });
      setShowTransfer(false); setTransferForm({ fromLocationId: '', toLocationId: '', itemId: '', quantity: '', note: '' }); setTab('transfers'); await load();
    } catch (err: unknown) { setError(errorMessage(err, 'Could not create the transfer.')); }
    finally { setBusy(''); }
  };

  const receiveStock = async (event: React.FormEvent) => {
    event.preventDefault(); const headers = auth(); if (!headers) return;
    setBusy('receive'); setError('');
    try {
      await axios.post(`${API_URL}/hq/stock/receive`, { ...receiveForm, quantity: Number(receiveForm.quantity) }, { headers });
      setShowReceive(false); setReceiveForm({ locationId: '', itemId: '', quantity: '', supplier: '', reference: '' }); await load();
    } catch (err: unknown) { setError(errorMessage(err, 'Could not receive the stock.')); }
    finally { setBusy(''); }
  };

  const act = async (transfer: Transfer, action: string) => {
    const headers = auth(); if (!headers) return;
    setBusy(`${transfer._id}:${action}`); setError('');
    try { await axios.patch(`${API_URL}/hq/transfers/${transfer._id}`, { action }, { headers }); await load(); }
    catch (err: unknown) { setError(errorMessage(err, 'Could not update the transfer.')); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-emerald-600" /></div>;

  return <div className="max-w-7xl mx-auto space-y-6 pb-16">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Warehouse & branches</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Stock Hub</h1></div>
      <div className="flex gap-2">
        <button onClick={() => setShowReceive(true)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm"><PackageCheck size={18} /> Receive stock</button>
        <button onClick={() => setShowTransfer(true)} disabled={locations.length < 2} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-sm disabled:opacity-40"><Plus size={18} /> New transfer</button>
      </div>
    </header>
    {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertTriangle size={18} className="mt-0.5 shrink-0" />{error}</div>}

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[{ label: 'Stock units', value: summary.units, icon: Boxes }, { label: 'Locations', value: summary.locations, icon: Building2 }, { label: 'Low stock', value: summary.lowStock, icon: AlertTriangle }, { label: 'Open transfers', value: summary.pendingTransfers, icon: Truck }].map(({ label, value, icon: Icon }) =>
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{label}</span><Icon size={18} className="text-emerald-700" /></div><p className="mt-2 text-2xl font-black text-slate-950">{Number(value || 0).toLocaleString()}</p></div>)}
    </section>

    <div className="flex w-full rounded-xl bg-slate-200/70 p-1 sm:w-fit"><button onClick={() => setTab('stock')} className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-black sm:flex-none ${tab === 'stock' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Stock</button><button onClick={() => setTab('transfers')} className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-black sm:flex-none ${tab === 'transfers' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Transfers</button></div>

    {tab === 'stock' ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_240px]"><label className="relative"><Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU or barcode" className={`${inputClass} pl-10`} /></label><Select value={locationFilter} onChange={setLocationFilter} placeholder="All locations" options={locations.map((l) => ({ value: l._id, label: l.businessName }))} /></div>
      <div className="divide-y divide-slate-100">{filteredInventory.map((item) => <div key={item._id} className="grid grid-cols-[1fr_auto] items-center gap-3 p-4 sm:grid-cols-[1.4fr_1fr_120px] sm:px-5">
        <div className="min-w-0"><p className="truncate font-black capitalize text-slate-900">{item.name}</p><p className="mt-1 truncate text-xs font-semibold text-slate-400">{item.sku || item.barcode || item.category || 'No SKU'}</p></div>
        <div className="hidden min-w-0 sm:flex sm:items-center sm:gap-2">{item.location?.branchType === 'WAREHOUSE' ? <Building2 size={16} className="text-amber-600" /> : <Store size={16} className="text-emerald-600" />}<span className="truncate text-sm font-bold text-slate-600">{item.location?.businessName}</span></div>
        <div className="text-right"><p className={`text-xl font-black ${item.isLowStock ? 'text-red-600' : 'text-slate-950'}`}>{item.quantity.toLocaleString()}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">in stock</p></div>
      </div>)}{!filteredInventory.length && <Empty icon={Boxes} text="No stock found" />}</div>
    </section> : <section className="space-y-3">{transfers.map((transfer) => <article key={transfer._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black capitalize text-slate-950">{transfer.itemName}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${statusStyle[transfer.status] || statusStyle.CANCELLED}`}>{transfer.status}</span></div><p className="mt-1 text-xs font-bold text-slate-400">{transfer.reference} · {new Date(transfer.createdAt).toLocaleDateString()}</p></div><div className="text-right"><p className="text-xl font-black text-slate-950">{transfer.quantity}</p><p className="text-[10px] font-black uppercase text-slate-400">units</p></div></div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700"><span className="min-w-0 flex-1 truncate">{transfer.fromLocation?.businessName}</span><ArrowRight size={17} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-right">{transfer.toLocation?.businessName}</span></div>{transfer.note && <p className="mt-3 text-sm text-slate-500">{transfer.note}</p>}<TransferActions transfer={transfer} busy={busy} onAction={act} />
    </article>)}{!transfers.length && <div className="rounded-2xl border border-slate-200 bg-white"><Empty icon={ClipboardList} text="No transfers yet" /></div>}</section>}

    {showTransfer && <Modal title="New stock transfer" onClose={() => setShowTransfer(false)}><form onSubmit={createTransfer} className="space-y-4">
      <Field label="From"><Select value={transferForm.fromLocationId} onChange={(value) => setTransferForm({ ...transferForm, fromLocationId: value, itemId: '' })} placeholder="Select source" options={locations.map((l) => ({ value: l._id, label: l.businessName }))} required /></Field>
      <Field label="Product"><Select value={transferForm.itemId} onChange={(value) => setTransferForm({ ...transferForm, itemId: value })} placeholder="Select available product" options={sourceItems.map((item) => ({ value: item._id, label: `${item.name} · ${item.quantity} available` }))} required /></Field>
      <Field label="To"><Select value={transferForm.toLocationId} onChange={(value) => setTransferForm({ ...transferForm, toLocationId: value })} placeholder="Select destination" options={locations.filter((l) => l._id !== transferForm.fromLocationId).map((l) => ({ value: l._id, label: l.businessName }))} required /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><input type="number" min="1" required value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} className={inputClass} /></Field><Field label="Note"><input value={transferForm.note} onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })} placeholder="Optional" className={inputClass} /></Field></div><Submit busy={busy === 'create'} text="Create request" />
    </form></Modal>}

    {showReceive && <Modal title="Receive supplier stock" onClose={() => setShowReceive(false)}><form onSubmit={receiveStock} className="space-y-4">
      <Field label="Location"><Select value={receiveForm.locationId} onChange={(value) => setReceiveForm({ ...receiveForm, locationId: value, itemId: '' })} placeholder="Select warehouse or shop" options={locations.map((l) => ({ value: l._id, label: l.businessName }))} required /></Field>
      <Field label="Product"><Select value={receiveForm.itemId} onChange={(value) => setReceiveForm({ ...receiveForm, itemId: value })} placeholder="Select product" options={receiveItems.map((item) => ({ value: item._id, label: item.name }))} required /></Field>
      <Field label="Quantity received"><input type="number" min="1" required value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })} className={inputClass} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Supplier"><input value={receiveForm.supplier} onChange={(e) => setReceiveForm({ ...receiveForm, supplier: e.target.value })} placeholder="Optional" className={inputClass} /></Field><Field label="Reference"><input value={receiveForm.reference} onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })} placeholder="Invoice no." className={inputClass} /></Field></div><Submit busy={busy === 'receive'} text="Add to stock" />
    </form></Modal>}
  </div>;
}

function Select({ value, onChange, placeholder, options, required = false }: { value: string; onChange: (value: string) => void; placeholder: string; options: { value: string; label: string }[]; required?: boolean }) {
  return <label className="relative block"><select value={value} required={required} onChange={(e) => onChange(e.target.value)} className={`${inputClass} appearance-none pr-10`}><option value="">{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={17} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" /></label>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function Submit({ busy, text }: { busy: boolean; text: string }) { return <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3.5 font-black text-white disabled:opacity-50">{busy && <Loader2 size={18} className="animate-spin" />}{text}</button>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black text-slate-950">{title}</h2><button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600"><X size={20} /></button></div>{children}</div></div>; }
function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) { return <div className="grid place-items-center px-4 py-14 text-center"><Icon size={30} className="text-slate-300" /><p className="mt-3 font-bold text-slate-400">{text}</p></div>; }
function TransferActions({ transfer, busy, onAction }: { transfer: Transfer; busy: string; onAction: (transfer: Transfer, action: string) => void }) {
  const actions = transfer.status === 'REQUESTED' ? [{ key: 'APPROVE', label: 'Approve', primary: true }, { key: 'REJECT', label: 'Reject' }] : transfer.status === 'APPROVED' ? [{ key: 'DISPATCH', label: 'Mark dispatched', primary: true }, { key: 'CANCEL', label: 'Cancel' }] : transfer.status === 'DISPATCHED' ? [{ key: 'RECEIVE', label: 'Confirm received', primary: true }] : [];
  if (!actions.length) return null;
  return <div className="mt-4 flex flex-wrap justify-end gap-2">{actions.map((action) => <button key={action.key} disabled={Boolean(busy)} onClick={() => onAction(transfer, action.key)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-50 ${action.primary ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-600'}`}>{busy === `${transfer._id}:${action.key}` ? <Loader2 size={16} className="animate-spin" /> : action.key === 'RECEIVE' ? <Check size={16} /> : null}{action.label}</button>)}</div>;
}
