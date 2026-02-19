'use client';

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import Sidebar from '../../components/Sidebar';
import { 
  Search, Plus, Edit2, Trash2, 
  Calendar, Loader2, X, CheckCircle2, 
  Clock, Package, Menu, RefreshCw,
  ClipboardList, AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- TYPES ---
interface Order {
  _id: string;
  description: string;
  customerName: string;
  customerPhone?: string;
  price: number;
  amountPaid: number;
  balance: number;
  deliveryDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';
  createdAt: string;
}

interface UserProfile {
  currencyCode?: string;
  locale?: string;
  shopName?: string;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modal & Form States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  const [formData, setFormData] = useState({ 
    description: '', 
    customerName: '', 
    customerPhone: '',
    price: '', 
    amountPaid: '', 
    deliveryDate: '',
    status: 'PENDING'
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
          if(res.data?.user) setUser(res.data.user);
        }
      } catch (e) { console.error("Profile fetch error", e); }
    };
    fetchProfile();
    fetchOrders(token || '');
  }, [router]);

  const fetchOrders = async (token: string) => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/orders`, { headers: { Authorization: `Bearer ${token}` } });
      const data = res.data?.orders || [];
      setOrders(data);
    } catch (err) {
      console.warn("API unavailable or failed:", err);
      Swal.fire({
        toast: true,
        icon: 'error',
        title: 'Could not load orders',
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

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const nameMatch = (o.customerName || '').toLowerCase().includes(search.toLowerCase());
      const descMatch = (o.description || '').toLowerCase().includes(search.toLowerCase());
      return nameMatch || descMatch;
    });
  }, [orders, search]);

  const closeForm = () => setIsFormOpen(false);

  const handleRefresh = () => {
    const token = getCookie('tallyToken');
    fetchOrders(token || '');
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const token = getCookie('tallyToken');
    try {
      const payload = {
        description: formData.description,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        price: Number(formData.price),
        amountPaid: Number(formData.amountPaid),
        deliveryDate: formData.deliveryDate,
        status: formData.status
      };

      if (selectedOrder) {
        await axios.put(`${API_URL}/orders/${selectedOrder._id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/orders`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      fetchOrders(token || '');
      closeForm();
      Swal.fire({
        toast: true,
        icon: 'success',
        title: 'Order saved successfully',
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
      });
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to save order.';
      Swal.fire('Error', msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (order: Order) => {
    const res = await Swal.fire({ 
      title: 'Delete Order?', 
      text: `Are you sure you want to delete order for ${order.customerName}?`, 
      icon: 'warning', 
      showCancelButton: true,
      confirmButtonColor: '#d33'
    });

    if (res.isConfirmed) {
      const token = getCookie('tallyToken');
      try {
        await axios.delete(`${API_URL}/orders/${order._id}`, { headers: { Authorization: `Bearer ${token}` } });
        fetchOrders(token || '');
        Swal.fire({ toast: true, icon: 'success', title: 'Order deleted', position: 'top-end', showConfirmButton: false, timer: 2000 });
      } catch (err) {
        Swal.fire('Error', 'Failed to delete.', 'error');
      }
    }
  };

  const openEdit = (order: Order) => {
    setSelectedOrder(order);
    setFormData({
      description: order.description,
      customerName: order.customerName,
      customerPhone: order.customerPhone || '',
      price: String(order.price),
      amountPaid: String(order.amountPaid),
      deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '',
      status: order.status as string
    });
    setIsFormOpen(true);
  };

  const openNew = () => {
    setSelectedOrder(null);
    setFormData({
      description: '',
      customerName: '',
      customerPhone: '',
      price: '',
      amountPaid: '',
      deliveryDate: '',
      status: 'PENDING'
    });
    setIsFormOpen(true);
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'PENDING': return 'bg-yellow-100 text-yellow-800';
          case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800';
          case 'COMPLETED': return 'bg-emerald-100 text-emerald-800';
          case 'DELIVERED': return 'bg-purple-100 text-purple-800';
          case 'CANCELLED': return 'bg-red-100 text-red-800';
          default: return 'bg-gray-100 text-gray-800';
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
              <h1 className="text-3xl font-black text-gray-900">Orders</h1>
              <button onClick={handleRefresh} className="p-2 text-gray-400 hover:text-emerald-600 transition-colors" title="Refresh List">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-gray-500 text-sm mt-1">Manage jobs and orders</p>
          </div>
          <button onClick={openNew} 
            className="w-full md:w-auto px-6 py-4 bg-gray-900 text-white font-bold rounded-2xl shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> New Order
          </button>
        </header>

        <div className="space-y-8">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search by customer or description..." 
              className="block w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && orders.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
              <p className="text-gray-400 font-bold text-xs uppercase">Loading Orders...</p>
            </div>
          ) : (
            <>
              {filteredOrders.length === 0 && !loading ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                    <ClipboardList className="w-8 h-8" />
                  </div>
                  <p className="text-gray-500 font-medium">No orders found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {filteredOrders.map(order => (
                    <div key={order._id} className="bg-white rounded-4xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[100px] -mr-16 -mt-16 transition-all group-hover:bg-emerald-50/50" />
                      
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xl border-2 border-blue-50 shadow-sm shrink-0">
                              {(order.customerName || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-black text-gray-900 text-lg capitalize tracking-tight line-clamp-1">{order.customerName}</h3>
                              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest line-clamp-1">{order.description}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => openEdit(order)} 
                              className="p-2.5 bg-gray-50 text-gray-400 hover:text-emerald-600 rounded-xl transition-colors"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(order)} className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-600 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50/80 rounded-2xl border border-slate-100 mb-6">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Price</span>
                            <span className="text-xl font-black text-gray-900">
                              {formatMoney(order.price)}
                            </span>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Balance</span>
                            <span className={`text-xl font-black tabular-nums ${order.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {formatMoney(order.balance)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mb-2 px-2">
                           <Calendar className="w-4 h-4 text-gray-400" />
                           <p className="text-sm text-gray-600 font-medium">Due: <span className="font-bold">{new Date(order.deliveryDate).toLocaleDateString()}</span></p>
                        </div>

                         <div className="flex items-center gap-3 mb-6 px-2">
                           <div className={`px-2 py-1 rounded-md text-xs font-bold ${getStatusColor(order.status)}`}>
                               {order.status}
                           </div>
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

      {/* MODALS */}
      {isFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-5xl w-full max-w-md p-8 shadow-2xl my-auto">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">{selectedOrder ? 'Edit Order' : 'New Order'}</h3>
              <button onClick={closeForm} className="p-3 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"><X className="w-6 h-6"/></button>
            </div>
            <form onSubmit={handleSaveOrder} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Customer Name</label>
                <input required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:border-emerald-500 transition-colors" placeholder="e.g. Amina" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} />
              </div>
               <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Description</label>
                <textarea required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-medium outline-none focus:border-emerald-500 transition-colors" placeholder="e.g. Sewing of Red Dress" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Price</label>
                    <input type="number" required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:border-emerald-500 transition-colors" placeholder="0.00" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Amount Paid</label>
                    <input type="number" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:border-emerald-500 transition-colors" placeholder="0.00" value={formData.amountPaid} onChange={e => setFormData({...formData, amountPaid: e.target.value})} />
                  </div>
              </div>

               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Delivery Date</label>
                    <input type="date" required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-medium outline-none focus:border-emerald-500 transition-colors" value={formData.deliveryDate} onChange={e => setFormData({...formData, deliveryDate: e.target.value})} />
                  </div>
                   <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Status</label>
                    <select className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-medium outline-none focus:border-emerald-500 transition-colors" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                        <option value="PENDING">PENDING</option>
                        <option value="IN_PROGRESS">IN PROGRESS</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all flex justify-center items-center">
                {submitting ? <Loader2 className="animate-spin w-6 h-6"/> : 'Save Order'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
