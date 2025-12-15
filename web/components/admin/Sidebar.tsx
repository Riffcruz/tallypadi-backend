'use client';
import { LayoutDashboard, Users, Settings as SettingsIcon, Send, ShieldAlert } from 'lucide-react';

export default function Sidebar({ tab, setTab }: { tab: string, setTab: (t: any) => void }) {
    const menu = [
        { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
        { id: 'users', icon: Users, label: 'User Management' },
        { id: 'settings', icon: SettingsIcon, label: 'Global Settings' },
        { id: 'broadcast', icon: Send, label: 'Broadcast' },
    ];

    return (
        <aside className="w-64 bg-slate-800 border-r border-slate-700 p-6 flex flex-col gap-6 hidden md:flex">
            <h1 className="text-xl font-bold text-green-400 flex items-center gap-2 tracking-wider">
                <ShieldAlert /> GOD MODE
            </h1>
            <nav className="flex flex-col gap-2">
                {menu.map((item) => (
                    <button 
                        key={item.id} 
                        onClick={() => setTab(item.id)} 
                        className={`p-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${tab === item.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
                    >
                        <item.icon size={18} /> {item.label}
                    </button>
                ))}
            </nav>
        </aside>
    );
}