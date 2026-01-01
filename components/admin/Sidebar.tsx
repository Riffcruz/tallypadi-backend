'use client';
import { LayoutDashboard, Users, Settings as SettingsIcon, Send, ShieldAlert } from 'lucide-react';

export default function Sidebar({ tab, setTab }: { tab: string, setTab: (t: any) => void }) {
    // 🔴 Removed: isOpen state and setIsOpen setter

    const menu = [
        { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
        { id: 'users', icon: Users, label: 'User Management' },
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
                {menu.map((item) => (
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
                        <item.icon size={18} /> {item.label}
                    </button>
                ))}
            </nav>

            <div className="mt-auto pt-6 border-t border-slate-700">
                <p className="text-xs text-slate-500 text-center">
                    Admin Console v2.0
                </p>
            </div>
        </aside>
    );
}