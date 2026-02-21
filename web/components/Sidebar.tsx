'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
// ✅ Added 'Users' icon for Debtors
import { LayoutDashboard, ShoppingCart, Package, Settings, LogOut, Users, BookOpen, ClipboardList, FileText, Banknote, UserPlus, Users2, Store, CreditCard } from 'lucide-react';
import { removeCookie } from '../utils/cookies';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = React.useState<any>(null);

  React.useEffect(() => {
    try {
      const stored = sessionStorage.getItem('tallyUser');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to parse user session", e);
    }
  }, []);

  const handleLogout = () => {
    removeCookie('tallyToken');
    // Clear user data as well
    sessionStorage.removeItem('tallyUser');
    router.push('/login');
  };

  // ✅ Define items dynamically based on user/permissions
  const getMenuItems = () => {
    const baseItems = [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', key: 'canViewDashboard' },
      { href: '/sales', icon: ShoppingCart, label: 'Sales' }, // Always allowed (Core)
      { href: '/orders', icon: ClipboardList, label: 'Orders' }, // Always allowed (Core)
      { href: '/dashboard/expenses', icon: Banknote, label: 'Expenses' }, // ✅ NEW
      { href: '/invoices', icon: FileText, label: 'Invoices' }, // ✅ NEW
      { href: '/inventory', icon: Package, label: 'Product/Stocks', key: 'canManageInventory' },
      { href: '/customers', icon: UserPlus, label: 'Customers', key: 'canManageCustomers' },
      { href: '/debtors', icon: Users, label: 'Debtors', key: 'canManageCustomers' },
      { href: '/settings', icon: Settings, label: 'Settings', key: 'canViewSettings' },
      { href: '/help', icon: BookOpen, label: 'Guide' },
    ];

    if (!user) return baseItems;

    // HQ Logic
    const isTycoon = String(user?.planType || '').toUpperCase() === 'TYCOON';
    // Only show HQ dashboard if user is HQ, or an HQ Manager (strict check), or a Tycoon OWNER
    const isHqUser = user.role === 'HQ';
    const isHqManager = user.isHqManager === true;
    const isOwnerTycoon = isTycoon && user.role === 'OWNER';

    if (isHqUser || isHqManager || isOwnerTycoon) {
       // Check duplication before unshifting if re-renders happen (though this function runs on render)
       if (!baseItems.find(i => i.label === 'HQ Dashboard')) {
         baseItems.unshift({ href: '/hq/dashboard', icon: LayoutDashboard, label: 'HQ Dashboard' });
       }
    }

    // Staff Permission Filtering
    if (user.role === 'STAFF') {
      const perms = user.settings?.staffPermissions || {};
      return baseItems.filter(item => {
        // If it has a specific permission key, check it
        if (item.key) {
           // If key is present in perms, use it. If not, fallback to defaults matching model.
           // Dashboard: def false, Inventory: def true, Debtors: def true, Settings: def false
           return perms[item.key] === true; 
        }
        return true; // No key = always show (Sales, Orders, Guide)
      });
    }

    return baseItems;
  };

  const menuItems = getMenuItems();

  return (
    <div className="w-full md:w-64 bg-white h-full md:h-[100dvh] border-r border-gray-200 flex flex-col fixed left-0 top-0 z-10">
      
      {/* Brand Header */}
      <div className="p-6 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">T</div>
        <span className="font-bold text-xl text-emerald-700">TallyPadi</span>
      </div>
      
      {/* Navigation Links */}
      <nav className="flex-1 p-4 overflow-y-auto">
        
        {/* MENU Group */}
        <div className="mb-6">
          <p className="px-4 mb-2 text-[10px] font-black tracking-widest text-gray-400 uppercase">Menu</p>
          <div className="space-y-1">
            {menuItems.slice(0, 8).map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${
                    isActive 
                    ? 'bg-black text-white shadow-md' 
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <item.icon size={18} className={isActive ? 'text-emerald-400' : 'text-gray-400'} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ADMIN Group */}
        <div className="mb-6">
          <p className="px-4 mb-2 text-[10px] font-black tracking-widest text-gray-400 uppercase">Admin</p>
          <div className="space-y-1">
            <Link href="/staff" className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${pathname === '/staff' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Users2 size={18} className={pathname === '/staff' ? 'text-emerald-400' : 'text-gray-400'} />
              <span>All Staff</span>
            </Link>
            
            {menuItems.slice(5, 6).map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${isActive ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                >
                  <item.icon size={18} className={isActive ? 'text-emerald-400' : 'text-gray-400'} />
                  <span>Products</span>
                </Link>
              );
            })}

            <Link href="/hq/dashboard" className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${pathname === '/hq/dashboard' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Store size={18} className={pathname === '/hq/dashboard' ? 'text-emerald-400' : 'text-gray-400'} />
              <span>Warehouse</span>
            </Link>

            <Link href="/online-store" className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${pathname === '/online-store' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
              <LayoutDashboard size={18} className={pathname === '/online-store' ? 'text-emerald-400' : 'text-gray-400'} />
              <span>Online store(Website)</span>
            </Link>

            <Link href="/settings" className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900`}>
              <CreditCard size={18} className="text-gray-400" />
              <span>Subscription</span>
            </Link>
          </div>
        </div>
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