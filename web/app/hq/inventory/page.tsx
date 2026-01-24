'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { getCookie } from '../../../utils/cookies';
import { ArrowRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function HqTransfersPage() {
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // Form State
    const [fromBranchId, setFromBranchId] = useState('');
    const [toBranchId, setToBranchId] = useState('');
    const [itemName, setItemName] = useState('');
    const [quantity, setQuantity] = useState('');
    
    // Status
    const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

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

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus(null);
        setSubmitting(true);

        const token = getCookie('tallyToken');
        if (!token) {
             router.push('/login');
             return;
        }

        if (!fromBranchId || !toBranchId || !itemName || !quantity) {
             setStatus({ type: 'error', msg: 'Please fill all fields' });
             setSubmitting(false);
             return;
        }

        if (fromBranchId === toBranchId) {
            setStatus({ type: 'error', msg: 'Source and destination branches must be different' });
            setSubmitting(false);
            return;
        }

        try {
            const res = await axios.post(`${API_URL}/hq/transfer`, {
                fromBranchId,
                toBranchId,
                itemName,
                quantity: Number(quantity)
            }, { headers: { Authorization: `Bearer ${token}` } });

            setStatus({ type: 'success', msg: res.data.message || 'Transfer successful!' });
            // Reset form partly
            setItemName('');
            setQuantity('');
        } catch (err: any) {
            console.error("Transfer Error", err);
            setStatus({ type: 'error', msg: err.response?.data?.error || 'Transfer failed. Check stock levels.' });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-10 text-center font-bold text-slate-400">Loading...</div>;

    return (
        <div className="max-w-3xl mx-auto">
            <header className="mb-8">
                <h1 className="text-3xl font-black text-slate-900">Stock Transfer</h1>
                <p className="text-slate-500 font-medium">Move inventory between branches</p>
            </header>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                <form onSubmit={handleTransfer} className="space-y-6">
                    
                    {/* Branch Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">From Branch (Source)</label>
                            <select 
                                value={fromBranchId} 
                                onChange={e => setFromBranchId(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
                            >
                                <option value="">Select Source...</option>
                                {branches.map(b => (
                                    <option key={b._id} value={b._id}>{b.businessName}</option>
                                ))}
                            </select>
                        </div>

                        <div className="hidden md:flex justify-center pt-6">
                            <div className="p-2 bg-slate-100 rounded-full text-slate-400">
                                <ArrowRight className="w-5 h-5" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">To Branch (Destination)</label>
                            <select 
                                value={toBranchId} 
                                onChange={e => setToBranchId(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
                            >
                                <option value="">Select Destination...</option>
                                {branches.map(b => (
                                    <option key={b._id} value={b._id}>{b.businessName}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="h-px bg-slate-100 my-4" />

                    {/* Item Details */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Name</label>
                            <input 
                                type="text"
                                placeholder="e.g. Indomie Carton"
                                value={itemName}
                                onChange={e => setItemName(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
                            />
                        </div>
                         <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity</label>
                            <input 
                                type="number"
                                placeholder="0"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Feedback */}
                    {status && (
                        <div className={`p-4 rounded-xl flex items-center gap-3 font-bold text-sm ${
                            status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                            {status.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                            {status.msg}
                        </div>
                    )}

                    {/* Submit */}
                    <button 
                        type="submit" 
                        disabled={submitting}
                        className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
                        {submitting ? 'Transferring...' : 'Confirm Transfer'}
                    </button>
                </form>
            </div>
        </div>
    );
}
