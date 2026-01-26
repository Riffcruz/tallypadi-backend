'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import {
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShoppingCart,
  ArrowRight,
  FileDown,
  Share2,
  Printer,
  X,
  CreditCard,
  Landmark,
  Smartphone,
  Banknote,
} from 'lucide-react';
import { CartItem, UserProfile } from './page';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface CartSidebarProps {
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  user: UserProfile | null;
  onCheckoutSuccess: () => void;
}

function currencyPrefix(code?: string) {
  const c = String(code || 'NGN').toUpperCase();
  const map: Record<string, string> = {
    NGN: '₦',
    USD: '$',
    GBP: '£',
    EUR: '€',
    GHS: '₵',
    KES: 'KSh',
    ZAR: 'R',
    INR: '₹',
    CAD: 'C$',
  };
  return map[c] || c;
}

// 22-12-2025_14-05
function buildStamp() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy}_${hh}-${mi}`;
}

function openPdfInNewTab(url: string) {
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

async function presentPdfActions(url: string, fileName: string) {
  const doDownload = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };



  const doPreview = () => openPdfInNewTab(url);

  const result = await Swal.fire({
    icon: 'success',
    title: 'Receipt PDF is ready ✅',
    html: `<p style="margin:0;color:#475569;font-size:13px">What do you want to do?</p>`,
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'Preview',
    denyButtonText: 'Download',
    cancelButtonText: 'Both',
    confirmButtonColor: '#0F766E',
    denyButtonColor: '#111827',
    cancelButtonColor: '#64748b',
    reverseButtons: true,
    focusConfirm: false,
  });

  if (result.isConfirmed) doPreview();
  else if (result.isDenied) doDownload();
  else {
    doPreview();
    doDownload();
  }

  Swal.fire({
    toast: true,
    icon: 'success',
    title: 'Done',
    text: result.isConfirmed ? 'Opened preview.' : result.isDenied ? 'Download started.' : 'Preview + download started.',
    position: 'top-end',
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true,
  });
}



/**
 * ✅ IMPORTANT:
 * Fetch receipt ONLY for this saleId (NOT /sales/report).
 */
async function fetchReceiptPdfForSale(token: string, saleId?: string, directReceiptUrl?: string) {
  if (!saleId && !directReceiptUrl) {
    throw new Error('Missing saleId from checkout response. Backend must return saleId.');
  }

  // 1) If backend returned a direct receipt URL
  if (directReceiptUrl) {
    // if relative, make absolute
    const url = directReceiptUrl.startsWith('/') ? `${window.location.origin}${directReceiptUrl}` : directReceiptUrl;

    // try with auth
    try {
      const r = await axios.get(url, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60_000,
      });
      return new Blob([r.data], { type: 'application/pdf' });
    } catch {
      // try without auth (if public link)
      const r = await axios.get(url, { responseType: 'blob', timeout: 60_000 });
      return new Blob([r.data], { type: 'application/pdf' });
    }
  }

  // 2) Otherwise call your receipt endpoint
  const endpoints = [
    `${API_URL}/sales/${saleId}/receipt`, // ✅ your real route
    `${API_URL}/sales/${saleId}/pdf`, // optional fallback if you add it later
    `${API_URL}/sales/receipt?saleId=${encodeURIComponent(String(saleId))}`, // optional fallback
  ];

  let lastErr: any = null;

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
        timeout: 60_000,
      });

      return new Blob([res.data], { type: 'application/pdf' });
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Receipt endpoint failed');
}

function extractSaleId(data: any): string | undefined {
  // ✅ Handles: { saleId }, { transaction: { _id } }, etc.
  const raw =
    data?.saleId ||
    data?.transactionId ||
    data?.txId ||
    data?.id ||
    data?._id ||
    data?.transaction?._id ||
    data?.transaction?.id ||
    data?.transaction?.saleId;

  const s = String(raw || '').trim();
  return s ? s : undefined;
}

export default function CartSidebar({ cart, setCart, user, onCheckoutSuccess }: CartSidebarProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');

  // store blob url + saleId so buttons work after generation
  const [receipt, setReceipt] = useState<{ saleId?: string; url?: string } | null>(null);

  // ✅ cleanup old blob urls
  useEffect(() => {
    return () => {
      if (receipt?.url && receipt.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(receipt.url);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.url]);

  const total = useMemo(() => cart.reduce((acc, item) => acc + item.sellQty * item.sellPrice, 0), [cart]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency',
      currency: user?.currencyCode || 'NGN',
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, sellQty: Math.max(1, item.sellQty + delta) } : item))
    );
  };

  const updatePrice = (id: string, val: number) => {
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, sellPrice: val } : item)));
  };

  const remove = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id));

  const handleShareReceipt = async () => {
    if (!receipt?.url) return;

    try {
      // Prefer file share when available
      if ((navigator as any).canShare) {
        const r = await fetch(receipt.url);
        const blob = await r.blob();
        const file = new File([blob], `TallyPadi_Receipt_${buildStamp()}_${receipt.saleId || ''}.pdf`, {
          type: 'application/pdf',
        });

        if ((navigator as any).canShare({ files: [file] }) && navigator.share) {
          await navigator.share({
            title: 'TallyPadi Receipt',
            text: 'Receipt PDF',
            files: [file],
          });
          return;
        }
      }

      if (navigator.share) {
        await navigator.share({
          title: 'TallyPadi Receipt',
          text: 'Receipt PDF',
          url: receipt.url,
        });
        return;
      }

      await navigator.clipboard.writeText(receipt.url);
      setMsg({ type: 'success', text: '✅ Receipt link copied.' });
      setTimeout(() => setMsg({ text: '', type: '' }), 2500);
    } catch {
      setMsg({ type: 'error', text: 'Could not share/copy receipt.' });
      setTimeout(() => setMsg({ text: '', type: '' }), 2500);
    }
  };

  const doCheckout = async (alsoPrint: boolean) => {
    if (cart.length === 0) return;

    setLoading(true);
    setMsg({ text: '', type: '' });
    setReceipt(null);

    const token = getCookie('tallyToken');
    if (!token) {
      setLoading(false);
      setMsg({ text: 'You are not logged in.', type: 'error' });
      return;
    }

    try {
      const payload = {
        paymentMethod, // ✅ Add this
        items: cart.map((i) => ({
          itemId: i.id,
          quantity: Number(i.sellQty),
          price: Number(i.sellPrice),
        })),
      };

      const res = await axios.post(`${API_URL}/sales`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60_000,
      });

      const data = res.data || {};

      // ✅ FIX: robust saleId parsing
      const saleId = extractSaleId(data);

      // optional if backend returns direct receipt url
      const directReceiptUrl =
        (typeof data.receiptUrl === 'string' && data.receiptUrl) ||
        (typeof data.pdfUrl === 'string' && data.pdfUrl) ||
        (typeof data.transaction?.receiptUrl === 'string' && data.transaction.receiptUrl) ||
        undefined;

      setMsg({ text: '✅ Sale recorded successfully!', type: 'success' });
      onCheckoutSuccess();

      if (!alsoPrint) return;

      // client-side gate (server should also gate)
      if (String(user?.planType || '').toUpperCase() !== 'TYCOON') {
        Swal.fire({
          title: 'Upgrade Required',
          text: 'Receipt PDFs are available exclusively for Tycoon Plan users.',
          icon: 'info',
          showCancelButton: true,
          confirmButtonText: 'Upgrade to Tycoon',
          confirmButtonColor: '#0F766E',
          cancelButtonText: 'Close',
          cancelButtonColor: '#64748b',
        }).then((r) => {
          if (r.isConfirmed) router.push('/payment?plan=TYCOON');
        });
        return;
      }

      Swal.fire({
        title: 'Generating receipt PDF…',
        html: 'Only this checkout items will be included.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
      });

      const pdfBlob = await fetchReceiptPdfForSale(token, saleId, directReceiptUrl);

      Swal.close();

      const blobUrl = URL.createObjectURL(pdfBlob);
      setReceipt({ saleId, url: blobUrl });

      const fileName = `TallyPadi_Receipt_${buildStamp()}_${saleId || 'sale'}.pdf`;
      await presentPdfActions(blobUrl, fileName);
    } catch (err: any) {
      console.error('Checkout Error:', err);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Checkout failed';
      setMsg({ text: errorMsg, type: 'error' });

      Swal.fire({
        title: 'Receipt/Checkout Failed',
        text:
          String(errorMsg).includes('Missing saleId')
            ? 'Backend must return saleId from POST /api/sales so we can generate a receipt for only this checkout.'
            : errorMsg,
        icon: 'error',
        confirmButtonColor: '#0F766E',
      });
    } finally {
      setLoading(false);
      setTimeout(() => setMsg({ text: '', type: '' }), 4500);
    }
  };

  const handleCheckoutClick = () => {
    if (cart.length === 0 || loading) return;
    setConfirmOpen(true);
  };

  const prefix = currencyPrefix(user?.currencyCode);

  return (
    <div className="relative bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-900/5 flex flex-col h-[calc(100vh-6rem)] sticky top-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-emerald-500/10 to-transparent" />

      {/* Header */}
      <div className="p-5 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shadow-sm">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-extrabold text-slate-900 text-lg leading-tight">Current Order</h2>
            <p className="text-xs text-slate-500 font-semibold">
              {cart.length} item{cart.length === 1 ? '' : 's'}
            </p>
          </div>

          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="ml-auto text-xs font-bold text-slate-500 hover:text-slate-900 transition"
              title="Clear cart"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-70">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl border border-slate-200 flex items-center justify-center mb-4">
              <ShoppingCart className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-900 font-extrabold">Your cart is empty</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">Tap items from the grid to add them here.</p>
          </div>
        ) : (
          cart.map((item) => (
            <div
              key={item.id}
              className="group bg-white p-3.5 rounded-3xl border border-slate-200/70 hover:border-emerald-200 hover:shadow-md transition-all"
            >
              <div className="flex justify-between items-start mb-3 gap-2">
                <div className="min-w-0">
                  <span className="block font-extrabold text-sm text-slate-900 capitalize truncate">{item.name}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{formatMoney(item.sellPrice)} each</span>
                </div>

                <button
                  onClick={() => remove(item.id)}
                  className="text-slate-300 hover:text-red-600 transition-colors p-2 rounded-2xl hover:bg-red-50"
                  title="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center bg-slate-50 rounded-2xl border border-slate-200 p-1">
                  <button
                    onClick={() => updateQty(item.id, -1)}
                    className="p-2 hover:bg-white hover:shadow-sm rounded-xl text-slate-700 transition-all"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-sm font-extrabold w-10 text-center tabular-nums text-slate-900">
                    {item.sellQty}
                  </span>
                  <button
                    onClick={() => updateQty(item.id, 1)}
                    className="p-2 hover:bg-white hover:shadow-sm rounded-xl text-slate-700 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <span className="text-slate-300 text-xs font-bold">×</span>

                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-extrabold">
                    {prefix}
                  </span>
                  <input
                    type="number"
                    className="w-full pl-10 pr-3 py-2.5 text-sm font-extrabold border border-slate-200 rounded-2xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-right bg-white"
                    value={item.sellPrice}
                    onChange={(e) => updatePrice(item.id, Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="text-right mt-3 pt-3 border-t border-dashed border-slate-200/80">
                <span className="inline-flex text-xs font-extrabold text-slate-900 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl">
                  {formatMoney(item.sellQty * item.sellPrice)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-5 bg-slate-50 border-t border-slate-200 z-10">
        {msg.text && (
          <div
            className={`mb-4 p-3.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 animate-in slide-in-from-bottom-2 ${
              msg.type === 'success'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                : 'bg-red-100 text-red-900 border border-red-200'
            }`}
          >
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="min-w-0">{msg.text}</span>
          </div>
        )}

        {/* Receipt actions */}
        {receipt?.url && (
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={() => openPdfInNewTab(receipt.url!)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-900 font-extrabold text-xs hover:bg-slate-100 transition"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>

            <a
              href={receipt.url}
              download={`TallyPadi_Receipt_${buildStamp()}_${receipt.saleId || 'sale'}.pdf`}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-900 font-extrabold text-xs hover:bg-slate-100 transition"
            >
              <FileDown className="w-4 h-4" />
              Download
            </a>

            <button
              onClick={handleShareReceipt}
              className="w-11 h-11 inline-flex items-center justify-center rounded-2xl bg-slate-900 text-white hover:bg-black transition"
              title="Share receipt"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex justify-between items-end mb-4">
          <span className="text-slate-500 font-extrabold text-sm mb-1">Total</span>
          <span className="text-2xl font-black text-slate-900 tracking-tight">{formatMoney(total)}</span>
        </div>

        <button
          onClick={handleCheckoutClick}
          disabled={loading || cart.length === 0}
          className="group w-full py-4 rounded-2xl font-extrabold bg-slate-900 hover:bg-black text-white shadow-lg shadow-slate-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-3"
        >
          {loading ? (
            <Loader2 className="animate-spin w-5 h-5" />
          ) : (
            <>
              Confirm Sale <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => (!loading ? setConfirmOpen(false) : null)}
          />
          <div className="relative w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-slate-900 font-black text-lg">Confirm Sale</h3>
                <p className="text-slate-500 text-sm font-semibold mt-1">
                  Total: <span className="text-slate-900">{formatMoney(total)}</span> • {cart.length} item(s)
                </p>
              </div>
              <button
                className="w-10 h-10 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center"
                onClick={() => (!loading ? setConfirmOpen(false) : null)}
              >
                <X className="w-4 h-4 text-slate-700" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Payment Method Selector */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'CASH', label: 'Cash', icon: Banknote },
                    { id: 'TRANSFER', label: 'Transfer', icon: Landmark },
                    { id: 'POS', label: 'POS', icon: CreditCard },
                    { id: 'OPAY', label: 'OPay', icon: Smartphone },
                  ].map((pm) => (
                    <button
                      key={pm.id}
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-sm font-bold transition-all ${
                        paymentMethod === pm.id
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm ring-1 ring-emerald-500/20'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-200 hover:bg-slate-50'
                      }`}
                    >
                      <pm.icon className={`w-4 h-4 ${paymentMethod === pm.id ? 'text-emerald-600' : 'text-slate-400'}`} />
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={printReceipt}
                    onChange={(e) => setPrintReceipt(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-emerald-600"
                  />
                  <div>
                    <p className="font-extrabold text-slate-900">Generate receipt PDF</p>
                    <p className="text-xs font-semibold text-slate-600 mt-1">
                      This will generate a PDF for ONLY this checkout items.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  disabled={loading}
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 py-3 rounded-2xl font-extrabold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 transition disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  disabled={loading}
                  onClick={async () => {
                    setConfirmOpen(false);
                    await doCheckout(printReceipt);
                  }}
                  className="flex-1 py-3 rounded-2xl font-extrabold bg-slate-900 hover:bg-black text-white transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirm
                </button>
              </div>

              
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
