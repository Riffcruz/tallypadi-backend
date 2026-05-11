'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { getCookie } from '../../../utils/cookies';
import { MapPin, Phone, User as UserIcon, Building2, Store, Plus, X } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function HqBranchesPage() {
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        businessName: '',
        phoneNumber: '',
        password: '',
        branchType: 'SHOP'
    });

    const fetchBranches = () => {
        const token = getCookie('tallyToken');
        if (!token) return;

        axios.get(`${API_URL}/hq/branches`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setBranches(res.data.branches))
            .catch(err => console.error("HQ Branches Error", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        const token = getCookie('tallyToken');
        if (!token) {
            router.push('/login');
            return;
        }
        fetchBranches();
    }, [router]);

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = getCookie('tallyToken');
        if (!token) return;

        setSubmitting(true);
        try {
            const payload = {
                ...formData,
                phoneNumber: formData.phoneNumber.trim(),
                password: formData.branchType === 'WAREHOUSE' && !formData.password.trim() ? undefined : formData.password,
            };
            await axios.post(`${API_URL}/hq/branch`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            Swal.fire({
                icon: 'success',
                title: 'Created!',
                text: `${formData.branchType === 'WAREHOUSE' ? 'Warehouse' : 'Shop Branch'} created successfully.`,
                timer: 2000,
                showConfirmButton: false
            });
            setShowModal(false);
            setFormData({ businessName: '', phoneNumber: '', password: '', branchType: 'SHOP' });
            fetchBranches();
        } catch (error: any) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.response?.data?.error || 'Failed to create branch.'
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-10 text-center font-bold text-slate-400">Loading branches...</div>;

    return (
        <div>
            <header className="mb-8 flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Branches & Storage</h1>
                    <p className="text-slate-500 font-medium mt-1">Manage your storefronts and warehouses</p>
                </div>
                <button 
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/30"
                >
                    <Plus size={20} />
                    New Branch
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {branches.map((branch) => {
                    const isWarehouse = branch.branchType === 'WAREHOUSE';
                    return (
                        <div key={branch._id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                            <div className="flex items-start justify-between mb-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl shadow-inner ${
                                    isWarehouse ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                                }`}>
                                    {isWarehouse ? <Building2 size={28} /> : <Store size={28} />}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                        isWarehouse ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                                    }`}>
                                        {branch.branchType || 'SHOP'}
                                    </span>
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                        branch.subscriptionStatus === 'active' || branch.subscriptionStatus === 'trial' 
                                        ? 'bg-emerald-100 text-emerald-700' 
                                        : 'bg-red-100 text-red-700'
                                    }`}>
                                        {branch.subscriptionStatus || 'Inactive'}
                                    </span>
                                </div>
                            </div>
                            
                            <h3 className="text-2xl font-black text-slate-900 mb-1 tracking-tight">{branch.businessName}</h3>
                            <p className="text-sm text-slate-500 font-medium mb-5">{branch.shopSlug ? `@${branch.shopSlug}` : 'No slug set'}</p>
                            
                            <div className="space-y-3 pt-5 border-t border-slate-100">
                                <div className="flex items-center gap-3 text-slate-600 text-sm">
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center"><UserIcon className="w-4 h-4 text-slate-400" /></div>
                                    <span className="font-bold">{branch.name || 'Owner'}</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-600 text-sm">
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center"><Phone className="w-4 h-4 text-slate-400" /></div>
                                    <span className="font-bold">{branch.phoneNumber}</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-600 text-sm">
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center"><MapPin className="w-4 h-4 text-slate-400" /></div>
                                    <span className="font-bold">{branch.city || 'Location unassigned'}</span>
                                </div>
                            </div>

                            <div className="mt-6 pt-4 border-t border-slate-100 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider flex justify-between items-center">
                                <span>Last Link Sync</span>
                                <span className={branch.lastSeen ? "text-emerald-500" : ""}>{branch.lastSeen ? new Date(branch.lastSeen).toLocaleDateString() : 'Never'}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {branches.length === 0 && (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
                    <p className="text-slate-400 font-bold">No branches linked yet.</p>
                    <p className="text-slate-400 text-sm mt-2">Click 'New Branch' to create a Shop or Warehouse.</p>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-xl font-black text-slate-800">Add New Branch</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-xl shadow-sm">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Location Type</label>
                                <div className="flex gap-4">
                                    <label className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.branchType === 'SHOP' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                                        <input type="radio" value="SHOP" checked={formData.branchType === 'SHOP'} onChange={(e) => setFormData({...formData, branchType: e.target.value})} className="hidden" />
                                        <Store size={20} /> <span className="font-bold">Shop</span>
                                    </label>
                                    <label className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.branchType === 'WAREHOUSE' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                                        <input type="radio" value="WAREHOUSE" checked={formData.branchType === 'WAREHOUSE'} onChange={(e) => setFormData({...formData, branchType: e.target.value})} className="hidden" />
                                        <Building2 size={20} /> <span className="font-bold">Warehouse</span>
                                    </label>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Business/Location Name</label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="e.g. Downtown Store or Main Warehouse"
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all font-medium text-slate-800"
                                    value={formData.businessName}
                                    onChange={(e) => setFormData({...formData, businessName: e.target.value})}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">
                                    Phone Number
                                    {formData.branchType === 'WAREHOUSE' && <span className="text-slate-400 font-normal ml-2">(Optional for warehouses)</span>}
                                </label>
                                <input 
                                    type="text" 
                                    required={formData.branchType === 'SHOP'} 
                                    placeholder="e.g. +2348000000000"
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all font-medium text-slate-800"
                                    value={formData.phoneNumber}
                                    onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
                                <input 
                                    type="password" 
                                    required={formData.branchType === 'SHOP'}
                                    placeholder={formData.branchType === 'WAREHOUSE' ? 'Optional for warehouse' : 'Set login password for branch'}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all font-medium text-slate-800"
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={submitting}
                                className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 disabled:opacity-50"
                            >
                                {submitting ? 'Creating...' : `Create ${formData.branchType === 'WAREHOUSE' ? 'Warehouse' : 'Shop Branch'}`}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
