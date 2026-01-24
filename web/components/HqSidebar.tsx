'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Store, ArrowRightLeft, Settings, LogOut } from 'lucide-react';
import { removeCookie } from '../utils/cookies';

export default function HqSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    removeCookie('tallyToken');
    sessionStorage.removeItem('tallyUser');
    router.push('/login');
  };

  const menuItems = [
    { href: '/hq/dashboard', icon: LayoutDashboard, label: 'HQ Dashboard' },
    { href: '/hq/branches', icon: Store, label: 'Branches' },
    { href: '/hq/inventory', icon: ArrowRightLeft, label: 'Transfers' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-64 bg-slate-900 h-[100dvh] border-r border-slate-800 flex flex-col fixed left-0 top-0 z-10 text-white">
      
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">H</div>
        <span className="font-bold text-xl text-white">TallyPadi HQ</span>
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
                ? 'bg-purple-600/20 text-purple-400 border border-purple-600/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={20} className={isActive ? 'text-purple-400' : 'text-slate-400'} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout Section */}
      <div className="p-4 border-t border-slate-800 shrink-0 mt-auto mb-4">
        <button 
          onClick={handleLogout} 
          className="w-full flex items-center gap-3 text-red-400 hover:bg-red-900/20 hover:text-red-300 px-4 py-3 rounded-xl transition-all font-medium text-sm"
        >
          <LogOut size={20} /> 
          Logout
        </button>
      </div>
    </div>
  );
}
