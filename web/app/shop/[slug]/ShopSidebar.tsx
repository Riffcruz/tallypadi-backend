'use client';

import React from 'react';
import { Home, Phone, ShoppingBag, List, X, UserPlus, FileText, CreditCard, HelpCircle } from 'lucide-react';

interface ShopSidebarProps {
  shopName: string;
  shopPhone?: string;
  categories: string[];
  activeCategory: string;
  onCategorySelect: (category: string) => void;
  isOpen: boolean;
  onClose: () => void;
  themeColor?: string;
}

export default function ShopSidebar({
  shopName,
  shopPhone,
  categories,
  activeCategory,
  onCategorySelect,
  isOpen,
  onClose,
  themeColor = '#10b981',
}: ShopSidebarProps) {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white md:bg-transparent md:border-none transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl md:shadow-none' : '-translate-x-full'
        } flex flex-col md:block shrink-0`}
      >
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between md:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: themeColor }}>
              <ShoppingBag size={18} />
            </div>
            <span className="font-bold text-lg text-slate-900 truncate max-w-[140px]">
              {shopName}
            </span>
          </div>
          <button onClick={onClose} className="md:hidden text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 p-4 md:p-0 md:bg-white md:rounded-2xl md:shadow-sm md:border md:border-slate-200 space-y-1 overflow-y-auto">
          <button
            onClick={() => {
              onCategorySelect('');
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 md:rounded-t-2xl transition-all duration-200 font-medium text-sm text-left ${
              activeCategory === ''
                ? 'bg-slate-50 font-bold'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
            style={activeCategory === '' ? { color: themeColor } : {}}
          >
            <Home size={18} />
            All Products
          </button>

          {categories.length > 0 && (
            <div className="pt-4">
              <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Categories
              </p>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    onCategorySelect(cat.toLowerCase());
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-200 font-medium text-sm text-left ${
                    activeCategory === cat.toLowerCase()
                      ? 'bg-slate-50 font-bold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  style={activeCategory === cat.toLowerCase() ? { color: themeColor } : {}}
                >
                  <List size={16} className="opacity-50" />
                  <span className="capitalize">{cat}</span>
                </button>
              ))}
            </div>
          )}

          <div className="pt-4 mt-4 border-t border-slate-100">
            <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              TallyPadi
            </p>
            
            <a
              href="/register"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm text-left text-slate-600 hover:bg-slate-50"
            >
              <UserPlus size={16} className="opacity-50" />
              <span>Register with TallyPadi</span>
            </a>

            <a
              href="/help"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm text-left text-slate-600 hover:bg-slate-50"
            >
              <FileText size={16} className="opacity-50" />
              <span>Docs & Help</span>
            </a>

            <a
              href="/#pricing"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm text-left text-slate-600 hover:bg-slate-50"
            >
              <CreditCard size={16} className="opacity-50" />
              <span>Pricing</span>
            </a>

            <a
              href="/faq"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm text-left text-slate-600 hover:bg-slate-50"
            >
              <HelpCircle size={16} className="opacity-50" />
              <span>FAQ</span>
            </a>
          </div>
        </nav>

        {/* Footer Actions (Mobile Only) */}
        {shopPhone && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 md:hidden">
            <a
              href={`https://wa.me/${shopPhone}`}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl text-sm font-bold transition shadow-lg"
              style={{ backgroundColor: themeColor }}
            >
              <Phone size={16} />
              Contact Shop
            </a>
          </div>
        )}
      </div>
    </>
  );
}
