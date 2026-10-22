'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import Preloader from '../../components/Preloader';
import { ShoppingCart, History, Menu, Loader2, Sparkles, PauseCircle, Clock, X, Trash2, ShieldAlert } from 'lucide-react';

// Import Components
import ProductGrid from './ProductGrid';
import CartSidebar from './CartSidebar';
import SalesHistory from './SalesHistory';
import OfflineSalesStatus from './OfflineSalesStatus';

import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';

const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 1800,
  timerProgressBar: true,
  didOpen: (t) => {
    t.addEventListener('mouseenter', Swal.stopTimer);
    t.addEventListener('mouseleave', Swal.resumeTimer);
  },
});


const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- SHARED TYPES ---
export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  price: number;
  costPrice?: number;
  barcode?: string;
  sku?: string | null;
}
export interface CartItem extends InventoryItem {
  sellQty: number;
  sellPrice: number;
}
export interface SaleCustomer {
  _id: string;
  name?: string;
  phoneNumber?: string;
  royaltyPoints?: number;
}
export interface SaleDraftDetails {
  customer: SaleCustomer | null;
  discountAmount: number;
  paymentMethod: string;
}
interface HeldCart extends SaleDraftDetails {
  id: string;
  timestamp: string;
  items: CartItem[];
}
export interface RestoredSaleDraft extends SaleDraftDetails {
  restoreId: string;
}
export interface UserProfile {
  id: string;
  _id?: string;
  planType: 'OGA_BOSS' | 'TYCOON';
  subscriptionStatus?: string;
  trialEndsAt?: string;
  currencyCode?: string;
  locale?: string;
  role?: string;
  settings?: {
    staffPermissions?: {
      canViewSalesHistory?: boolean;
      canViewReports?: boolean;
    };
    royalty?: {
      enabled: boolean;
      pointsPerPurchase: number;
      currencyValuePerPoint: number;
      redemptionValuePerPoint: number;
    }
  };
}

const tokenUserId = (token: string) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    return String(decoded.id || decoded._id || decoded.userId || decoded.sub || '');
  } catch {
    return '';
  }
};

export default function SalesPage() {
  const router = useRouter();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  // Hold Cart state
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const heldCartStorageKey = useRef('');
  const [restoredDraft, setRestoredDraft] = useState<RestoredSaleDraft | null>(null);
  const [resumingHoldId, setResumingHoldId] = useState<string | null>(null);
  const [showHeldCarts, setShowHeldCarts] = useState(false);
  
  // Z-Report Close Register State
  const [showZReport, setShowZReport] = useState(false);
  const [physicalCash, setPhysicalCash] = useState('');
  const [submittingZReport, setSubmittingZReport] = useState(false);
  const canViewHistory = user?.role !== 'STAFF' || user?.settings?.staffPermissions?.canViewSalesHistory === true;
  const canViewReports = user?.role !== 'STAFF' || user?.settings?.staffPermissions?.canViewReports === true;

  useEffect(() => {
    const token = getCookie('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const staticAssets = performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin) && url.includes('/_next/static/'));
        registration.active?.postMessage({
          type: 'CACHE_SALES_SHELL',
          urls: ['/sales', ...staticAssets],
        });
      }).catch(() => undefined);
    }

    const authenticatedUserId = tokenUserId(token);
    const profileCacheKey = authenticatedUserId ? `tally_sales_profile:${authenticatedUserId}` : '';
    const scopedHeldCartKey = authenticatedUserId ? `tally_held_carts:${authenticatedUserId}` : '';
    heldCartStorageKey.current = scopedHeldCartKey;

    axios.get(`${API_URL}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8_000,
    })
      .then((res) => {
        if (res.data?.user) {
          setUser(res.data.user);
          if (profileCacheKey) localStorage.setItem(profileCacheKey, JSON.stringify(res.data.user));
          setLoadingUser(false);
        }
      })
      .catch((err) => {
        console.error('User fetch error:', err);
        if (navigator.onLine === false && profileCacheKey) {
          try {
            const cachedUser = localStorage.getItem(profileCacheKey);
            if (cachedUser) setUser(JSON.parse(cachedUser));
          } catch {
            // Stay signed in but do not trust an unreadable profile cache.
          }
        }
        setLoadingUser(false);
      });

    // Held orders are deliberately scoped to the signed-in account. Never load
    // the old global key because another account may use the same browser.
    const saved = scopedHeldCartKey ? localStorage.getItem(scopedHeldCartKey) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        window.setTimeout(() => setHeldCarts(Array.isArray(parsed) ? parsed : []), 0);
      } catch {
        window.setTimeout(() => setHeldCarts([]), 0);
      }
    }
  }, [router]);

  const saveHeldCarts = (newCarts: HeldCart[]) => {
    setHeldCarts(newCarts);
    if (heldCartStorageKey.current) localStorage.setItem(heldCartStorageKey.current, JSON.stringify(newCarts));
  };

  const handleHoldCart = (details: SaleDraftDetails) => {
    if (cart.length === 0) return;
    const timestamp = new Date().toISOString();
    const newHold: HeldCart = {
      id: timestamp,
      timestamp,
      items: cart,
      ...details,
    };
    const updated = [...heldCarts, newHold];
    saveHeldCarts(updated);
    setCart([]);
    toast.fire({ icon: 'info', title: 'Order paused' });
  };

  const resumeHold = async (holdId: string) => {
    const hold = heldCarts.find(h => h.id === holdId);
    if (!hold) return;

    if (cart.length > 0) {
      const result = await Swal.fire({
        title: 'Replace current order?',
        text: 'Resume this held order only if you no longer need the items currently in the cart.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Resume held order',
        confirmButtonColor: '#0F766E',
      });
      if (!result.isConfirmed) return;
    }

    setResumingHoldId(holdId);
    let restoredItems = hold.items;
    let adjustedCount = 0;
    let unavailableCount = 0;
    let couldNotVerify = false;

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const token = getCookie('tallyToken');
      if (token) {
        const checks = await Promise.allSettled(
          hold.items.map((item) => axios.get(`${API_URL}/inventory/${item.id}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 8_000,
          }))
        );

        restoredItems = hold.items.flatMap((item, index) => {
          const check = checks[index];
          if (check.status === 'rejected') {
            if (axios.isAxiosError(check.reason) && check.reason.response?.status === 404) {
              unavailableCount += 1;
              return [];
            }
            couldNotVerify = true;
            return [item];
          }

          const currentStock = Math.max(0, Number(check.value.data?.stock ?? check.value.data?.quantity ?? 0));
          if (currentStock <= 0) {
            unavailableCount += 1;
            return [];
          }
          const safeQuantity = Math.min(Math.max(1, Number(item.sellQty) || 1), currentStock);
          if (safeQuantity !== item.sellQty) adjustedCount += 1;
          return [{ ...item, stock: currentStock, sellQty: safeQuantity }];
        });
      }
    } else {
      couldNotVerify = true;
    }

    setResumingHoldId(null);
    if (restoredItems.length === 0) {
      await Swal.fire('Order unavailable', 'The products in this held order are no longer in stock.', 'warning');
      return;
    }

    setCart(restoredItems);
    setRestoredDraft({
      restoreId: `${hold.id}:${new Date().toISOString()}`,
      customer: hold.customer || null,
      discountAmount: Math.max(0, Number(hold.discountAmount) || 0),
      paymentMethod: hold.paymentMethod || 'CASH',
    });
    saveHeldCarts(heldCarts.filter(h => h.id !== holdId));
    setShowHeldCarts(false);

    if (adjustedCount > 0 || unavailableCount > 0 || couldNotVerify) {
      const details = [
        adjustedCount > 0 ? `${adjustedCount} quantity adjusted to available stock` : '',
        unavailableCount > 0 ? `${unavailableCount} unavailable product removed` : '',
        couldNotVerify ? 'Some stock will be checked again at checkout' : '',
      ].filter(Boolean).join('. ');
      toast.fire({ icon: 'warning', title: 'Held order reviewed', text: details });
    } else {
      toast.fire({ icon: 'success', title: 'Held order resumed' });
    }
  };

  const deleteHold = (holdId: string) => {
    saveHeldCarts(heldCarts.filter(h => h.id !== holdId));
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
     e.preventDefault();
     setSubmittingZReport(true);
     try {
       const token = getCookie('tallyToken');
       const res = await axios.post(`${API_URL}/sales/close-register`, {
          physicalCash: Number(physicalCash)
       }, { headers: { Authorization: `Bearer ${token}` } });
       
       setShowZReport(false);
       setPhysicalCash('');
       Swal.fire('Register Closed', `Expected: ${res.data.expectedCash} | Actual: ${res.data.physicalCash} | Discrepancy: ${res.data.discrepancy}. A report was pushed to the owner.`, 'success');
     } catch (err: unknown) {
       const message = axios.isAxiosError(err) && err.response?.data?.error
         ? String(err.response.data.error)
         : 'Could not close register';
       Swal.fire('Error', message, 'error');
     } finally {
       setSubmittingZReport(false);
     }
  };

const handleAddToCart = (item: InventoryItem) => {
  setCart((prev) => {
    const existing = prev.find((i) => i.id === item.id);
    const availableStock = Math.max(0, Number(item.stock) || 0);

    if (availableStock <= 0) {
      toast.fire({ icon: 'warning', title: `${item.name} is out of stock` });
      return prev;
    }

    if (existing) {
      if (existing.sellQty >= availableStock) {
        toast.fire({
          icon: 'warning',
          title: 'Available stock reached',
          text: `${availableStock} unit${availableStock === 1 ? '' : 's'} available for ${item.name}.`,
        });
        return prev;
      }

      toast.fire({
        icon: 'success',
        title: `+1 added • ${item.name}`,
      });

      return prev.map((i) =>
        i.id === item.id ? { ...i, stock: availableStock, sellQty: i.sellQty + 1 } : i
      );
    }

    toast.fire({
      icon: 'success',
      title: `Added • ${item.name}`,
      text: `Qty: 1 • Price: ${item.price}`,
    });
    return [...prev, { ...item, sellQty: 1, sellPrice: item.price || 0 }];
  });
};


  const handleClearCart = () => setCart([]);

  if (loadingUser) {
    return <Preloader />;
  }

  return (
    <div className="relative flex min-h-screen overflow-x-clip bg-slate-50 font-sans text-gray-900">
      
      {/* --- AMBIENT BACKGROUND BLOBS --- */}
      <div className="fixed -top-24 -left-24 w-96 h-96 bg-emerald-200/40 rounded-full blur-[100px] pointer-events-none z-0" />
      <div className="fixed top-1/3 -right-24 w-96 h-96 bg-blue-200/30 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <main className="relative z-10 min-h-screen w-full min-w-0 max-w-full overflow-x-clip p-4 md:pl-72 md:pr-8 md:py-8">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 md:hidden bg-white rounded-xl shadow-sm border border-gray-200 text-gray-700">
              <Menu className="w-6 h-6" />
            </button>
            
            <div>
              <div className="flex items-center gap-2 mb-1">
                 <h1 className="text-3xl font-black text-gray-900 tracking-tight">Sales Register</h1>
                 <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wide rounded-full">
                    <Sparkles className="w-3 h-3" /> Live
                 </span>
              </div>
              {user?.currencyCode && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider bg-white/50 px-2 py-1 rounded-md border border-gray-100">
                    Currency: {user.currencyCode}
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {(user?.id || user?._id) && (
                <OfflineSalesStatus userId={String(user.id || user._id)} apiUrl={API_URL} />
              )}
              {heldCarts.length > 0 && (
                 <button onClick={() => setShowHeldCarts(true)} className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 text-yellow-700 font-bold rounded-lg border border-yellow-200 shadow-sm hover:bg-yellow-100 transition-colors">
                    <Clock className="w-4 h-4" /> {heldCarts.length} Held
                 </button>
              )}
              {canViewReports && <button
                onClick={() => setShowZReport(true)}
                className="hidden sm:flex items-center gap-2 px-3 pl-2 py-1.5 bg-slate-900 text-white font-bold text-xs uppercase tracking-wide rounded-lg hover:bg-black transition-colors"
              >
                 <ShieldAlert className="w-4 h-4 text-emerald-400" /> Close Register
              </button>}
            </div>
          </div>

          {/* Segmented Tab Control */}
          <div className="flex p-1.5 bg-gray-200/50 backdrop-blur-sm rounded-xl border border-gray-200 w-full lg:w-auto">
            <button
              onClick={() => setActiveTab('new')}
              className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                activeTab === 'new' 
                  ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-gray-200' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
            >
              <ShoppingCart className="w-4 h-4" /> New Sale
            </button>
            {canViewHistory && <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                activeTab === 'history' 
                  ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-gray-200' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
            >
              <History className="w-4 h-4" /> History
            </button>}
          </div>
        </header>

        {/* Content Area */}
        <div className={activeTab === 'new'
          ? 'relative grid grid-cols-1 items-start gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500 xl:grid-cols-3 xl:gap-8'
          : 'hidden'}>
            <div className="min-w-0 xl:col-span-2">
              <ProductGrid 
                user={user} 
                onAddToCart={handleAddToCart} 
                currencyCode={user?.currencyCode || 'NGN'} 
                cart={cart}
              />
            </div>

            <div className="min-w-0 xl:col-span-1 xl:self-start">
              <CartSidebar 
                key={restoredDraft?.restoreId || 'active-sale'}
                cart={cart} 
                setCart={setCart} 
                user={user} 
                onCheckoutSuccess={handleClearCart}
                onHoldCart={handleHoldCart}
                restoredDraft={restoredDraft}
              />
            </div>
        </div>

        {canViewHistory && (
          <div className={activeTab === 'history'
            ? 'w-full animate-in fade-in slide-in-from-bottom-4 duration-500'
            : 'hidden'}>
            <SalesHistory user={user} />
          </div>
        )}

        {/* Held Carts Panel Sliding Overlay */}
        {showHeldCarts && (
           <div className="fixed inset-0 z-[60] flex items-stretch justify-end bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowHeldCarts(false)}>
              <div className="w-full max-w-sm bg-white shadow-2xl overflow-y-auto flex flex-col animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
                 <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><PauseCircle className="w-6 h-6 text-yellow-500" /> Held Orders</h3>
                    <button onClick={() => setShowHeldCarts(false)} className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50"><X className="w-5 h-5 text-gray-400"/></button>
                 </div>
                 
                 <div className="flex-1 p-5 space-y-4">
                    {heldCarts.length === 0 ? (
                       <p className="text-gray-400 text-sm font-bold text-center mt-10">No carts on hold.</p>
                    ) : heldCarts.map((h, i) => (
                       <div key={h.id} className="p-4 rounded-2xl border border-gray-200 hover:border-yellow-300 hover:shadow-md transition-all bg-white group">
                          <div className="flex justify-between items-start mb-2">
                             <div>
                               <p className="font-extrabold text-gray-900">Order #{heldCarts.length - i}</p>
                               <p className="text-xs font-bold text-gray-400 mt-0.5">{new Date(h.timestamp).toLocaleTimeString()}</p>
                             </div>
                             <button onClick={() => deleteHold(h.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                          </div>
                          
                          <p className="text-sm font-bold text-gray-600 mb-4">{h.items.length} item(s) • {h.items.reduce((acc, item) => acc + item.sellQty * item.sellPrice, 0).toLocaleString()}</p>
                          
                          <button disabled={resumingHoldId !== null} onClick={() => void resumeHold(h.id)} className="w-full py-2.5 bg-yellow-50 text-yellow-700 font-extrabold rounded-xl border border-yellow-200 hover:bg-yellow-100 hover:border-yellow-300 transition-colors disabled:cursor-wait disabled:opacity-60">
                             {resumingHoldId === h.id ? 'Checking stock…' : 'Resume Order'}
                          </button>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        )}

        {/* Z-Report Modal */}
        {showZReport && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl relative overflow-hidden">
               <div className="text-center mb-6">
                 <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-600 mx-auto mb-4 border border-red-100">
                    <ShieldAlert className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-black text-gray-900 tracking-tight">Close Register</h3>
                 <p className="text-sm text-gray-500 font-medium mt-1">End of shift Z-Report.</p>
               </div>
               
               <form onSubmit={handleCloseRegister} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Physical Cash In Drawer</label>
                    <input autoFocus required type="number" min="0" className="w-full text-center p-4 bg-slate-50 border border-slate-200 text-3xl tabular-nums rounded-2xl font-black text-gray-900 outline-none focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all" placeholder="0" value={physicalCash} onChange={e => setPhysicalCash(e.target.value)} />
                  </div>
                  
                  <div className="flex gap-3 mt-6">
                    <button type="button" onClick={() => setShowZReport(false)} className="flex-1 py-3.5 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl">Cancel</button>
                    <button type="submit" disabled={submittingZReport} className="flex-1 py-3.5 bg-red-600 text-white font-black rounded-xl shadow-lg shadow-red-600/20 hover:bg-red-700">
                       {submittingZReport ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : 'Proceed'}
                    </button>
                  </div>
               </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
