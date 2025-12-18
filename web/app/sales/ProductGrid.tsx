'use client';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Plus, Loader2, PackageOpen, AlertTriangle } from 'lucide-react';
import { InventoryItem, UserProfile } from './page';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface ProductGridProps {
  user: UserProfile | null;
  onAddToCart: (item: InventoryItem) => void;
  currencyCode: string;
}

export default function ProductGrid({ user, onAddToCart, currencyCode }: ProductGridProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) return;

    axios.get(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        const clean = raw.map((item: any) => ({
          id: item._id || item.id,
          name: item.name,
          stock: Number(item.quantity ?? item.stock ?? 0),
          price: Number(item.lastUnitPrice ?? item.price ?? 0),
        }));
        setInventory(clean);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Inventory Error:', err);
        setLoading(false);
      });
  }, []);

  const filtered = inventory.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', { 
      style: 'currency', currency: currencyCode, maximumFractionDigits: 0 
    }).format(amount);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* --- STICKY SEARCH BAR --- */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm pt-1 pb-4">
        <div className="relative group shadow-sm rounded-xl">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
          </div>
          <input 
            type="text" 
            placeholder="Search items by name..." 
            className="block w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* --- GRID CONTENT --- */}
      {loading ? (
        // Skeleton Loader
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 h-32 animate-pulse flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="w-8 h-8 bg-gray-100 rounded-lg"></div>
                <div className="w-12 h-4 bg-gray-100 rounded-full"></div>
              </div>
              <div className="space-y-2">
                <div className="w-3/4 h-4 bg-gray-100 rounded"></div>
                <div className="w-1/2 h-3 bg-gray-50 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        // Empty State
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <PackageOpen className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-gray-900 font-bold">No items found</h3>
          <p className="text-gray-500 text-sm mt-1">Try searching for something else.</p>
        </div>
      ) : (
        // Product Cards
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-20">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => onAddToCart(item)}
              className="group relative flex flex-col text-left p-4 bg-white border border-gray-200 rounded-2xl hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-200 active:scale-[0.98] overflow-hidden"
            >
              {/* Subtle Gradient Hover Overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative z-10 w-full">
                <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center font-extrabold text-sm text-gray-500 uppercase group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                    {item.name.substring(0, 2)}
                  </div>
                  
                  {item.stock < 5 ? (
                     <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-100">
                       <AlertTriangle className="w-3 h-3" /> {item.stock} left
                     </span>
                  ) : (
                     <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                       {item.stock} in stock
                     </span>
                  )}
                </div>
                
                <h3 className="font-bold text-gray-900 capitalize truncate w-full mb-1 group-hover:text-emerald-700 transition-colors">
                  {item.name}
                </h3>
                
                <div className="flex items-center justify-between mt-auto">
                  <p className="text-sm font-semibold text-gray-500">
                    {formatPrice(item.price)}
                  </p>
                  <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all">
                    <Plus className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}