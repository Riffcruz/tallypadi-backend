'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar'; // Keep this path if Sidebar is in app/components
import { ShoppingCart, History, Menu, Loader2 } from 'lucide-react';

// ✅ IMPORT YOUR LOCAL COMPONENTS
// (Ensure these files exist in the same folder)
import ProductGrid from './ProductGrid';
import CartSidebar from './CartSidebar';
import SalesHistory from './SalesHistory';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- SHARED TYPES (Exported for components to use) ---
export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  price: number;
}
export interface CartItem extends InventoryItem {
  sellQty: number;
  sellPrice: number;
}
export interface UserProfile {
  id: string;
  planType: 'OGA_BOSS' | 'TYCOON';
  subscriptionStatus?: string;
  trialEndsAt?: string;
  currencyCode?: string; // e.g., 'USD', 'NGN'
  locale?: string;       // e.g., 'en-US', 'en-NG'
}

export default function SalesPage() {
  const router = useRouter();
  
  // --- STATE ---
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  // --- INITIAL LOAD ---
  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    // Fetch User to get Currency & Subscription
    axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.data?.user) {
          setUser(res.data.user);
          setLoadingUser(false);
        }
      })
      .catch((err) => {
        console.error('User fetch error:', err);
        setLoadingUser(false);
      });
  }, [router]);

  // --- CART HELPERS ---
  const handleAddToCart = (item: InventoryItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, sellQty: i.sellQty + 1 } : i));
      }
      return [...prev, { ...item, sellQty: 1, sellPrice: item.price || 0 }];
    });
  };

  const handleClearCart = () => setCart([]);

  if (loadingUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="animate-spin w-8 h-8 text-emerald-600"/>
          <p className="text-sm font-medium text-gray-500">Loading Register...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-6 min-h-screen overflow-x-hidden">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 md:hidden bg-white rounded-lg shadow-sm border border-gray-100">
              <Menu className="w-6 h-6 text-gray-700" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Sales Register</h1>
              {user?.currencyCode && (
                <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mt-1">
                  Region: {user.currencyCode}
                </p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200">
            <button
              onClick={() => setActiveTab('new')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'new' ? 'bg-emerald-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <ShoppingCart className="w-4 h-4" /> New Sale
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-emerald-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <History className="w-4 h-4" /> History
            </button>
          </div>
        </header>

        {/* --- DYNAMIC CONTENT --- */}
        {activeTab === 'new' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Left: Product Grid */}
            <div className="lg:col-span-2">
              <ProductGrid 
                user={user} 
                onAddToCart={handleAddToCart} 
                currencyCode={user?.currencyCode || 'NGN'} 
              />
            </div>

            {/* Right: Cart (Sticky) */}
            <div className="lg:col-span-1">
              <CartSidebar 
                cart={cart} 
                setCart={setCart} 
                user={user} 
                onCheckoutSuccess={handleClearCart}
              />
            </div>
          </div>
        ) : (
          /* History View */
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <SalesHistory user={user} />
          </div>
        )}

      </main>
    </div>
  );
}