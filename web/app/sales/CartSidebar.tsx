'use client';
import React, { useState } from 'react';
import axios from 'axios';
import { Trash2, Plus, Minus, CheckCircle2, AlertCircle, Loader2, ShoppingCart, ArrowRight } from 'lucide-react';
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

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, sellQty: Math.max(1, item.sellQty + delta) } : item));
  };
  
  const updatePrice = (id: string, val: number) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, sellPrice: val } : item));
  };

  const remove = (id: string) => setCart(prev => prev.filter(i => i.id !== id));
  
  const total = cart.reduce((acc, item) => acc + (item.sellQty * item.sellPrice), 0);
  
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency', currency: user?.currencyCode || 'NGN', maximumFractionDigits: 0
    }).format(amount);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    setMsg({ text: '', type: '' });

    try {
      const token = localStorage.getItem('tallyToken');
      const payload = {
        items: cart.map(i => ({
          itemId: i.id,
          quantity: Number(i.sellQty),
          price: Number(i.sellPrice)
        }))
      };

      await axios.post(`${API_URL}/sales`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMsg({ text: 'Sale Recorded Successfully!', type: 'success' });
      onCheckoutSuccess();
    } catch (err: any) {
      console.error('Checkout Error:', err);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Checkout failed';
      setMsg({ text: errorMsg, type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setMsg({ text: '', type: '' }), 4000);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-xl shadow-gray-200/50 flex flex-col h-[calc(100vh-6rem)] sticky top-4 overflow-hidden">
      
      {/* Header */}
      <div className="p-5 border-b border-gray-100 bg-white/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
           <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
             <ShoppingCart className="w-5 h-5" />
           </div>
           <div>
             <h2 className="font-extrabold text-gray-900 text-lg">Current Order</h2>
             <p className="text-xs text-gray-500 font-medium">{cart.length} items</p>
           </div>
        </div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-60">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
               <ShoppingCart className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-900 font-bold">Your cart is empty</p>
            <p className="text-xs text-gray-500 mt-1">Tap items from the grid to add them here.</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="group bg-white p-3 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-3">
                <span className="font-bold text-sm text-gray-800 capitalize truncate w-32">{item.name}</span>
                <button 
                  onClick={() => remove(item.id)} 
                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center justify-between gap-2">
                {/* Quantity Pill */}
                <div className="flex items-center bg-gray-50 rounded-xl border border-gray-200 p-0.5">
                  <button onClick={() => updateQty(item.id, -1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-600 transition-all"><Minus className="w-3 h-3"/></button>
                  <span className="text-xs font-bold w-8 text-center tabular-nums">{item.sellQty}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-600 transition-all"><Plus className="w-3 h-3"/></button>
                </div>
                
                <span className="text-gray-300 text-xs">x</span>
                
                {/* Price Input */}
                <div className="relative flex-1">
                   <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] font-bold">₦</span>
                   <input 
                     type="number" 
                     className="w-full pl-5 pr-2 py-1.5 text-sm font-bold border border-gray-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-right bg-white"
                     value={item.sellPrice}
                     onChange={(e) => updatePrice(item.id, Number(e.target.value))}
                   />
                </div>
              </div>
              
              <div className="text-right mt-2 pt-2 border-t border-dashed border-gray-100">
                <span className="text-xs font-extrabold text-gray-900 bg-gray-50 px-2 py-1 rounded-md">
                   {formatMoney(item.sellQty * item.sellPrice)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Area */}
      <div className="p-5 bg-gray-50 border-t border-gray-200 z-10">
        {msg.text && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-bottom-2 ${msg.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0"/> : <AlertCircle className="w-4 h-4 shrink-0"/>}
            {msg.text}
          </div>
        )}

        <div className="flex justify-between items-end mb-4">
          <span className="text-gray-500 font-bold text-sm mb-1">Total Amount</span>
          <span className="text-2xl font-black text-gray-900 tracking-tight">{formatMoney(total)}</span>
        </div>

        <button 
          onClick={handleCheckout}
          disabled={loading || cart.length === 0}
          className="group w-full py-4 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-lg shadow-gray-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-3"
        >
          {loading ? (
            <Loader2 className="animate-spin w-5 h-5"/>
          ) : (
            <>
              Confirm Sale <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform"/>
            </>
          )}
        </button>
      </div>
    </div>
  );
}