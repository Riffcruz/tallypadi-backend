'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Search,
  Star,
  PauseCircle,
} from 'lucide-react';
import { CartItem, RestoredSaleDraft, SaleCustomer, SaleDraftDetails, UserProfile } from './page';
import { getCookie } from '../../utils/cookies';
import SalesCalculator from './SalesCalculator';
import { createClientSaleId, OfflineSalePayload, submitDurableSale } from '../../lib/offlineSales';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface CartSidebarProps {
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  user: UserProfile | null;
  onCheckoutSuccess: () => void;
  onHoldCart: (details: SaleDraftDetails) => void;
  restoredDraft: RestoredSaleDraft | null;
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

async function presentPdfActions(url: string) {
  const result = await Swal.fire({
    icon: 'success',
    title: 'Sale Complete ✅',
    text: 'Receipt is ready. What would you like to do?',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'Print Now',
    denyButtonText: 'Preview / Download',
    cancelButtonText: 'Close (No Receipt)',
    confirmButtonColor: '#0F766E',
    denyButtonColor: '#374151',
    cancelButtonColor: '#94a3b8',
    reverseButtons: true,
    focusConfirm: true,
  });

  if (result.isConfirmed) {
      // Direct Print via hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);
      
      iframe.onload = () => {
          try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
          } catch (e) {
              console.error('Print failed', e);
              openPdfInNewTab(url); // Fallback
          }
          // Cleanup
          setTimeout(() => {
              try { document.body.removeChild(iframe); } catch {}
          }, 60000);
      };
      
      Swal.fire({
        toast: true,
        icon: 'success',
        title: 'Printing...',
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
      });

  } else if (result.isDenied) {
      openPdfInNewTab(url);
  }
}



/**
 * ✅ IMPORTANT:
 * Fetch receipt ONLY for this saleId (NOT /sales/report).
 */
async function fetchReceiptPdfForSale(token: string, saleId?: string, directReceiptUrl?: string, receiptFormat: 'standard' | 'thermal' | 'thermal58' = 'thermal') {
  if (!saleId && !directReceiptUrl) {
    throw new Error('Missing saleId from checkout response. Backend must return saleId.');
  }

  // 1) If backend returned a direct receipt URL
  if (directReceiptUrl) {
    // if relative, make absolute
    const baseUrl = directReceiptUrl.startsWith('/') ? `${window.location.origin}${directReceiptUrl}` : directReceiptUrl;
    const formatParam = receiptFormat === 'standard' ? '' : `${baseUrl.includes('?') ? '&' : '?'}format=${receiptFormat}`;
    const url = `${baseUrl}${formatParam}`;

    // try with auth
    try {
      const r = await axios.get(url, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60_000,
      });
      return new Blob([r.data], { type: 'application/pdf' });
    } catch (error) {
      // Retry without auth only when the link explicitly rejected credentials.
      // A timeout must not trigger another full 60-second request.
      if (!axios.isAxiosError(error) || ![401, 403].includes(Number(error.response?.status))) throw error;
      const r = await axios.get(url, { responseType: 'blob', timeout: 60_000 });
      return new Blob([r.data], { type: 'application/pdf' });
    }
  }

  const query = receiptFormat === 'standard' ? '' : `?format=${receiptFormat}`;

  // 2) Otherwise call your receipt endpoint
  const res = await axios.get(`${API_URL}/sales/${saleId}/receipt${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
    timeout: 60_000,
  });
  return new Blob([res.data], { type: 'application/pdf' });
}

function extractSaleId(data: Record<string, unknown>): string | undefined {
  const transaction = data.transaction && typeof data.transaction === 'object'
    ? data.transaction as Record<string, unknown>
    : {};
  // ✅ Handles: { saleId }, { transaction: { _id } }, etc.
  const raw =
    data.saleId ||
    data.transactionId ||
    data.txId ||
    data.id ||
    data._id ||
    transaction._id ||
    transaction.id ||
    transaction.saleId;

  const s = String(raw || '').trim();
  return s ? s : undefined;
}

function messageFromError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (record.message || record.error) return String(record.message || record.error);
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function CartSidebar({
  cart,
  setCart,
  user,
  onCheckoutSuccess,
  onHoldCart,
  restoredDraft,
}: CartSidebarProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [receiptType, setReceiptType] = useState<'standard' | 'thermal' | 'thermal58'>('thermal');
  const [paymentMethod, setPaymentMethod] = useState<string>(restoredDraft?.paymentMethod || 'CASH');
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SaleCustomer | null>(restoredDraft?.customer || null);

  const [discountAmount, setDiscountAmount] = useState<number>(Math.max(0, Number(restoredDraft?.discountAmount) || 0));
  const [customers, setCustomers] = useState<SaleCustomer[]>([]);
  const customersFetchedAt = useRef(0);

  const refreshCustomers = useCallback((force = false) => {
    if (!force && Date.now() - customersFetchedAt.current < 30_000) return;
    const token = getCookie('tallyToken');
    if (!token) return;
    axios.get(`${API_URL}/customers`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const next = Array.isArray(res.data) ? res.data : (res.data?.customers || res.data?.data || []);
        setCustomers(Array.isArray(next) ? next : []);
        customersFetchedAt.current = Date.now();
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    refreshCustomers(true);
  }, [refreshCustomers]);

  // store blob url + saleId so buttons work after generation
  const [receipt, setReceipt] = useState<{ saleId?: string; url?: string } | null>(null);

  const clearReceipt = useCallback(() => {
    setReceipt((current) => {
      if (current?.url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(current.url); } catch {}
      }
      return null;
    });
  }, []);

  const resetOrderFields = useCallback((includeReceipt = true) => {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    setDiscountAmount(0);
    setPaymentMethod('CASH');
    setConfirmOpen(false);
    if (includeReceipt) clearReceipt();
  }, [clearReceipt]);

  const previousCartLength = useRef(cart.length);
  useEffect(() => {
    if (previousCartLength.current === 0 && cart.length > 0) clearReceipt();
    previousCartLength.current = cart.length;
  }, [cart.length, clearReceipt]);

  // ✅ cleanup old blob urls
  useEffect(() => {
    return () => {
      if (receipt?.url && receipt.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(receipt.url);
        } catch {}
      }
    };
  }, [receipt?.url]);

  const total = useMemo(() => cart.reduce((acc, item) => acc + item.sellQty * item.sellPrice, 0), [cart]);
  const effectiveDiscount = Math.min(Math.max(0, discountAmount), Math.max(0, total));
  const netTotal = Math.max(0, total - effectiveDiscount);

  const royaltySettings = user?.settings?.royalty;
  const isRoyaltyEnabled = royaltySettings?.enabled;
  const pointValue = royaltySettings?.redemptionValuePerPoint || 1;
  const pointsRequired = netTotal / pointValue;
  const hasEnoughPoints = selectedCustomer ? (selectedCustomer.royaltyPoints || 0) >= pointsRequired : false;

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c => 
      (c.name || '').toLowerCase().includes(q) || 
      (c.phoneNumber || '').toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency',
      currency: user?.currencyCode || 'NGN',
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  };

  const updateQty = (id: string, delta: number) => {
    const current = cart.find((item) => item.id === id);
    if (!current) return;
    const availableStock = Math.max(0, Number(current.stock) || 0);
    const nextQuantity = Math.min(availableStock, Math.max(1, current.sellQty + delta));
    if (delta > 0 && current.sellQty >= availableStock) {
      setMsg({ type: 'error', text: `Only ${availableStock} unit${availableStock === 1 ? '' : 's'} of ${current.name} are available.` });
      window.setTimeout(() => setMsg({ text: '', type: '' }), 3000);
      return;
    }
    const nextCart = cart.map((item) => (item.id === id ? { ...item, sellQty: nextQuantity } : item));
    setCart(nextCart);
    const nextTotal = nextCart.reduce((sum, item) => sum + item.sellQty * item.sellPrice, 0);
    setDiscountAmount((value) => Math.min(value, nextTotal));
  };

  const updatePrice = (id: string, val: number) => {
    const safeValue = Number.isFinite(val) ? Math.min(1_000_000_000_000, Math.max(0, val)) : 0;
    const nextCart = cart.map((item) => (item.id === id ? { ...item, sellPrice: safeValue } : item));
    setCart(nextCart);
    const nextTotal = nextCart.reduce((sum, item) => sum + item.sellQty * item.sellPrice, 0);
    setDiscountAmount((value) => Math.min(value, nextTotal));
  };

  const remove = (id: string) => {
    const nextCart = cart.filter((item) => item.id !== id);
    setCart(nextCart);
    const nextTotal = nextCart.reduce((sum, item) => sum + item.sellQty * item.sellPrice, 0);
    setDiscountAmount((value) => Math.min(value, nextTotal));
  };

  const holdCurrentOrder = () => {
    onHoldCart({ customer: selectedCustomer, discountAmount: effectiveDiscount, paymentMethod });
    resetOrderFields(true);
  };

  const clearCurrentOrder = () => {
    setCart([]);
    resetOrderFields(true);
    setMsg({ text: '', type: '' });
  };

  const handleShareReceipt = async () => {
    if (!receipt?.url) return;

    try {
      // Prefer file share when available
      if (navigator.canShare) {
        const r = await fetch(receipt.url);
        const blob = await r.blob();
        const file = new File([blob], `TallyPadi_Receipt_${buildStamp()}_${receipt.saleId || ''}.pdf`, {
          type: 'application/pdf',
        });

        if (navigator.canShare({ files: [file] }) && navigator.share) {
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

    const invalidItem = cart.find((item) => (
      !Number.isFinite(Number(item.sellQty))
      || item.sellQty <= 0
      || item.sellQty > Math.max(0, Number(item.stock) || 0)
      || !Number.isFinite(Number(item.sellPrice))
      || item.sellPrice < 0
    ));
    if (invalidItem) {
      Swal.fire({
        title: 'Check this order',
        text: `${invalidItem.name} has an invalid quantity or selling price.`,
        icon: 'warning',
        confirmButtonColor: '#0F766E',
      });
      return;
    }

    if (paymentMethod === 'POINTS' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      Swal.fire({
        title: 'Connection required for points',
        text: 'Choose cash, transfer, POS or card while offline. Customer points must be verified online.',
        icon: 'info',
        confirmButtonColor: '#0F766E',
      });
      return;
    }

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
      const userId = String(user?.id || user?._id || '').trim();
      if (!userId) throw new Error('Could not identify the signed-in user. Please sign in again.');

      const payload: OfflineSalePayload = {
        clientSaleId: createClientSaleId(),
        recordedAt: new Date().toISOString(),
        offlineCreated: typeof navigator !== 'undefined' && navigator.onLine === false,
        paymentMethod,
        customerId: selectedCustomer?._id || undefined,
        discountAmount: effectiveDiscount,
        items: cart.map((i) => ({
          itemId: i.id,
          quantity: Number(i.sellQty),
          price: Number(i.sellPrice ?? i.price ?? 0),
          name: i.name,
        })),
      };

      // The sale is committed to IndexedDB before the network request starts.
      // A timeout or tab close can therefore be retried with the same server key.
      const delivery = await submitDurableSale(userId, payload, token, API_URL);
      if (delivery.state === 'queued') {
        setMsg({ text: 'Sale saved safely. It will upload automatically when the connection is available.', type: 'success' });
        onCheckoutSuccess();
        resetOrderFields(true);
        await Swal.fire({
          title: 'Sale saved offline',
          text: 'You can continue selling. This sale will sync automatically without being recorded twice.',
          icon: 'success',
          confirmButtonColor: '#0F766E',
        });
        return;
      }
      if (delivery.state === 'needs_attention') {
        throw new Error(delivery.message);
      }

      const data = delivery.data || {};
      const transactionData = data.transaction && typeof data.transaction === 'object'
        ? data.transaction as Record<string, unknown>
        : undefined;

      // ✅ FIX: robust saleId parsing
      const saleId = extractSaleId(data);

      // optional if backend returns direct receipt url
      const directReceiptUrl =
        (typeof data.receiptUrl === 'string' && data.receiptUrl) ||
        (typeof data.pdfUrl === 'string' && data.pdfUrl) ||
        (typeof transactionData?.receiptUrl === 'string' && transactionData.receiptUrl) ||
        undefined;

      setMsg({ text: '✅ Sale recorded successfully!', type: 'success' });
      onCheckoutSuccess();
      resetOrderFields(false);

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

      try {
        Swal.fire({
          title: 'Generating receipt PDF…',
          html: 'The sale is already recorded. Please wait while the receipt is prepared.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => Swal.showLoading(),
        });

        const pdfBlob = await fetchReceiptPdfForSale(token, saleId, directReceiptUrl, receiptType);
        Swal.close();

        const blobUrl = URL.createObjectURL(pdfBlob);
        setReceipt({ saleId, url: blobUrl });

        await presentPdfActions(blobUrl);
      } catch (receiptError: unknown) {
        Swal.close();
        console.error('Receipt generation error:', receiptError);
        const receiptMessage = messageFromError(receiptError, 'The receipt could not be generated right now.');
        setMsg({ text: 'Sale recorded. Receipt generation needs to be retried from Sales History.', type: 'success' });
        await Swal.fire({
          title: 'Sale recorded successfully',
          text: `The receipt was not generated: ${receiptMessage}. You can generate it later from Sales History. Do not record the sale again.`,
          icon: 'warning',
          confirmButtonColor: '#0F766E',
        });
      }
    } catch (err: unknown) {
      console.error('Checkout Error:', err);
      const errorMsg = messageFromError(err, 'Checkout failed');
      setMsg({ text: errorMsg, type: 'error' });

      Swal.fire({
        title: 'Sale not recorded',
        text: errorMsg,
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
    <aside className="relative flex w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 xl:sticky xl:top-4 xl:h-[calc(100dvh-2rem)]">
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
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={holdCurrentOrder}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-800 transition hover:bg-amber-100"
                title="Hold Order"
              >
                <PauseCircle className="h-4 w-4" /> Hold
              </button>
              <button
                onClick={clearCurrentOrder}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-xs font-black text-red-700 transition hover:bg-red-50"
                title="Clear cart"
              >
                <Trash2 className="h-4 w-4" /> Clear
              </button>
            </div>
          )}
        </div>
      </div>

      <SalesCalculator
        total={total}
        netTotal={netTotal}
        currencyCode={user?.currencyCode}
        locale={user?.locale}
        discountAmount={effectiveDiscount}
        onApplyDiscount={(amount) => setDiscountAmount(Math.min(total, Math.max(0, Number(amount) || 0)))}
      />

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
                  className="rounded-xl border border-red-100 bg-red-50 p-2 text-red-600 transition-colors hover:border-red-200 hover:bg-red-100"
                  title="Remove item"
                  aria-label={`Remove ${item.name} from order`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center bg-slate-50 rounded-2xl border border-slate-200 p-1">
                  <button
                    onClick={() => updateQty(item.id, -1)}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-sm transition-all hover:border-emerald-300"
                    aria-label={`Reduce ${item.name} quantity`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-sm font-extrabold w-10 text-center tabular-nums text-slate-900">
                    {item.sellQty}
                  </span>
                  <button
                    onClick={() => updateQty(item.id, 1)}
                    disabled={item.sellQty >= Math.max(0, Number(item.stock) || 0)}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-800 shadow-sm transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    aria-label={`Increase ${item.name} quantity`}
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
                    min="0"
                    max="1000000000000"
                    step="any"
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

        {/* Cart Controls: Customer & Discount */}
        {cart.length > 0 && (
          <div className="mb-4 space-y-3 p-3 bg-white rounded-2xl border border-slate-200">
            <div className="relative">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1.5 block">Customer (Optional)</label>
              
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-emerald-900">{selectedCustomer.name}</p>
                    <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">{selectedCustomer.phoneNumber}</p>
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); if (paymentMethod === 'POINTS') setPaymentMethod('CASH'); }} className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-700 transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Search className="w-4 h-4" /></span>
                  <input 
                    type="text"
                    placeholder="Search name or phone..."
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 transition-colors"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => {
                      setShowCustomerDropdown(true);
                      refreshCustomers();
                    }}
                  />
                  
                  {showCustomerDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCustomerDropdown(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-xl z-50 max-h-48 overflow-y-auto">
                        <button 
                          className="w-full text-left px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 border-b border-slate-100"
                          onClick={() => { setSelectedCustomer(null); setShowCustomerDropdown(false); }}
                        >
                          Guest (Walk-in)
                        </button>
                        {filteredCustomers.length === 0 ? (
                           <div className="px-3 py-4 text-xs font-bold text-slate-400 text-center">No customers found</div>
                        ) : (
                          filteredCustomers.map(c => (
                            <button 
                              key={c._id}
                              className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-slate-50 flex justify-between items-center"
                              onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); }}
                            >
                              <div>
                                <p className="text-sm font-extrabold text-slate-800">{c.name}</p>
                                <p className="text-[10px] font-bold text-slate-500">{c.phoneNumber}</p>
                              </div>
                              {isRoyaltyEnabled && Number(c.royaltyPoints || 0) > 0 && (
                                <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 px-2 py-1 rounded-md flex items-center gap-1"><Star className="w-3 h-3 fill-current" /> {Number(c.royaltyPoints || 0)}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400">Discount</label>
              <div className="relative w-1/2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{prefix}</span>
                <input 
                  type="number" 
                  min="0"
                  max={total}
                  step="any"
                  className="w-full pl-7 pr-3 py-2 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-right bg-slate-50"
                  value={effectiveDiscount || ''}
                  onChange={(e) => setDiscountAmount(Math.min(total, Math.max(0, Number(e.target.value) || 0)))}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        )}

        {effectiveDiscount > 0 && (
          <div className="flex justify-between items-end mb-1">
            <span className="text-slate-500 font-bold text-sm">Subtotal</span>
            <span className="text-sm font-bold text-slate-700">{formatMoney(total)}</span>
          </div>
        )}

        <div className="flex justify-between items-end mb-4">
          <span className="text-slate-500 font-extrabold text-sm mb-1">Total</span>
          <span className="text-2xl font-black text-slate-900 tracking-tight">{formatMoney(netTotal)}</span>
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
          <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-slate-900 font-black text-lg">Confirm Sale</h3>
                <p className="text-slate-500 text-sm font-semibold mt-1">
                  Total: <span className="text-slate-900">{formatMoney(netTotal)}</span> • {cart.length} item(s)
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
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Order summary</p>
                  <span className="text-xs font-black text-slate-700">
                    {cart.reduce((sum, item) => sum + item.sellQty, 0)} unit(s)
                  </span>
                </div>
                <div className="space-y-2">
                  {cart.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-bold text-slate-700">{item.sellQty}× {item.name}</span>
                      <span className="shrink-0 font-black text-slate-900">{formatMoney(item.sellQty * item.sellPrice)}</span>
                    </div>
                  ))}
                  {cart.length > 3 && (
                    <p className="text-xs font-bold text-slate-500">+{cart.length - 3} more product(s)</p>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs">
                  <div>
                    <p className="font-bold text-slate-500">Customer</p>
                    <p className="mt-0.5 truncate font-black text-slate-800">{selectedCustomer?.name || 'Guest'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-500">Discount</p>
                    <p className="mt-0.5 font-black text-slate-800">{formatMoney(effectiveDiscount)}</p>
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'CASH', label: 'Cash', icon: Banknote },
                    { id: 'TRANSFER', label: 'Transfer', icon: Landmark },
                    { id: 'POS', label: 'POS', icon: CreditCard },
                    { id: 'OPAY', label: 'OPay', icon: Smartphone },
                    ...(isRoyaltyEnabled ? [{ id: 'POINTS', label: 'Points', icon: Star }] : [])
                  ].map((pm) => (
                    <button
                      key={pm.id}
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-sm font-bold transition-all ${
                        paymentMethod === pm.id
                          ? pm.id === 'POINTS' 
                             ? 'bg-yellow-50 border-yellow-500 text-yellow-800 shadow-sm ring-1 ring-yellow-500/20' 
                             : 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm ring-1 ring-emerald-500/20'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-200 hover:bg-slate-50'
                      }`}
                    >
                      <pm.icon className={`w-4 h-4 ${paymentMethod === pm.id ? (pm.id === 'POINTS' ? 'text-yellow-600 fill-yellow-600 mt-[-1px]' : 'text-emerald-600') : 'text-slate-400'}`} />
                      {pm.label}
                    </button>
                  ))}
                </div>
                
                {paymentMethod === 'POINTS' && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl animate-in slide-in-from-top-1">
                    {!selectedCustomer ? (
                      <p className="text-xs font-bold text-yellow-800 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" /> Please select a Customer to pay with points.
                      </p>
                    ) : (
                       <div className="space-y-2">
                         <div className="flex justify-between items-end">
                            <span className="text-xs font-bold text-yellow-700">Points Required:</span>
                            <span className="text-sm font-black text-yellow-900">{Math.ceil(pointsRequired)} pts</span>
                         </div>
                         <div className="flex justify-between items-end">
                            <span className="text-xs font-bold text-yellow-700">Customer Balance:</span>
                            <span className="text-sm font-black text-yellow-900">{selectedCustomer.royaltyPoints || 0} pts</span>
                         </div>
                         
                         {!hasEnoughPoints && (
                           <div className="pt-2 border-t border-yellow-200/50 mt-2">
                              <p className="text-xs font-bold text-red-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Insufficient points for this order.</p>
                           </div>
                         )}
                       </div>
                    )}
                  </div>
                )}
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
                
                {printReceipt && (
                  <div className="mt-3 pl-7 grid gap-3 sm:grid-cols-3 animate-in slide-in-from-top-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="receiptType"
                        checked={receiptType === 'standard'}
                        onChange={() => setReceiptType('standard')}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-sm font-bold text-slate-700">Standard (A4)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="receiptType"
                        checked={receiptType === 'thermal'}
                        onChange={() => setReceiptType('thermal')}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-sm font-bold text-slate-700">Thermal (80mm)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="receiptType"
                        checked={receiptType === 'thermal58'}
                        onChange={() => setReceiptType('thermal58')}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-sm font-bold text-slate-700">Thermal (58mm)</span>
                    </label>
                  </div>
                )}
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
                  disabled={loading || (paymentMethod === 'POINTS' && (!selectedCustomer || !hasEnoughPoints))}
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
    </aside>
  );
}
