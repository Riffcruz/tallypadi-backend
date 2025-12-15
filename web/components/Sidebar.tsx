'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, ShoppingCart, Package, Settings, LogOut } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('tallyToken');
    router.push('/login');
  };

  const menuItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/sales', icon: ShoppingCart, label: 'Sales' },
    { href: '/inventory', icon: Package, label: 'Inventory' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    // Changed h-screen to h-[100dvh] to fit actual visible screen area
    <div className="w-64 bg-white h-[100dvh] border-r border-gray-200 flex flex-col fixed left-0 top-0 z-10">
      <div className="p-6 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">T</div>
        <span className="font-bold text-xl text-green-700">Tallypadi</span>
      </div>
      
      {/* Added overflow-y-auto to allow scrolling if menu is tall */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                ? 'bg-green-50 text-green-700 border-l-4 border-green-600' 
                : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-100 shrink-0 mt-auto">
        <button onClick={handleLogout} className="w-full flex items-center gap-2 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition">
          <LogOut size={18} /> Logout
        </button>
      </div>
    </div>
  );
}