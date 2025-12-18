'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { ShoppingCart, History, Menu, Loader2, Sparkles } from 'lucide-react';

// Import Components
import ProductGrid from './ProductGrid';
import CartSidebar from './CartSidebar';
import SalesHistory from './SalesHistory';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- SHARED TYPES ---
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
  currencyCode?: string;
  locale?: string;
}

export default function SalesPage() {
  const router = useRouter();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

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
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin w-10 h-10 text-emerald-600"/>
          <p className="text-sm font-bold text-gray-500 animate-pulse">Loading Register...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative overflow-x-hidden">
      
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
      <main className="relative z-10 flex-1 md:ml-64 p-4 md:p-8 min-h-screen">
        
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
          </div>

          {/* Segmented Tab Control */}
          <div className="flex p-1.5 bg-gray-200/50 backdrop-blur-sm rounded-xl border border-gray-200 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('new')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                activeTab === 'new' 
                  ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-gray-200' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
            >
              <ShoppingCart className="w-4 h-4" /> New Sale
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                activeTab === 'history' 
                  ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-gray-200' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
            >
              <History className="w-4 h-4" /> History
            </button>
          </div>
        </header>

        {/* Content Area */}
        {activeTab === 'new' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="lg:col-span-2">
              <ProductGrid 
                user={user} 
                onAddToCart={handleAddToCart} 
                currencyCode={user?.currencyCode || 'NGN'} 
              />
            </div>

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
          // ✅ FIX: Removed 'max-w-5xl mx-auto' so it aligns left
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <SalesHistory user={user} />
          </div>
        )}

      </main>
    </div>
  );
}