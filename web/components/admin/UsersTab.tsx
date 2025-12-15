'use client';
import React, { useState } from 'react';
import { Search, Filter, Eye, Lock, Unlock } from 'lucide-react';
import UserDeepDiveModal from './UserDeepDiveModal';

export default function UsersTab({ users, onAction, adminKey }: any) {
    const [filterActive, setFilterActive] = useState(true); // Default to active users
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState<any>(null);

    const filtered = users.filter((u: any) => {
        const matchesSearch = u.businessName?.toLowerCase().includes(search.toLowerCase()) || u.phone?.includes(search);
        const matchesStatus = filterActive ? (u.status === 'active' || u.status === 'trial') : true;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-100">User Database</h2>
                <div className="flex items-center gap-4">
                    <button onClick={() => setFilterActive(!filterActive)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${filterActive ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        <Filter size={14} /> {filterActive ? 'Active Only' : 'Show All'}
                    </button>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input type="text" placeholder="Search..." className="bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-green-500 w-64" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/50 text-slate-400 font-medium uppercase text-xs">
                        <tr>
                            <th className="px-6 py-4">User</th>
                            <th className="px-6 py-4">Plan</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Joined</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {filtered.map((u: any) => (
                            <tr key={u.id} className="hover:bg-gray-700/30 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-white">{u.businessName}</div>
                                    <div className="text-xs text-slate-500 font-mono">{u.phone}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${u.plan === 'TYCOON' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'}`}>{u.plan}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`text-xs uppercase font-semibold ${u.status === 'active' ? 'text-green-400' : u.status === 'suspended' ? 'text-red-500 bg-red-900/20 px-1 rounded' : 'text-orange-400'}`}>{u.status}</span>
                                </td>
                                <td className="px-6 py-4">{new Date(u.joinedAt).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setSelectedUser(u)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs flex items-center gap-1 transition-colors"><Eye size={14} /> View</button>
                                        {u.status === 'suspended' ? (
                                            <button onClick={() => onAction(u.id, 'unsuspend')} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"><Unlock size={14} /></button>
                                        ) : (
                                            <button onClick={() => onAction(u.id, 'suspend')} className="bg-red-900/50 hover:bg-red-800 text-red-300 border border-red-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"><Lock size={14} /></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {selectedUser && <UserDeepDiveModal user={selectedUser} onClose={() => setSelectedUser(null)} adminKey={adminKey} onAction={onAction} />}
        </div>
    );
}