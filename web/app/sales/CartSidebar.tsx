'use client';
import React, { useState } from 'react';
import axios from 'axios';
import { Trash2, Plus, Minus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { CartItem, UserProfile } from './page';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface CartSidebarProps {
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  user: UserProfile | null;
  onCheckoutSuccess: () => void;
}

export default function CartSidebar({ cart, setCart, user, onCheckoutSuccess }: CartSidebarProps) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Helpers
  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, sellQty: Math.max(1, item.sellQty + delta) } : item));
  };
  
  const updatePrice = (id: string, val: number) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, sellPrice: val } : item));
  };

  const remove = (id: string) => setCart(prev => prev.filter(i => i.id !== id));
  
  const total = cart.reduce((acc, item) => acc + (item.sellQty * item.sellPrice), 0);
  
  // Format Currency (Same logic as main page)
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency', currency: user?.currencyCode || 'NGN'
    }).format(amount);
  };

  // --- CHECKOUT LOGIC ---
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    setMsg({ text: '', type: '' });

    try {
      const token = localStorage.getItem('tallyToken');
      
      // 1. Prepare Payload
      const payload = {
        items: cart.map(i => ({
          itemId: i.id,
          quantity: Number(i.sellQty), // ✅ FORCE NUMBER
          price: Number(i.sellPrice)   // ✅ FORCE NUMBER
        }))
      };

      // 2. Send Request
      await axios.post(`${API_URL}/sales`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMsg({ text: 'Sale Recorded!', type: 'success' });
      onCheckoutSuccess(); // Clear cart in parent
    } catch (err: any) {
      console.error('Checkout Error:', err);
      // Handle the "Insufficient Stock" explicitly
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Checkout failed';
      setMsg({ text: errorMsg, type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setMsg({ text: '', type: '' }), 4000); // Clear msg after 4s
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-[calc(100vh-8rem)] sticky top-4">
      <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
        <h2 className="font-bold text-gray-800">Current Order ({cart.length})</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 text-sm">Cart is empty.<br/>Click items to add.</div>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="bg-slate-50 p-3 rounded-xl border border-gray-100">
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-sm text-gray-800 capitalize truncate w-32">{item.name}</span>
                <button onClick={() => remove(item.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Qty Control */}
                <div className="flex items-center bg-white rounded-lg border border-gray-200">
                  <button onClick={() => updateQty(item.id, -1)} className="px-2 py-1 hover:bg-gray-100 text-gray-600"><Minus className="w-3 h-3"/></button>
                  <span className="text-xs font-bold w-6 text-center">{item.sellQty}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="px-2 py-1 hover:bg-gray-100 text-gray-600"><Plus className="w-3 h-3"/></button>
                </div>
                
                <span className="text-gray-400 text-xs">x</span>
                
                {/* Price Input */}
                <input 
                  type="number" 
                  className="flex-1 w-20 px-2 py-1 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500"
                  value={item.sellPrice}
                  onChange={(e) => updatePrice(item.id, Number(e.target.value))}
                />
              </div>
              <div className="text-right mt-1 text-xs font-bold text-gray-700">
                {formatMoney(item.sellQty * item.sellPrice)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
        {msg.text && (
          <div className={`mb-3 p-2 rounded-lg text-xs font-bold flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
            {msg.text}
          </div>
        )}

        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-500 font-bold">Total</span>
          <span className="text-xl font-extrabold text-gray-900">{formatMoney(total)}</span>
        </div>

        <button 
          onClick={handleCheckout}
          disabled={loading || cart.length === 0}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin w-5 h-5"/> : 'Check Out'}
        </button>
      </div>
    </div>
  );
}