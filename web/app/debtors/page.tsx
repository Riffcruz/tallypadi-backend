'use client';

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import Sidebar from '../../components/Sidebar';
import { 
  Search, Plus, Edit2, Trash2, 
  Wallet, Loader2, X, CheckCircle2, 
  Coins, ShoppingBag, Menu
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- TYPES ---
interface Debtor {
  _id: string;
  displayName: string;
  aliases: string[];
  totalDebt: number; 
  lastProductStr?: string;
}

interface UserProfile {
  currencyCode?: string;
  locale?: string;
  shopName?: string;
}

export default function DebtorsPage() {
  const router = useRouter();
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modal & Form States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [formData, setFormData] = useState({ 
    displayName: '', aliases: '', initialDebt: '', initialProduct: '' 
  });
  const [paymentData, setPaymentData] = useState({ amount: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) { router.push('/login'); return; }

    axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if(res.data?.user) setUser(res.data.user); })
      .catch(console.error);

    fetchDebtors(token);
  }, [router]);

  const fetchDebtors = async (token: string) => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/debtors`, { headers: { Authorization: `Bearer ${token}` } });
      setDebtors(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const currencyCode = user?.currencyCode || 'NGN';
  const userLocale = user?.locale || 'en-NG';

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(userLocale, {
      style: 'currency', currency: currencyCode, maximumFractionDigits: 0
    }).format(amount);
  };

  const filteredDebtors = useMemo(() => {
    return debtors.filter(d => 
      d.displayName.toLowerCase().includes(search.toLowerCase()) || 
      d.aliases.some(a => a.toLowerCase().includes(search.toLowerCase()))
    );
  }, [debtors, search]);

  const totalOutstanding = debtors.reduce((acc, curr) => acc + curr.totalDebt, 0);

  const closeForm = () => setIsFormOpen(false);
  const closePayment = () => setIsPaymentOpen(false);

  const handleSaveDebtor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const token = localStorage.getItem('tallyToken');
    try {
      const payload = {
        displayName: formData.displayName,
        aliases: formData.aliases.split(',').map(s => s.trim()).filter(Boolean),
        initialDebt: !selectedDebtor && formData.initialDebt ? Number(formData.initialDebt) : undefined,
        initialProduct: !selectedDebtor ? formData.initialProduct : undefined
      };

      if (selectedDebtor) {
        await axios.put(`${API_URL}/debtors/${selectedDebtor._id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/debtors`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      fetchDebtors(token!);
      closeForm();
      Swal.fire({ toast: true, icon: 'success', title: 'Saved successfully', position: 'top-end', showConfirmButton: false, timer: 2000 });
    } catch (err) {
      Swal.fire('Error', 'Failed to save.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtor) return;
    setSubmitting(true);
    const token = localStorage.getItem('tallyToken');
    try {
      await axios.post(`${API_URL}/debtors/payment`, {
        debtorId: selectedDebtor._id,
        amount: Number(paymentData.amount),
      }, { headers: { Authorization: `Bearer ${token}` } });
      fetchDebtors(token!);
      closePayment();
      Swal.fire({ icon: 'success', title: 'Payment Recorded' });
    } catch (err) {
      Swal.fire('Error', 'Payment failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative overflow-x-hidden">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full max-w-full overflow-x-hidden">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
          <div>
            <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-white border border-gray-200 rounded-xl md:hidden">
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-3xl font-black text-gray-900">Debtors</h1>
            </div>
            <p className="text-gray-500 text-sm mt-1">Total Outstanding: <span className="text-red-600 font-bold">{formatMoney(totalOutstanding)}</span></p>
          </div>
          <button onClick={() => { setSelectedDebtor(null); setFormData({displayName:'', aliases:'', initialDebt:'', initialProduct:''}); setIsFormOpen(true); }} 
            className="w-full md:w-auto px-6 py-4 bg-gray-900 text-white font-bold rounded-2xl shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> Add New Debtor
          </button>
        </header>

        <div className="space-y-8">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search by name..." 
              className="block w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-20 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
              <p className="text-gray-400 font-bold text-xs uppercase">Loading Debtors...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredDebtors.map(debtor => (
                <div key={debtor._id} className="bg-white rounded-4xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[100px] -mr-16 -mt-16 transition-all group-hover:bg-emerald-50/50" />
                  
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xl border-2 border-emerald-50 shadow-sm">
                          {debtor.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-black text-gray-900 text-lg capitalize tracking-tight">{debtor.displayName}</h3>
                          {debtor.aliases.length > 0 && <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">AKA: {debtor.aliases[0]}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setSelectedDebtor(debtor); setFormData({displayName: debtor.displayName, aliases: debtor.aliases.join(', '), initialDebt: '', initialProduct: ''}); setIsFormOpen(true); }} 
                          className="p-2.5 bg-gray-50 text-gray-400 hover:text-emerald-600 rounded-xl transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={async () => {
                          const res = await Swal.fire({ title: 'Remove Debtor?', text: "This deletes the profile.", icon: 'warning', showCancelButton: true });
                          if(res.isConfirmed) {
                            await axios.delete(`${API_URL}/debtors/${debtor._id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('tallyToken')}` } });
                            fetchDebtors(localStorage.getItem('tallyToken')!);
                          }
                        }} className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-600 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50/80 rounded-2xl border border-slate-100 mb-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Balance</span>
                        <span className={`text-2xl font-black tabular-nums ${debtor.totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatMoney(debtor.totalDebt)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</span>
                        <div className="mt-1 flex items-center gap-1.5 justify-end">
                          <div className={`w-2 h-2 rounded-full ${debtor.totalDebt > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                          <span className="text-xs font-bold text-gray-700">{debtor.totalDebt > 0 ? 'Owing' : 'Cleared'}</span>
                        </div>
                      </div>
                    </div>

                    {debtor.lastProductStr && (
                      <div className="flex items-center gap-3 mb-6 px-2">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <ShoppingBag className="w-4 h-4 text-gray-400" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium line-clamp-1 italic">
                          Last bought: <span className="text-gray-800 font-bold not-italic">{debtor.lastProductStr}</span>
                        </p>
                      </div>
                    )}

                    <button 
                      onClick={() => { setSelectedDebtor(debtor); setPaymentData({amount:''}); setIsPaymentOpen(true); }}
                      disabled={debtor.totalDebt <= 0}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black rounded-2xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      {debtor.totalDebt > 0 ? <><Wallet className="w-5 h-5" /> Settle Balance</> : <><CheckCircle2 className="w-5 h-5" /> All Paid</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {isFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-5xl w-full max-w-md p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">{selectedDebtor ? 'Edit Debtor' : 'New Debtor'}</h3>
              <button onClick={closeForm} className="p-3 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"><X className="w-6 h-6"/></button>
            </div>
            <form onSubmit={handleSaveDebtor} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Customer Name</label>
                <input required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:border-emerald-500 transition-colors" placeholder="e.g. Papa Jude" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Aliases</label>
                <input className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-medium outline-none focus:border-emerald-500 transition-colors" placeholder="e.g. Mechanic" value={formData.aliases} onChange={e => setFormData({...formData, aliases: e.target.value})} />
              </div>

              {!selectedDebtor && (
                <div className="p-6 bg-red-50 rounded-3xl border border-red-100 space-y-4">
                  <p className="text-xs font-black text-red-800 uppercase tracking-widest flex items-center gap-2"><Coins className="w-4 h-4"/> Opening Balance</p>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="number" className="p-3 bg-white border border-red-200 rounded-xl text-sm font-bold" placeholder="Amount" value={formData.initialDebt} onChange={e => setFormData({...formData, initialDebt: e.target.value})} />
                    <input type="text" className="p-3 bg-white border border-red-200 rounded-xl text-sm" placeholder="For what?" value={formData.initialProduct} onChange={e => setFormData({...formData, initialProduct: e.target.value})} />
                  </div>
                </div>
              )}

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all flex justify-center items-center">
                {submitting ? <Loader2 className="animate-spin w-6 h-6"/> : 'Save Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isPaymentOpen && selectedDebtor && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-5xl w-full max-w-sm p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 text-emerald-600 shadow-sm"><Wallet className="w-10 h-10" /></div>
              <h3 className="text-2xl font-black text-gray-900">Payment</h3>
              <p className="text-sm text-gray-400 font-medium">Clear balance for <span className="text-gray-900 font-black">{selectedDebtor.displayName}</span></p>
            </div>
            
            <form onSubmit={handleRecordPayment} className="space-y-6">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-xl">{currencyCode === 'NGN' ? '₦' : '$'}</span>
                <input type="number" required autoFocus className="w-full pl-12 pr-4 py-6 bg-gray-50 border border-gray-200 rounded-3xl font-black text-3xl text-center outline-none focus:border-emerald-500 tabular-nums shadow-inner" placeholder="0.00" value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: e.target.value})} max={selectedDebtor.totalDebt} />
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={closePayment} className="flex-1 py-4 bg-white border border-gray-200 text-gray-500 font-black rounded-2xl">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-100">{submitting ? <Loader2 className="animate-spin w-6 h-6"/> : 'Confirm'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}