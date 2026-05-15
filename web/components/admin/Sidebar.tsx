'use client';
import Link from 'next/link';
import { LayoutDashboard, Users, Settings as SettingsIcon, Send, ShieldAlert, Briefcase, Headphones, MessageSquare, Megaphone, BadgeCheck, Newspaper, type LucideIcon } from 'lucide-react';

type AdminMenuItem = { id: string; icon: LucideIcon; label: string; href?: string };

export default function Sidebar({ tab, setTab }: { tab: string, setTab: (t: string) => void }) {
    // 🔴 Removed: isOpen state and setIsOpen setter

    const menu: AdminMenuItem[] = [
        { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
        { id: 'users', icon: Users, label: 'User Management' },
        { id: 'ads', icon: Megaphone, label: 'Ads Review' },
        { id: 'blog', icon: Newspaper, label: 'Blog CMS' },
        { id: 'verifications', icon: BadgeCheck, label: 'Verifications' },
        { id: 'investors', icon: Briefcase, label: 'Investors' },
        { id: 'support', icon: Headphones, label: 'Customer Care' },
        { id: 'live_support', icon: MessageSquare, label: 'Live Support', href: '/admin/support' },
        { id: 'settings', icon: SettingsIcon, label: 'Global Settings' },
        { id: 'broadcast', icon: Send, label: 'Broadcast' },
    ];

    return (
        // 🔴 Removed: Mobile Toggle Button and Mobile Backdrop
        
        // Sidebar Container - Now statically positioned for desktop view
        <aside className="
            fixed inset-y-0 left-0 z-[99] w-64 bg-slate-800 border-r border-slate-700 p-6 flex flex-col gap-6
            shadow-2xl md:shadow-none
            md:translate-x-0 md:static md:flex
            h-full
        ">
            <h1 className="text-xl font-bold text-green-400 flex items-center gap-2 tracking-wider">
                <ShieldAlert className="shrink-0" /> GOD MODE
            </h1>
            
            <nav className="flex flex-col gap-2">
                {menu.map((item) => {
                    const Icon = item.icon;
                    return item.href ? (
                        <Link
                            key={item.id}
                            href={item.href}
                            className="p-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-all duration-200 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                        >
                            <Icon size={18} /> {item.label}
                        </Link>
                    ) : (
                        <button 
                            key={item.id} 
                            onClick={() => {
                                setTab(item.id);
                                // 🔴 Removed: setIsOpen(false) 
                            }} 
                            className={`
                                p-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-all duration-200
                                ${tab === item.id 
                                    ? 'bg-slate-700 text-white shadow-md translate-x-1' 
                                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                                }
                            `}
                        >
                            <Icon size={18} /> {item.label}
                        </button>
                    );
                })}
            </nav>

            <div className="mt-auto pt-6 border-t border-slate-700">
                <p className="text-xs text-slate-500 text-center">
                    Admin Console v2.0
                </p>
            </div>
        </aside>
    );
}
