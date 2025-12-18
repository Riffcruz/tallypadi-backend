'use client';

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { 
  Search, Plus, User, Edit2, Trash2, 
  Wallet, Loader2, MoreVertical, X, 
  CheckCircle2, ArrowRight, ShieldAlert,
  Coins, Phone
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- TYPES ---
interface Debtor {
  _id: string;
  displayName: string;
  aliases: string[];
  // These come from the backend aggregation, not the schema directly
  totalDebt: number; 
  lastTransactionDate?: string;
}

interface UserProfile {
  currencyCode?: string;
  locale?: string;
}

// --- COMPONENTS ---

export default function DebtorsPage() {
  const router = useRouter();
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);

  // Form Data
  const [formData, setFormData] = useState({ displayName: '', aliases: '' });
  const [paymentData, setPaymentData] = useState({ amount: '' });
  const [submitting, setSubmitting] = useState(false);

  // --- INITIAL LOAD ---
  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    // 1. Get User Config (Currency)
    axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if(res.data?.user) setUser(res.data.user); })
      .catch(console.error);

    fetchDebtors(token);
  }, [router]);

  const fetchDebtors = async (token: string) => {
    try {
      setLoading(true);
      // Backend should aggregate Transactions to get 'totalDebt' for each Debtor
      const res = await axios.get(`${API_URL}/debtors`, { headers: { Authorization: `Bearer ${token}` } });
      setDebtors(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS ---

  const handleDelete = async (id: string, name: string) => {
    const result = await Swal.fire({
      title: `Delete ${name}?`,
      text: "This removes the name from your list. It does NOT delete their sales history.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete'
    });

    if (result.isConfirmed) {
      const token = localStorage.getItem('tallyToken');
      try {
        await axios.delete(`${API_URL}/debtors/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        setDebtors(prev => prev.filter(d => d._id !== id));
        Swal.fire('Deleted!', 'Debtor removed.', 'success');
      } catch (error) {
        Swal.fire('Error', 'Could not delete debtor.', 'error');
      }
    }
  };

  const handleSaveDebtor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const token = localStorage.getItem('tallyToken');

    try {
      const payload = {
        displayName: formData.displayName,
        aliases: formData.aliases.split(',').map(s => s.trim()).filter(Boolean)
      };

      if (selectedDebtor) {
        // Update
        const res = await axios.put(`${API_URL}/debtors/${selectedDebtor._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDebtors(prev => prev.map(d => d._id === selectedDebtor._id ? { ...d, ...res.data, totalDebt: d.totalDebt } : d));
        Swal.fire({ toast: true, icon: 'success', title: 'Updated successfully', position: 'top-end', showConfirmButton: false, timer: 3000 });
      } else {
        // Create
        const res = await axios.post(`${API_URL}/debtors`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDebtors(prev => [ { ...res.data, totalDebt: 0 }, ...prev]);
        Swal.fire({ toast: true, icon: 'success', title: 'Debtor added', position: 'top-end', showConfirmButton: false, timer: 3000 });
      }
      closeForm();
    } catch (err) {
      Swal.fire('Error', 'Failed to save details.', 'error');
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
      // This hits your SALES endpoint to record a "DEBT_PAYMENT" transaction
      await axios.post(`${API_URL}/debtors/payment`, {
        debtorId: selectedDebtor._id,
        amount: Number(paymentData.amount),
        date: new Date().toISOString()
      }, { headers: { Authorization: `Bearer ${token}` } });

      // Update local state to reflect new balance
      setDebtors(prev => prev.map(d => 
        d._id === selectedDebtor._id 
          ? { ...d, totalDebt: Math.max(0, d.totalDebt - Number(paymentData.amount)) } 
          : d
      ));

      Swal.fire({ icon: 'success', title: 'Payment Recorded!', text: `New balance updated.` });
      closePayment();
    } catch (err) {
      Swal.fire('Error', 'Could not record payment.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // --- HELPERS ---
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency', currency: user?.currencyCode || 'NGN', maximumFractionDigits: 0
    }).format(amount);
  };

  const openAdd = () => {
    setSelectedDebtor(null);
    setFormData({ displayName: '', aliases: '' });
    setIsFormOpen(true);
  };

  const openEdit = (d: Debtor) => {
    setSelectedDebtor(d);
    setFormData({ displayName: d.displayName, aliases: d.aliases.join(', ') });
    setIsFormOpen(true);
  };

  const openPayment = (d: Debtor) => {
    setSelectedDebtor(d);
    setPaymentData({ amount: '' });
    setIsPaymentOpen(true);
  };

  const closeForm = () => setIsFormOpen(false);
  const closePayment = () => setIsPaymentOpen(false);

  const filtered = useMemo(() => {
    return debtors.filter(d => 
      d.displayName.toLowerCase().includes(search.toLowerCase()) || 
      d.aliases.some(a => a.toLowerCase().includes(search.toLowerCase()))
    );
  }, [debtors, search]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-gray-900 pb-20">
      
      {/* --- HEADER --- */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 md:py-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Debtors Manager</h1>
              <p className="text-sm text-gray-500 font-medium">
                Track who owes you and record payments
              </p>
            </div>
            <button 
              onClick={openAdd}
              className="w-full md:w-auto px-5 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add New Debtor
            </button>
          </div>

          {/* Search Bar */}
          <div className="mt-6 relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
            </div>
            <input 
              type="text" 
              placeholder="Search by name or alias..." 
              className="block w-full pl-11 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-base font-medium text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* --- LIST CONTENT --- */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <User className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No debtors found</h3>
            <p className="text-gray-500">Add people who buy on credit to track them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(debtor => (
              <div key={debtor._id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                
                {/* Visual Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-black text-lg shadow-sm">
                      {debtor.displayName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg leading-tight capitalize">{debtor.displayName}</h3>
                      <p className="text-xs text-gray-500 font-medium">
                        {debtor.aliases.length > 0 ? `Alias: ${debtor.aliases[0]}` : 'No alias'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Action Menu (Edit/Delete) */}
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(debtor)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(debtor._id, debtor.displayName)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Debt Amount Display */}
                <div className="bg-gray-50 rounded-xl p-4 mb-4 flex justify-between items-center border border-gray-100">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Outstanding Balance</span>
                  <span className={`text-xl font-black ${debtor.totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatMoney(debtor.totalDebt)}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button 
                    onClick={() => openPayment(debtor)}
                    disabled={debtor.totalDebt <= 0}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                  >
                    {debtor.totalDebt > 0 ? (
                      <>
                        <Wallet className="w-4 h-4" /> Settle Debt
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Cleared
                      </>
                    )}
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- ADD / EDIT MODAL --- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-900">
                {selectedDebtor ? 'Edit Details' : 'New Debtor'}
              </h3>
              <button onClick={closeForm} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"><X className="w-5 h-5"/></button>
            </div>

            <form onSubmit={handleSaveDebtor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                <input 
                  required
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. Emeka Okafor"
                  value={formData.displayName}
                  onChange={e => setFormData({...formData, displayName: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Aliases / Nicknames</label>
                <input 
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. Mama Chinedu, Customer A"
                  value={formData.aliases}
                  onChange={e => setFormData({...formData, aliases: e.target.value})}
                />
                <p className="text-[10px] text-gray-400 mt-1">Separate multiple aliases with commas.</p>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition flex justify-center items-center gap-2"
                >
                  {submitting ? <Loader2 className="animate-spin w-5 h-5"/> : (selectedDebtor ? 'Save Changes' : 'Create Debtor')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- PAYMENT MODAL --- */}
      {isPaymentOpen && selectedDebtor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
                <Coins className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-gray-900">Record Payment</h3>
              <p className="text-sm text-gray-500">from <span className="font-bold text-gray-800">{selectedDebtor.displayName}</span></p>
            </div>

            <div className="bg-red-50 p-3 rounded-xl mb-6 text-center border border-red-100">
              <p className="text-xs text-red-600 font-bold uppercase">Current Debt</p>
              <p className="text-2xl font-black text-red-700">{formatMoney(selectedDebtor.totalDebt)}</p>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Amount</span>
                <input 
                  type="number"
                  required
                  autoFocus
                  className="w-full pl-20 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl font-black text-xl text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none text-right"
                  placeholder="0.00"
                  value={paymentData.amount}
                  onChange={e => setPaymentData({...paymentData, amount: e.target.value})}
                  max={selectedDebtor.totalDebt} // Prevent overpayment
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={closePayment}
                  className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition flex justify-center items-center gap-2 shadow-lg shadow-emerald-200"
                >
                  {submitting ? <Loader2 className="animate-spin w-5 h-5"/> : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}