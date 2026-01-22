'use client';

import React from 'react';
import { Home, Phone, ShoppingBag, List, X } from 'lucide-react';

interface ShopSidebarProps {
  shopName: string;
  shopPhone?: string;
  categories: string[];
  activeCategory: string;
  onCategorySelect: (category: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShopSidebar({
  shopName,
  shopPhone,
  categories,
  activeCategory,
  onCategorySelect,
  isOpen,
  onClose,
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
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col`}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
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
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => {
              onCategorySelect('');
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm text-left ${
              activeCategory === ''
                ? 'bg-emerald-50 text-emerald-700 font-bold'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
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
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm text-left ${
                    activeCategory === cat.toLowerCase()
                      ? 'bg-emerald-50 text-emerald-700 font-bold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <List size={16} className="opacity-50" />
                  <span className="capitalize">{cat}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Footer Actions */}
        {shopPhone && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <a
              href={`https://wa.me/${shopPhone}`}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
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
