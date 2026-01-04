'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
// ✅ Added 'Users' icon for Debtors
import { LayoutDashboard, ShoppingCart, Package, Settings, LogOut, Users } from 'lucide-react';
import { removeCookie } from '../utils/cookies';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    removeCookie('tallyToken');
    // Clear user data as well
    sessionStorage.removeItem('tallyUser');
    router.push('/login');
  };

  const menuItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/sales', icon: ShoppingCart, label: 'Sales' },
    { href: '/inventory', icon: Package, label: 'Product/Stocks' },
    // ✅ New Debtors Navigation Item
    { href: '/debtors', icon: Users, label: 'Debtors' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-64 bg-white h-[100dvh] border-r border-gray-200 flex flex-col fixed left-0 top-0 z-10">
      
      {/* Brand Header */}
      <div className="p-6 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">T</div>
        <span className="font-bold text-xl text-emerald-700">TallyPadi</span>
      </div>
      
      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm ${
                isActive 
                ? 'bg-emerald-50 text-emerald-700 shadow-sm' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon size={20} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout Section - Lifted up slightly with mb-4 */}
      <div className="p-4 border-t border-gray-100 shrink-0 mt-auto mb-4">
        <button 
          onClick={handleLogout} 
          className="w-full flex items-center gap-3 text-red-600 hover:bg-red-50 hover:text-red-700 px-4 py-3 rounded-xl transition-all font-medium text-sm"
        >
          <LogOut size={20} /> 
          Logout
        </button>
      </div>
    </div>
  );
}