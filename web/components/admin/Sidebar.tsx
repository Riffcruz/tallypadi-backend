'use client';
import { useState } from 'react';
import { LayoutDashboard, Users, Settings as SettingsIcon, Send, ShieldAlert, Menu, X } from 'lucide-react';

export default function Sidebar({ tab, setTab }: { tab: string, setTab: (t: any) => void }) {
    const [isOpen, setIsOpen] = useState(false);

    const menu = [
        { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
        { id: 'users', icon: Users, label: 'User Management' },
        { id: 'settings', icon: SettingsIcon, label: 'Global Settings' },
        { id: 'broadcast', icon: Send, label: 'Broadcast' },
    ];

    return (
        <>
            {/* Mobile Toggle Button - High Z-index (100) ensures it sits above charts/tables */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="md:hidden fixed top-4 left-4 z-[100] p-2 bg-slate-800 text-green-400 rounded-lg shadow-xl border border-slate-700 hover:bg-slate-700 transition-colors"
                aria-label="Toggle Menu"
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Mobile Backdrop - Z-index 90 */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 z-[90] md:hidden backdrop-blur-sm"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar Container - Z-index 99 */}
            <aside className={`
                fixed inset-y-0 left-0 z-[99] w-64 bg-slate-800 border-r border-slate-700 p-6 flex flex-col gap-6
                transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
                md:translate-x-0 md:static md:flex
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <h1 className="text-xl font-bold text-green-400 flex items-center gap-2 tracking-wider">
                    <ShieldAlert className="shrink-0" /> GOD MODE
                </h1>
                
                <nav className="flex flex-col gap-2">
                    {menu.map((item) => (
                        <button 
                            key={item.id} 
                            onClick={() => {
                                setTab(item.id);
                                setIsOpen(false); // Close menu on mobile when clicked
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
        </>
    );
}