'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronDown, ClipboardList, Loader2, PackageCheck, Phone, Plus, Truck, UserRound, X } from 'lucide-react';
import { getCookie } from '../../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600';
const messageFor = (error: unknown, fallback: string) => axios.isAxiosError(error) ? (error.response?.data?.error || fallback) : fallback;

type Supplier = { _id: string; name: string; phone?: string; email?: string; address?: string; notes?: string };
type Location = { _id: string; businessName: string; branchType: 'SHOP' | 'WAREHOUSE' };
type Product = { _id: string; name: string; costPrice?: number; quantity: number };
type OrderLine = { product: string; name: string; orderedQty: number; receivedQty: number; unitCost: number };
type Order = { _id: string; reference: string; supplier: Supplier; destination: Location; status: string; expectedAt?: string; notes?: string; subtotal: number; items: OrderLine[]; createdAt: string };

const statusClass: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700', ORDERED: 'bg-blue-100 text-blue-800', PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-800', RECEIVED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-red-100 text-red-700',
};

export default function PurchasingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showSupplier, setShowSupplier] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<Order | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [orderForm, setOrderForm] = useState({ supplierId: '', destinationId: '', expectedAt: '', notes: '', items: [{ productId: '', quantity: '1', unitCost: '' }] });
  const [receiveValues, setReceiveValues] = useState<Record<string, string>>({});

  const headers = useCallback(() => {
    const token = getCookie('tallyToken');
    if (!token) { router.push('/login'); return null; }
    return { Authorization: `Bearer ${token}` };
  }, [router]);

  const load = useCallback(async () => {
    const auth = headers(); if (!auth) return;
    try {
      const response = await axios.get(`${API_URL}/hq/purchasing`, { headers: auth });
      setSuppliers(response.data.suppliers || []); setOrders(response.data.orders || []); setLocations(response.data.locations || []); setCatalog(response.data.catalog || []);
    } catch (err: unknown) { setError(messageFor(err, 'Could not load purchasing.')); }
    finally { setLoading(false); }
  }, [headers]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const stats = useMemo(() => ({
    open: orders.filter((order) => ['ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status)).length,
    due: orders.reduce((sum, order) => sum + order.items.reduce((lineSum, item) => lineSum + Math.max(0, item.orderedQty - item.receivedQty), 0), 0),
    suppliers: suppliers.length,
  }), [orders, suppliers]);

  const saveSupplier = async (event: React.FormEvent) => {
    event.preventDefault(); const auth = headers(); if (!auth) return; setBusy('supplier'); setError('');
    try { await axios.post(`${API_URL}/hq/suppliers`, supplierForm, { headers: auth }); setShowSupplier(false); setSupplierForm({ name: '', phone: '', email: '', address: '', notes: '' }); await load(); }
    catch (err: unknown) { setError(messageFor(err, 'Could not save supplier.')); } finally { setBusy(''); }
  };

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault(); const auth = headers(); if (!auth) return; setBusy('order'); setError('');
    try {
      await axios.post(`${API_URL}/hq/purchase-orders`, { ...orderForm, submit: true, items: orderForm.items.map((item) => ({ ...item, quantity: Number(item.quantity), unitCost: Number(item.unitCost) })) }, { headers: auth });
      setShowOrder(false); setOrderForm({ supplierId: '', destinationId: '', expectedAt: '', notes: '', items: [{ productId: '', quantity: '1', unitCost: '' }] }); await load();
    } catch (err: unknown) { setError(messageFor(err, 'Could not create purchase order.')); } finally { setBusy(''); }
  };

  const receive = async (event: React.FormEvent) => {
    event.preventDefault(); if (!receiveOrder) return; const auth = headers(); if (!auth) return; setBusy('receive'); setError('');
    const items = Object.entries(receiveValues).filter(([, value]) => Number(value) > 0).map(([productId, value]) => ({ productId, quantity: Number(value) }));
    try { await axios.post(`${API_URL}/hq/purchase-orders/${receiveOrder._id}/receive`, { items }, { headers: auth }); setReceiveOrder(null); setReceiveValues({}); await load(); }
    catch (err: unknown) { setError(messageFor(err, 'Could not receive delivery.')); } finally { setBusy(''); }
  };

  const cancelOrder = async (order: Order) => {
    const auth = headers(); if (!auth) return; setBusy(order._id); setError('');
    try { await axios.patch(`${API_URL}/hq/purchase-orders/${order._id}`, { action: 'CANCEL' }, { headers: auth }); await load(); }
    catch (err: unknown) { setError(messageFor(err, 'Could not cancel order.')); } finally { setBusy(''); }
  };

  const addLine = () => setOrderForm((form) => ({ ...form, items: [...form.items, { productId: '', quantity: '1', unitCost: '' }] }));
  const setLine = (index: number, field: string, value: string) => setOrderForm((form) => ({ ...form, items: form.items.map((item, i) => i === index ? { ...item, [field]: value, ...(field === 'productId' ? { unitCost: String(catalog.find((product) => product._id === value)?.costPrice || '') } : {}) } : item) }));
  const removeLine = (index: number) => setOrderForm((form) => ({ ...form, items: form.items.filter((_, i) => i !== index) }));

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="animate-spin text-emerald-700" /></div>;

  return <div className="mx-auto max-w-7xl space-y-6 pb-16">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Stock replenishment</p><h1 className="mt-1 text-3xl font-black text-slate-950">Purchasing</h1></div><div className="flex gap-2"><button onClick={() => setShowSupplier(true)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black sm:flex-none">New supplier</button><button onClick={() => setShowOrder(true)} disabled={!suppliers.length || !catalog.length} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-amber-950 sm:flex-none disabled:opacity-40"><Plus size={17} /> Purchase order</button></div></header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
    <section className="grid grid-cols-3 gap-3">{[{ label: 'Open orders', value: stats.open, icon: ClipboardList }, { label: 'Units due', value: stats.due, icon: Truck }, { label: 'Suppliers', value: stats.suppliers, icon: UserRound }].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon size={18} className="text-amber-600" /><p className="mt-3 text-2xl font-black">{value}</p><p className="text-[11px] font-bold text-slate-500">{label}</p></div>)}</section>
    <div className="flex rounded-xl bg-slate-200/70 p-1 sm:w-fit"><button onClick={() => setTab('orders')} className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-black ${tab === 'orders' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Purchase orders</button><button onClick={() => setTab('suppliers')} className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-black ${tab === 'suppliers' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Suppliers</button></div>

    {tab === 'orders' ? <section className="space-y-3">{orders.map((order) => { const open = expandedOrder === order._id; return <article key={order._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button onClick={() => setExpandedOrder(open ? null : order._id)} className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{order.reference}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusClass[order.status]}`}>{order.status.replace('_', ' ')}</span></div><p className="mt-1 truncate text-sm font-bold text-slate-500">{order.supplier?.name} → {order.destination?.businessName}</p></div><div className="flex items-center gap-3"><p className="font-black">₦{Number(order.subtotal).toLocaleString()}</p><ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} /></div></button>{open && <div className="border-t border-slate-100 p-4 sm:p-5"><div className="space-y-2">{order.items.map((item) => <div key={String(item.product)} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-slate-50 p-3"><div><p className="font-black capitalize">{item.name}</p><p className="text-xs font-bold text-slate-400">{item.receivedQty} of {item.orderedQty} received</p></div><p className="font-black">₦{Number(item.unitCost).toLocaleString()}</p></div>)}</div>{['ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status) && <div className="mt-4 flex justify-end gap-2"><button disabled={busy === order._id} onClick={() => cancelOrder(order)} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-black text-red-600">Cancel</button><button onClick={() => { setReceiveOrder(order); setReceiveValues({}); }} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white"><PackageCheck size={16} /> Receive delivery</button></div>}</div>}</article>; })}{!orders.length && <Empty text="No purchase orders yet" />}</section>
    : <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{suppliers.map((supplier) => <article key={supplier._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><UserRound size={20} /></div><h2 className="mt-4 text-lg font-black">{supplier.name}</h2>{supplier.phone && <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-500"><Phone size={15} />{supplier.phone}</p>}<p className="mt-2 text-sm text-slate-500">{supplier.address || supplier.email || 'No additional details'}</p></article>)}{!suppliers.length && <Empty text="No suppliers saved" />}</section>}

    {showSupplier && <Modal title="New supplier" onClose={() => setShowSupplier(false)}><form onSubmit={saveSupplier} className="space-y-3"><Field label="Supplier name"><input required value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} className={inputClass} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Phone"><input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} className={inputClass} /></Field><Field label="Email"><input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} className={inputClass} /></Field></div><Field label="Address"><input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} className={inputClass} /></Field><Submit busy={busy === 'supplier'} text="Save supplier" /></form></Modal>}

    {showOrder && <Modal title="Create purchase order" onClose={() => setShowOrder(false)} wide><form onSubmit={createOrder} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Supplier"><Select required value={orderForm.supplierId} onChange={(value) => setOrderForm({ ...orderForm, supplierId: value })} placeholder="Choose supplier" options={suppliers.map((supplier) => ({ value: supplier._id, label: supplier.name }))} /></Field><Field label="Deliver to"><Select required value={orderForm.destinationId} onChange={(value) => setOrderForm({ ...orderForm, destinationId: value })} placeholder="Choose location" options={locations.map((location) => ({ value: location._id, label: location.businessName }))} /></Field></div><div className="space-y-2">{orderForm.items.map((item, index) => <div key={index} className="grid grid-cols-[1fr_80px_110px_36px] gap-2"><Select required value={item.productId} onChange={(value) => setLine(index, 'productId', value)} placeholder="Product" options={catalog.filter((product) => !orderForm.items.some((line, lineIndex) => lineIndex !== index && line.productId === product._id)).map((product) => ({ value: product._id, label: product.name }))} /><input required min="1" type="number" value={item.quantity} onChange={(e) => setLine(index, 'quantity', e.target.value)} placeholder="Qty" className={inputClass} /><input required min="0" type="number" value={item.unitCost} onChange={(e) => setLine(index, 'unitCost', e.target.value)} placeholder="Unit cost" className={inputClass} /><button type="button" disabled={orderForm.items.length === 1} onClick={() => removeLine(index)} className="grid place-items-center rounded-xl text-red-500 disabled:opacity-20"><X size={18} /></button></div>)}</div><button type="button" onClick={addLine} className="text-sm font-black text-emerald-700">+ Add another product</button><div className="grid gap-3 sm:grid-cols-2"><Field label="Expected date"><input type="date" value={orderForm.expectedAt} onChange={(e) => setOrderForm({ ...orderForm, expectedAt: e.target.value })} className={inputClass} /></Field><Field label="Note"><input value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} className={inputClass} /></Field></div><Submit busy={busy === 'order'} text="Create & mark ordered" /></form></Modal>}

    {receiveOrder && <Modal title={`Receive ${receiveOrder.reference}`} onClose={() => setReceiveOrder(null)}><form onSubmit={receive} className="space-y-4"><div className="space-y-3">{receiveOrder.items.filter((item) => item.receivedQty < item.orderedQty).map((item) => { const due = item.orderedQty - item.receivedQty; return <Field key={String(item.product)} label={`${item.name} · ${due} due`}><input type="number" min="0" max={due} value={receiveValues[String(item.product)] || ''} onChange={(e) => setReceiveValues({ ...receiveValues, [String(item.product)]: e.target.value })} placeholder="Quantity received" className={inputClass} /></Field>; })}</div><Submit busy={busy === 'receive'} text="Confirm received stock" /></form></Modal>}
  </div>;
}

function Select({ value, onChange, placeholder, options, required = false }: { value: string; onChange: (value: string) => void; placeholder: string; options: { value: string; label: string }[]; required?: boolean }) { return <label className="relative block"><select required={required} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} appearance-none pr-9`}><option value="">{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" /></label>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function Submit({ busy, text }: { busy: boolean; text: string }) { return <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 font-black text-white disabled:opacity-50">{busy ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}{text}</button>; }
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"><div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6 ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2"><X size={19} /></button></div>{children}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="col-span-full grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-16"><ClipboardList className="text-slate-300" /><p className="mt-3 font-bold text-slate-400">{text}</p></div>; }
