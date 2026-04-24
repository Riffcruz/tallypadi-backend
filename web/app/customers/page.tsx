'use client';

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import Sidebar from '../../components/Sidebar';
import { 
  Search, Plus, Edit2, Trash2, 
  Loader2, X, Settings, User, Trophy, Menu, RefreshCw, Star
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- TYPES ---
interface Customer {
  _id: string;
  name: string;
  phoneNumber: string;
  royaltyPoints: number;
  totalSpent: number;
  lastPurchaseDate?: string;
  createdAt: string;
}

interface UserProfile {
  currencyCode?: string;
  locale?: string;
  settings?: {
    royalty?: {
      enabled: boolean;
      pointsPerPurchase: number;
      currencyValuePerPoint: number;
      redemptionValuePerPoint: number;
    }
  };
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modal & Form States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const [formData, setFormData] = useState({ 
    name: '', phoneNumber: '', royaltyPoints: '' 
  });
  
  const [settingsData, setSettingsData] = useState({
    enabled: false,
    pointsPerPurchase: 1,
    currencyValuePerPoint: 10,
    redemptionValuePerPoint: 1
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Avoid SSR issues
    if (typeof window === 'undefined') return;

    const token = getCookie('tallyToken');
    if (!token) { 
      router.push('/login'); 
      return;
    }

    const fetchProfile = async () => {
      try {
        if (token) {
          const res = await axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.data?.user) {
             setUser(res.data.user);
             const r = res.data.user.settings?.royalty;
             if (r) {
                setSettingsData({
                  enabled: !!r.enabled,
                  pointsPerPurchase: r.pointsPerPurchase || 1,
                  currencyValuePerPoint: r.currencyValuePerPoint || 1,
                  redemptionValuePerPoint: r.redemptionValuePerPoint || 1
                });
             }
          }
        }
      } catch (e) { console.error("Profile fetch error", e); }
    };
    fetchProfile();
    fetchCustomers(token || '');
  }, [router]);

  const fetchCustomers = async (token: string) => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/customers`, { headers: { Authorization: `Bearer ${token}` } });
      const data = Array.isArray(res.data) ? res.data : (res.data?.customers || res.data?.data || []);
      setCustomers(data);
    } catch (err) {
      console.warn("API unavailable or failed:", err);
      Swal.fire({
        toast: true,
        icon: 'error',
        title: 'Could not load customers',
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setLoading(false);
    }
  };

  const currencyCode = user?.currencyCode || 'NGN';
  const userLocale = user?.locale || 'en-NG';

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(userLocale, {
      style: 'currency', currency: currencyCode, maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const nameMatch = (c.name || '').toLowerCase().includes(search.toLowerCase());
      const phoneMatch = (c.phoneNumber || '').toLowerCase().includes(search.toLowerCase());
      return nameMatch || phoneMatch;
    });
  }, [customers, search]);

  const closeForm = () => setIsFormOpen(false);
  const closeSettings = () => setIsSettingsOpen(false);

  const handleRefresh = () => {
    const token = getCookie('tallyToken');
    fetchCustomers(token || '');
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();

    const phoneRegex = /^\+?[\d\s\-\(\)]{7,15}$/;
    if (!phoneRegex.test(formData.phoneNumber)) {
      Swal.fire('Invalid Input', 'Please enter a valid phone number.', 'error');
      return;
    }

    setSubmitting(true);
    const token = getCookie('tallyToken');
    try {
      const payload = {
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        royaltyPoints: formData.royaltyPoints ? Number(formData.royaltyPoints) : undefined,
      };

      if (selectedCustomer) {
        await axios.put(`${API_URL}/customers/${selectedCustomer._id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/customers`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      fetchCustomers(token || '');
      closeForm();
      Swal.fire({
        toast: true,
        icon: 'success',
        title: 'Customer saved successfully',
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
      });
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to save.';
      Swal.fire('Error', msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    const res = await Swal.fire({ 
      title: 'Delete Customer?', 
      text: `Are you sure you want to delete ${customer.name}? This will clear their loyalty points but won't delete past sales.`, 
      icon: 'warning', 
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Yes, delete!'
    });

    if (res.isConfirmed) {
      const token = getCookie('tallyToken');
      try {
        await axios.delete(`${API_URL}/customers/${customer._id}`, { headers: { Authorization: `Bearer ${token}` } });
        fetchCustomers(token || '');
        Swal.fire({ toast: true, icon: 'success', title: 'Customer deleted', position: 'top-end', showConfirmButton: false, timer: 2000 });
      } catch (err) {
        Swal.fire('Error', 'Failed to delete.', 'error');
      }
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const token = getCookie('tallyToken');
    try {
      await axios.put(`${API_URL}/settings`, {
        settings: {
          royalty: {
            enabled: settingsData.enabled,
            pointsPerPurchase: Number(settingsData.pointsPerPurchase),
            currencyValuePerPoint: Number(settingsData.currencyValuePerPoint),
            redemptionValuePerPoint: Number(settingsData.redemptionValuePerPoint)
          }
        }
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      setUser(prev => prev ? { 
        ...prev, 
        settings: { 
          ...prev.settings, 
          royalty: settingsData 
        } 
      } : null);
      
      closeSettings();
      Swal.fire({ toast: true, icon: 'success', title: 'Settings saved', position: 'top-end', showConfirmButton: false, timer: 2000 });
    } catch (err) {
      Swal.fire('Error', 'Failed to update settings.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isRoyaltyEnabled = user?.settings?.royalty?.enabled;

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
              <h1 className="text-3xl font-black text-gray-900">Customers</h1>
              <button onClick={handleRefresh} className="p-2 text-gray-400 hover:text-indigo-600 transition-colors" title="Refresh List">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Manage your CRM and Loyalty Points System
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button onClick={() => setIsSettingsOpen(true)} className="w-full sm:w-auto px-5 py-4 bg-white border border-gray-200 text-gray-700 font-bold rounded-2xl shadow-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
              <Settings className="w-5 h-5 text-gray-500" /> Settings
            </button>
            <button onClick={() => { setSelectedCustomer(null); setFormData({name:'', phoneNumber:'', royaltyPoints:''}); setIsFormOpen(true); }} 
              className="w-full sm:w-auto px-6 py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> New Customer
            </button>
          </div>
        </header>

        {isRoyaltyEnabled && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
                <Star className="w-5 h-5 fill-current" />
              </div>
              <div>
                <p className="font-bold text-yellow-900 text-sm">Loyalty Program is Active</p>
                <p className="text-xs text-yellow-700 font-medium mt-0.5">Customers earn {user.settings?.royalty?.pointsPerPurchase} pts per {formatMoney(user.settings?.royalty?.currencyValuePerPoint || 1)} spent.</p>
              </div>
            </div>
            <button onClick={() => setIsSettingsOpen(true)} className="text-xs font-bold text-yellow-700 bg-yellow-100/50 hover:bg-yellow-200 px-3 py-1.5 rounded-lg transition-colors">Edit</button>
          </div>
        )}

        <div className="space-y-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search by name or phone..." 
              className="block w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && customers.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              <p className="text-gray-400 font-bold text-xs uppercase">Loading Customers...</p>
            </div>
          ) : (
            <>
              {filteredCustomers.length === 0 && !loading ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                    <User className="w-8 h-8" />
                  </div>
                  <p className="text-gray-500 font-medium">No customers found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredCustomers.map(customer => (
                    <div key={customer._id} className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
                      
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0 border border-indigo-100/50">
                            {(customer.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 capitalize tracking-tight line-clamp-1">{customer.name}</h3>
                            <p className="text-xs text-gray-500 tracking-wide font-medium">{customer.phoneNumber}</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setSelectedCustomer(customer); setFormData({name: customer.name, phoneNumber: customer.phoneNumber, royaltyPoints: String(customer.royaltyPoints || 0)}); setIsFormOpen(true); }} 
                            className="p-2 bg-gray-50 text-gray-500 hover:text-indigo-600 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(customer)} className="p-2 bg-gray-50 text-gray-500 hover:text-red-600 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>

                      <div className="mt-auto grid grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 flex items-center gap-1.5"><Trophy className="w-3 h-3 text-yellow-500"/> Points</p>
                          <p className="text-lg font-black text-gray-800 mt-1">{customer.royaltyPoints || 0}</p>
                        </div>
                        <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Life Spent</p>
                          <p className="text-sm font-black text-emerald-700 mt-1.5 truncate">{formatMoney(customer.totalSpent || 0)}</p>
                        </div>
                      </div>
                      
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* CRM Customer Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-2 bg-indigo-500" />
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">{selectedCustomer ? 'Edit Customer' : 'New Customer'}</h3>
              <button onClick={closeForm} className="p-2.5 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500"/></button>
            </div>
            
            <form onSubmit={handleSaveCustomer} className="space-y-5">
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Customer Name</label>
                <input required className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-gray-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all" placeholder="e.g. Jane Doe" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Phone Number</label>
                <input required type="tel" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-gray-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all" placeholder="e.g. 08012345678" value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} />
              </div>
              
              {selectedCustomer && (
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Royalty Points Balance</label>
                  <input type="number" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-gray-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all" placeholder="0" value={formData.royaltyPoints} onChange={e => setFormData({...formData, royaltyPoints: e.target.value})} />
                </div>
              )}

              <button type="submit" disabled={submitting} className="w-full py-4 mt-2 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/30 transition-all flex justify-center items-center active:scale-95">
                {submitting ? <Loader2 className="animate-spin w-5 h-5"/> : 'Save Customer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Royalty Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl relative overflow-hidden">
            
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                    <Trophy className="w-5 h-5" />
                 </div>
                 <h3 className="text-xl font-black text-gray-900 tracking-tight">Royalty Program</h3>
              </div>
              
              <button onClick={closeSettings} className="p-2.5 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500"/></button>
            </div>
            
            <form onSubmit={handleSaveSettings} className="space-y-6">
              
              <label className="flex items-center justify-between p-4 border border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-50 transition-colors">
                <div>
                  <p className="font-bold text-gray-900">Enable Royalty Rules</p>
                  <p className="text-xs text-gray-500 mt-0.5">Award points to registered customers on sale</p>
                </div>
                <div className="relative inline-block w-12 h-6 rounded-full transition-colors duration-200 ease-in-out" style={{ backgroundColor: settingsData.enabled ? '#4F46E5' : '#E5E7EB' }}>
                  <span className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out ${settingsData.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  <input type="checkbox" className="hidden" checked={settingsData.enabled} onChange={e => setSettingsData({...settingsData, enabled: e.target.checked})} />
                </div>
              </label>

              <div className={`space-y-5 transition-opacity duration-300 ${!settingsData.enabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                   <p className="text-sm font-bold text-gray-900 mb-4">Points Formula</p>
                   
                   <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5">Earn</label>
                        <div className="relative">
                           <input type="number" min="1" required className="w-full p-3 font-bold text-gray-900 border border-gray-300 rounded-xl outline-none focus:border-indigo-500 pr-12" value={settingsData.pointsPerPurchase} onChange={e => setSettingsData({...settingsData, pointsPerPurchase: Number(e.target.value)})} />
                           <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">PTS</span>
                        </div>
                      </div>
                      
                      <div className="text-gray-400 font-bold mt-5">=</div>
                      
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5">For Every Spent</label>
                        <div className="relative">
                           <input type="number" min="1" required className="w-full p-3 font-bold text-gray-900 border border-gray-300 rounded-xl outline-none focus:border-indigo-500 pl-8" value={settingsData.currencyValuePerPoint} onChange={e => setSettingsData({...settingsData, currencyValuePerPoint: Number(e.target.value)})} />
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{currencyCode === 'NGN' ? '₦' : '$'}</span>
                        </div>
                      </div>
                   </div>
                   
                    <p className="mt-4 text-xs font-medium text-emerald-600 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100">
                       Example: If a customer spends {formatMoney(Number(settingsData.currencyValuePerPoint) * 5 || 50)}, they earn <span className="font-bold">{settingsData.pointsPerPurchase * 5 || 5} points</span>.
                    </p>
                 </div>

                 <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 mt-4">
                    <p className="text-sm font-bold text-gray-900 mb-4">Redemption Value (Pay with Points)</p>
                    <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                       <div className="flex-1 min-w-[120px]">
                         <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5">1 Point is Worth</label>
                         <div className="relative">
                            <input type="number" step="0.01" min="0" required className="w-full p-3 font-bold text-gray-900 border border-gray-300 rounded-xl outline-none focus:border-indigo-500 pl-8" value={settingsData.redemptionValuePerPoint} onChange={e => setSettingsData({...settingsData, redemptionValuePerPoint: Number(e.target.value)})} />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{currencyCode === 'NGN' ? '₦' : '$'}</span>
                         </div>
                       </div>
                    </div>
                    <p className="mt-4 text-xs font-medium text-indigo-600 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                       Example: If a customer has 50 points, they can use it to pay for {formatMoney(Number(settingsData.redemptionValuePerPoint) * 50 || 50)} worth of goods.
                    </p>
                 </div>

              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 mt-2 bg-gray-900 text-white font-black rounded-xl shadow-lg hover:bg-black transition-all flex justify-center items-center active:scale-95">
                {submitting ? <Loader2 className="animate-spin w-5 h-5"/> : 'Save Settings'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
