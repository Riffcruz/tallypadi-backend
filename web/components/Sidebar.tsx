'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Settings, LogOut, Users,
  BookOpen, ClipboardList, FileText, Banknote, UserPlus, Users2,
  Store, CreditCard, Globe, Megaphone, Bell, BadgeCheck
} from 'lucide-react';
import { getCookie, removeCookie } from '../utils/cookies';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = React.useState<Record<string, unknown> | null>(null);
  const [verificationStatus, setVerificationStatus] = React.useState('');

  React.useEffect(() => {
    try {
      const stored = sessionStorage.getItem('tallyUser');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setVerificationStatus(String(parsed?.marketplaceVerificationStatus || ''));
      }
    } catch (e) {
      console.error('Failed to parse user session', e);
    }

    const token = getCookie('tallyToken');
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api'}/shop/verification`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data?.status) return;
        setVerificationStatus(String(data.status));
        setUser((current) => {
          const next = { ...(current || {}), marketplaceVerificationStatus: data.status };
          sessionStorage.setItem('tallyUser', JSON.stringify(next));
          return next;
        });
      })
      .catch(() => undefined);
  }, []);

  const handleLogout = () => {
    removeCookie('tallyToken');
    sessionStorage.removeItem('tallyUser');
    router.push('/login');
  };

  // ── MENU items (shown to all / permission-filtered for STAFF) ──────────
  const getMenuItems = () => {
    const baseItems = [
      { href: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard',      key: 'canViewDashboard' },
      { href: '/activity',           icon: Bell,            label: 'Activity',       key: 'canViewDashboard' },
      { href: '/sales',              icon: ShoppingCart,    label: 'Sales'                                    },
      { href: '/orders',             icon: ClipboardList,   label: 'Orders'                                   },
      { href: '/dashboard/expenses', icon: Banknote,        label: 'Expenses'                                 },
      { href: '/invoices',           icon: FileText,        label: 'Invoices'                                 },
      { href: '/inventory',          icon: Package,         label: 'Product/Stocks', key: 'canManageInventory'},
      { href: '/customers',          icon: UserPlus,        label: 'Customers',      key: 'canManageCustomers'},
      { href: '/debtors',            icon: Users,           label: 'Debtors',        key: 'canManageCustomers'},
      { href: '/settings',           icon: Settings,        label: 'Settings',       key: 'canViewSettings'   },
      { href: '/help',               icon: BookOpen,        label: 'Guide'                                    },
    ];

    if (!user) return baseItems;

    // Staff Permission Filtering
    if (user.role === 'STAFF') {
      const perms = (user.settings as { staffPermissions?: Record<string, boolean> })?.staffPermissions || {};
      return baseItems.filter(item => {
        if (item.key) return perms[item.key] === true;
        return true; // No key = always show (Sales, Orders, Guide)
      });
    }

    return baseItems;
  };

  const menuItems = getMenuItems();

  const isActive = (href: string) => pathname === href;

  const linkClass = (href: string) =>
    `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${
      isActive(href) ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const iconClass = (href: string) =>
    isActive(href) ? 'text-emerald-400' : 'text-gray-400';

  return (
    <div className="w-full md:w-64 bg-white h-full md:h-[100dvh] border-r border-gray-200 flex flex-col fixed left-0 top-0 z-10">

      {/* Brand Header */}
      <div className="p-6 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">T</div>
        <div className="min-w-0">
          <span className="font-bold text-xl text-emerald-700">TallyPadi</span>
          {verificationStatus === 'VERIFIED' && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700 ring-1 ring-sky-100">
              <BadgeCheck size={13} fill="currentColor" />
              Verified ID
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 overflow-y-auto">

        {/* ── MENU Group ── */}
        <div className="mb-6">
          <p className="px-4 mb-2 text-[10px] font-black tracking-widest text-gray-400 uppercase">Menu</p>
          <div className="space-y-1">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(item.href)}
              >
                <item.icon size={18} className={iconClass(item.href)} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── ADMIN Group ── */}
        <div className="mb-6">
          <p className="px-4 mb-2 text-[10px] font-black tracking-widest text-gray-400 uppercase">Admin</p>
          <div className="space-y-1">

            {/* All Staff */}
            <Link href="/staff" className={linkClass('/staff')}>
              <Users2 size={18} className={iconClass('/staff')} />
              <span>All Staff</span>
            </Link>

            {/* Warehouse / HQ */}
            <Link href="/hq/dashboard" className={linkClass('/hq/dashboard')}>
              <Store size={18} className={iconClass('/hq/dashboard')} />
              <span>Warehouse</span>
            </Link>

            {/* Online Store */}
            <Link href="/online-store" className={linkClass('/online-store')}>
              <Globe size={18} className={iconClass('/online-store')} />
              <span>Online Store</span>
            </Link>

            {/* Ads Manager */}
            <Link href="/ads-manager" className={linkClass('/ads-manager')}>
              <Megaphone size={18} className={iconClass('/ads-manager')} />
              <span>Ads Manager</span>
            </Link>

            {/* Subscription */}
            <Link href="/settings" className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900`}>
              <CreditCard size={18} className="text-gray-400" />
              <span>Subscription</span>
            </Link>

          </div>
        </div>
      </nav>

      {/* Logout */}
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
