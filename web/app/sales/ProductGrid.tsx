'use client';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Plus, Lock, Loader2 } from 'lucide-react';
import { InventoryItem, UserProfile } from './page'; // Import types

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

  // Fetch Inventory
  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) return;

    axios.get(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        // Handle both { data: [...] } and [...] response formats
        const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        const clean = raw.map((item: any) => ({
          id: item._id || item.id,
          name: item.name,
          stock: Number(item.quantity ?? item.stock ?? 0), // ✅ Fix stock number
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

  // Filter
  const filtered = inventory.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  // Formatter
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', { 
      style: 'currency', currency: currencyCode 
    }).format(amount);
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400"/></div>;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-2">
        <Search className="w-5 h-5 text-gray-400" />
        <input 
          type="text" 
          placeholder="Search items..." 
          className="flex-1 outline-none text-sm bg-transparent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => onAddToCart(item)}
            className="flex flex-col text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-emerald-400 hover:shadow-md transition-all active:scale-95"
          >
            <div className="flex justify-between w-full mb-2">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-xs text-gray-600 uppercase">
                {item.name.substring(0, 2)}
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${item.stock > 0 ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-600'}`}>
                {item.stock} left
              </span>
            </div>
            <h3 className="font-bold text-gray-900 capitalize truncate w-full">{item.name}</h3>
            <p className="text-sm text-gray-500">{formatPrice(item.price)}</p>
          </button>
        ))}
      </div>
      
      {filtered.length === 0 && (
        <div className="text-center py-10 text-gray-400">No items found.</div>
      )}
    </div>
  );
}