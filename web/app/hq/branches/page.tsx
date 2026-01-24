'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { getCookie } from '../../../utils/cookies';
import { MapPin, Phone, User as UserIcon } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function HqBranchesPage() {
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const token = getCookie('tallyToken');
        if (!token) {
            router.push('/login');
            return;
        }

        axios.get(`${API_URL}/hq/branches`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setBranches(res.data.branches))
            .catch(err => console.error("HQ Branches Error", err))
            .finally(() => setLoading(false));
    }, [router]);

    if (loading) return <div className="p-10 text-center font-bold text-slate-400">Loading branches...</div>;

    return (
        <div>
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Branches</h1>
                    <p className="text-slate-500 font-medium">Manage your network locations</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {branches.map((branch) => (
                    <div key={branch._id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-4">
                            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-700 font-black text-xl">
                                {(branch.businessName || 'B').charAt(0).toUpperCase()}
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                                branch.subscriptionStatus === 'active' || branch.subscriptionStatus === 'trial' 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : 'bg-red-100 text-red-700'
                            }`}>
                                {branch.subscriptionStatus || 'Inactive'}
                            </span>
                        </div>
                        
                        <h3 className="text-xl font-bold text-slate-900 mb-1">{branch.businessName}</h3>
                        <p className="text-sm text-slate-500 font-medium mb-4">{branch.shopSlug ? `@${branch.shopSlug}` : 'No slug set'}</p>
                        
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                             <div className="flex items-center gap-3 text-slate-600 text-sm">
                                <UserIcon className="w-4 h-4 text-slate-400" />
                                <span className="font-semibold">{branch.name || 'Owner'}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-600 text-sm">
                                <Phone className="w-4 h-4 text-slate-400" />
                                <span className="font-semibold">{branch.phoneNumber}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-600 text-sm">
                                <MapPin className="w-4 h-4 text-slate-400" />
                                <span className="font-semibold">{branch.city || 'No city'}, {branch.address || 'No address'}</span>
                            </div>
                        </div>

                         <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400 font-bold uppercase tracking-wider flex justify-between">
                            <span>Last Seen</span>
                            <span>{branch.lastSeen ? new Date(branch.lastSeen).toLocaleDateString() : 'Never'}</span>
                        </div>
                    </div>
                ))}
            </div>

            {branches.length === 0 && (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
                    <p className="text-slate-400 font-bold">No branches linked yet.</p>
                    <p className="text-slate-400 text-sm mt-2">Contact support to link existing Owner accounts to your HQ.</p>
                </div>
            )}
        </div>
    );
}
