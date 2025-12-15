'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Crown, X, ShoppingBag, Users, Calendar, Download, FileText, CheckCircle, Smartphone } from 'lucide-react';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// 🌍 Dynamic Currency Mapping (Acts as your JSON file source)
const COUNTRY_CURRENCIES: { [key: string]: string } = {
    'NG': '₦',  // Nigeria
    'US': '$',  // United States
    'GB': '£',  // United Kingdom
    'EU': '€',  // Europe
    'GH': '₵',  // Ghana
    'KE': 'KSh', // Kenya
    'ZA': 'R',  // South Africa
    'IN': '₹',  // India
    'CN': '¥',  // China
    'CA': 'C$', // Canada
    // Add more country codes as needed
};

export default function UserDeepDiveModal({ user, onClose, adminKey, onAction }: any) {
    const [details, setDetails] = useState<any>(null);
    const [view, setView] = useState('info');
    const [salesDate, setSalesDate] = useState({ start: '', end: '' });

    useEffect(() => {
        if (user && user.id) {
             axios.get(`${API_URL}/admin/users/${user.id}/details`, { headers: { 'x-admin-secret': adminKey } })
            .then(res => setDetails(res.data))
            .catch(() => Swal.fire('Error', 'Failed to load details', 'error'));
        }
    }, [user, adminKey]);

    // 🟢 HELPER: Get Currency Symbol based on user profile
    const getCurrency = () => {
        // Assumes details.profile.countryCode exists, defaults to 'NG' if missing
        const code = details?.profile?.countryCode || 'NG'; 
        return COUNTRY_CURRENCIES[code.toUpperCase()] || '₦';
    };
    const currencySymbol = getCurrency();

    // 🟢 SMART PLAN RENEWAL LOGIC
    const handlePlanChange = async () => {
        const { value: plan } = await Swal.fire({
            title: 'Change / Renew Plan',
            input: 'select',
            inputOptions: { 'OGA_BOSS': 'Oga Boss', 'TYCOON': 'Tycoon' },
            inputPlaceholder: 'Select a plan',
            showCancelButton: true
        });

        if (plan) {
            // Ask for Duration
            const { isConfirmed: isStandard } = await Swal.fire({
                title: 'Plan Duration',
                text: 'Use standard 30 Days or set custom date?',
                icon: 'question',
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: 'Standard 30 Days',
                denyButtonText: 'Custom Date',
                cancelButtonText: 'Cancel'
            });

            let expiryDate = new Date();

            if (isStandard) {
                expiryDate.setDate(expiryDate.getDate() + 30);
            } else {
                 const { value: customDate } = await Swal.fire({
                     title: 'Select Expiry Date',
                     input: 'date',
                     showCancelButton: true
                 });
                 if (!customDate) return; // Cancelled
                 expiryDate = new Date(customDate);
            }

            // Execute Chain
            try {
                await onAction(user.id, 'change_plan', { planType: plan });
                await onAction(user.id, 'set_expiry', { date: expiryDate });
                await onAction(user.id, 'activate'); // Auto-activate
                
                Swal.fire('Success', `Plan set to ${plan} until ${expiryDate.toLocaleDateString()}`, 'success');
                
                // Optimistic UI Update
                setDetails((prev: any) => ({
                    ...prev,
                    profile: { 
                        ...prev.profile, 
                        planType: plan, 
                        subscriptionStatus: 'active', 
                        trialEndsAt: expiryDate 
                    }
                }));
            } catch (e) {
                Swal.fire('Error', 'Failed to update plan', 'error');
            }
        }
    };

    const handleChangeExpiry = async () => {
         const { value: date } = await Swal.fire({
            title: 'Modify Expiration',
            input: 'date',
            inputLabel: 'Select new expiration date',
            showCancelButton: true
        });
        if (date) {
            const newDate = new Date(date);
            await onAction(user.id, 'set_expiry', { date: newDate });
            
            // Auto cancel if past
            if (newDate < new Date()) {
                await onAction(user.id, 'cancel');
                setDetails((prev: any) => ({ ...prev, profile: { ...prev.profile, subscriptionStatus: 'cancelled', trialEndsAt: newDate } }));
                Swal.fire('Updated', 'Date is in past. User Cancelled.', 'info');
            } else {
                await onAction(user.id, 'activate');
                setDetails((prev: any) => ({ ...prev, profile: { ...prev.profile, subscriptionStatus: 'active', trialEndsAt: newDate } }));
                Swal.fire('Updated', 'Expiration date extended.', 'success');
            }
        }
    };
    
    // 🟢 EXPORT LOGIC
    const getFilteredSales = () => {
        let data = details?.recentSales || [];
        if (salesDate.start) data = data.filter((s: any) => new Date(s.timestamp) >= new Date(salesDate.start));
        if (salesDate.end) {
            const end = new Date(salesDate.end); end.setHours(23,59,59);
            data = data.filter((s: any) => new Date(s.timestamp) <= end);
        }
        return data;
    };

    const exportSales = (format: 'csv' | 'pdf') => {
        const data = getFilteredSales();
        if (data.length === 0) return Swal.fire('Info', 'No data to export', 'info');
        
        const fileName = `sales_${user.businessName}_${new Date().toISOString().split('T')[0]}`;

        if (format === 'csv') {
            const csv = `Date,Item Details,Amount (${currencySymbol})\n` + data.map((s: any) => {
                const items = s.items.map((i:any) => `${i.qty}x ${i.name}`).join('; ');
                // FIX: handle null totalMoney
                const amount = s.totalMoney !== null && s.totalMoney !== undefined ? s.totalMoney : 0;
                return `${new Date(s.timestamp).toLocaleDateString()},"${items}",${amount}`;
            }).join("\n");
            
            const link = document.createElement("a");
            link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
            link.download = `${fileName}.csv`;
            link.click();
        } else {
            const doc = new jsPDF();
            doc.text(`Sales Report: ${user.businessName}`, 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);

            autoTable(doc, {
                head: [['Date', 'Items', `Amount (${currencySymbol})`]],
                body: data.map((s: any) => {
                    // FIX: handle null totalMoney
                    const amount = s.totalMoney !== null && s.totalMoney !== undefined ? s.totalMoney : 0;
                    return [
                        new Date(s.timestamp).toLocaleDateString(),
                        s.items.map((i:any) => `${i.qty}x ${i.name}`).join(', '),
                        `${currencySymbol}${amount.toLocaleString()}`
                    ];
                }),
                startY: 30
            });
            doc.save(`${fileName}.pdf`);
        }
    };

    if (!details) return <div className="fixed inset-0 bg-black/80 flex items-center justify-center text-white z-50">Loading Details...</div>;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-800 w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-700 flex justify-between items-start bg-slate-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            {details.profile.businessName} {details.profile.planType === 'TYCOON' && <Crown className="text-purple-400 w-5 h-5" />}
                        </h2>
                        <p className="text-slate-400 text-sm font-mono">{details.profile.phoneNumber}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={24} /></button>
                </div>

                <div className="flex border-b border-slate-700">
                    {['info', 'inventory', 'sales', 'staff'].map(m => (
                        <button key={m} onClick={() => setView(m)} className={`px-6 py-3 text-sm font-medium capitalize ${view === m ? 'text-green-400 border-b-2 border-green-400' : 'text-slate-400 hover:text-white'}`}>{m}</button>
                    ))}
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {/* INFO TAB */}
                    {view === 'info' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-600 space-y-3">
                                <h3 className="text-slate-400 text-xs font-bold uppercase">Subscription</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm text-slate-300">
                                        <span>Plan</span> <span className="font-bold text-white">{details.profile.planType}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-300">
                                        <span>Status</span> 
                                        <span className={`uppercase font-bold ${details.profile.subscriptionStatus === 'active' ? 'text-green-400' : 'text-red-400'}`}>{details.profile.subscriptionStatus}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-300">
                                        <span>Expires</span> <span>{new Date(details.profile.trialEndsAt).toLocaleDateString()}</span>
                                    </div>
                                    {/* Added Country Info Display */}
                                    <div className="flex justify-between text-sm text-slate-300">
                                        <span>Region</span> <span>{details.profile.countryCode || 'NG'} ({currencySymbol})</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <button onClick={handlePlanChange} className="bg-purple-600 text-white px-3 py-2 rounded text-xs font-bold hover:bg-purple-500">Renew / Change Plan</button>
                                    <button onClick={handleChangeExpiry} className="bg-blue-600 text-white px-3 py-2 rounded text-xs hover:bg-blue-500 flex items-center justify-center gap-1"><Calendar size={12} /> Set Expiry</button>
                                </div>
                                {details.profile.subscriptionStatus === 'suspended' && (
                                     <button onClick={() => onAction(user.id, 'unsuspend')} className="w-full bg-green-600 text-white px-3 py-2 rounded text-xs font-bold hover:bg-green-500 mt-1">Unsuspend User</button>
                                )}
                            </div>
                            {/* Messages */}
                            <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-600">
                                <h3 className="text-slate-400 text-xs uppercase font-bold mb-2">Last 5 Messages</h3>
                                <div className="space-y-2">
                                    {details.lastMessages.map((msg: string, i: number) => (
                                        <div key={i} className="text-xs bg-slate-900 p-2 rounded text-slate-300 border border-slate-700">"{msg}"</div>
                                    ))}
                                    {details.lastMessages.length === 0 && <p className="text-slate-500 text-xs">No history.</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SALES TAB */}
                    {view === 'sales' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-700">
                                <div className="flex gap-2 items-center">
                                    <input type="date" className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" onChange={e => setSalesDate({...salesDate, start: e.target.value})} />
                                    <span className="text-slate-500">-</span>
                                    <input type="date" className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" onChange={e => setSalesDate({...salesDate, end: e.target.value})} />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => exportSales('csv')} className="bg-green-700 text-white px-3 py-1.5 rounded text-xs flex gap-1 items-center hover:bg-green-600"><Download size={14}/> CSV</button>
                                    <button onClick={() => exportSales('pdf')} className="bg-red-700 text-white px-3 py-1.5 rounded text-xs flex gap-1 items-center hover:bg-red-600"><FileText size={14}/> PDF</button>
                                </div>
                            </div>
                            <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700 max-h-96 overflow-y-auto">
                                <table className="w-full text-xs text-left text-slate-300">
                                    <thead className="text-slate-500 bg-slate-800 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2">Date</th>
                                            <th className="px-4 py-2">Items</th>
                                            <th className="px-4 py-2 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {getFilteredSales().length === 0 ? (
                                            <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">No sales found in this period.</td></tr>
                                        ) : getFilteredSales().map((s: any) => (
                                            <tr key={s._id}>
                                                <td className="px-4 py-2 text-slate-400">
                                                    {new Date(s.timestamp).toLocaleDateString()} <br/>
                                                    <span className="text-[10px] opacity-70">{new Date(s.timestamp).toLocaleTimeString()}</span>
                                                </td>
                                                <td className="px-4 py-2">
                                                    {s.items && s.items.length > 0 ? (
                                                        s.items.map((i:any, idx:number) => (
                                                            <div key={idx} className="mb-0.5">
                                                                <span className="text-white font-medium">{i.name}</span> 
                                                                <span className="text-slate-500 ml-1">x{i.qty}</span>
                                                            </div>
                                                        ))
                                                    ) : <span className="text-slate-500">Unknown Item</span>}
                                                </td>
                                                <td className="px-4 py-2 text-right text-green-400 font-mono">
                                                    {/* FIX: handle null totalMoney safely and use dynamic currency */}
                                                    {currencySymbol}{(s.totalMoney || 0).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    
                    {/* INVENTORY TAB */}
                    {view === 'inventory' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                             {details.inventory.map((item: any) => (
                                <div key={item._id} className="bg-slate-700/50 p-3 rounded-lg border border-slate-600 flex justify-between items-center">
                                    <div className="min-w-0">
                                        <p className="font-bold text-white truncate max-w-[120px]">{item.name}</p>
                                        <p className="text-xs text-slate-400">{currencySymbol}{item.lastUnitPrice || 0}</p>
                                    </div>
                                    <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs whitespace-nowrap">x{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* STAFF TAB */}
                    {view === 'staff' && (
                        <div className="space-y-2">
                            {details.staff.length === 0 ? <p className="text-slate-500">No staff found.</p> : details.staff.map((s: any) => (
                                <div key={s._id} className="flex justify-between items-center bg-slate-700/50 p-3 rounded-lg border border-slate-600">
                                    <div>
                                        <p className="font-bold text-white">{s.name || 'Staff'}</p>
                                        <p className="text-xs text-slate-400">{s.phoneNumber}</p>
                                    </div>
                                    <CheckCircle size={16} className="text-green-500" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}