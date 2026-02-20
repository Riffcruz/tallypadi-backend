'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { getCookie } from '../../utils/cookies';
import Swal from 'sweetalert2';
import {
  FileText,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  ExternalLink,
  Menu
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface InvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  unit?: string;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  customerName: string;
  totalAmount: number;
  status: 'GENERATED' | 'PAID' | 'CANCELLED';
  dateIssued: string;
  createdAt: string;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // New Invoice Form
  const [customerName, setCustomerName] = useState('');
  const [description, setDescription] = useState('');
  const [formItems, setFormItems] = useState<{name: string, qty: number, unitPrice: number}[]>([{ name: '', qty: 1, unitPrice: 0 }]);

  const getToken = () => {
    const token = getCookie('tallyToken');
    if (!token) router.push('/login');
    return token;
  };

  const fetchInvoices = async () => {
    const token = getToken();
    if (!token) return;

    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/invoices`, {
        params: { page, search },
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvoices(res.data.data);
      setTotalPages(Math.ceil(res.data.total / 20));
    } catch (err: any) {
       console.error(err);
       if (err.response?.status === 403) {
           Swal.fire({
               title: 'Access Denied',
               text: 'Invoices are available on the Tycoon Plan.',
               icon: 'warning',
               confirmButtonText: 'Upgrade',
               showCancelButton: true
           }).then((r) => {
               if(r.isConfirmed) router.push('/payment');
               else router.push('/dashboard');
           });
       }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const handleCreate = async () => {
      const token = getToken();
      if (!token) return;
      
      if (!customerName) return Swal.fire('Error', 'Customer name required', 'error');
      const validItems = formItems.filter(i => i.name && i.qty > 0);
      if (validItems.length === 0) return Swal.fire('Error', 'Add at least one item', 'error');

      setCreating(true);
      try {
          await axios.post(`${API_URL}/invoices`, {
              customerName,
              description,
              items: validItems
          }, { headers: { Authorization: `Bearer ${token}` } });

          Swal.fire('Success', 'Invoice created successfully!', 'success');
          setIsCreateModalOpen(false);
          setCustomerName('');
          setDescription('');
          setFormItems([{ name: '', qty: 1, unitPrice: 0 }]);
          fetchInvoices();
      } catch (err: any) {
          Swal.fire('Error', err?.response?.data?.error || 'Failed to create invoice', 'error');
      } finally {
          setCreating(false);
      }
  };

  const handleViewPdf = async (id: string) => {
    const token = getToken();
    if (!token) return;

    // Ask for format
    const { value: format } = await Swal.fire({
      title: 'Invoice Format',
      input: 'radio',
      inputOptions: {
        A4: 'Standard (A4)',
        thermal: 'Thermal (80mm)'
      },
      inputValue: 'thermal',
      confirmButtonText: 'View PDF',
      showCancelButton: true,
      confirmButtonColor: '#0F766E',
    });

    if (!format) return;

    try {
        Swal.fire({
            title: 'Opening PDF...',
            text: 'Please wait',
            didOpen: () => Swal.showLoading(),
            allowOutsideClick: false
        });

        const res = await axios.get(`${API_URL}/invoices/${id}/pdf`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { format },
            responseType: 'blob'
        });
        
        const file = new Blob([res.data], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        
        Swal.close();
        window.open(fileURL, '_blank');
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(fileURL), 60000); 
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Failed to load PDF', 'error');
    }
  };

  const handleStatusUpdate = async (id: string, status: 'PAID' | 'CANCELLED') => {
      const token = getToken();
      if (!token) return;

      const action = status === 'PAID' ? 'Mark as Paid' : 'Cancel Invoice';
      
      const r = await Swal.fire({
          title: `${action}?`,
          text: status === 'PAID' 
             ? "This will record a Sale transaction and update your revenue." 
             : "This will invalidate this invoice.",
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: status === 'PAID' ? '#16a34a' : '#ef4444',
          confirmButtonText: `Yes, ${action}`
      });

      if (!r.isConfirmed) return;

      try {
          await axios.put(`${API_URL}/invoices/${id}`, { status }, { headers: { Authorization: `Bearer ${token}` } });
          Swal.fire('Updated', `Invoice marked as ${status}`, 'success');
          fetchInvoices();
      } catch (err: any) {
          Swal.fire('Error', err?.response?.data?.error || 'Failed to update', 'error');
      }
  };

  const handleDelete = async (id: string) => {
      const token = getToken();
      if (!token) return;

      const r = await Swal.fire({
          title: 'Delete Invoice?',
          text: 'This action cannot be undone.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'Yes, Delete'
      });

      if (!r.isConfirmed) return;

      try {
          await axios.delete(`${API_URL}/invoices/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          Swal.fire('Deleted', 'Invoice deleted.', 'success');
          fetchInvoices();
      } catch (err: any) {
           Swal.fire('Error', err?.response?.data?.error || 'Failed to delete', 'error');
      }
  };

  // Form Helpers
  const updateItem = (index: number, field: string, val: any) => {
      const newItems = [...formItems];
      (newItems[index] as any)[field] = val;
      setFormItems(newItems);
  };
  const addItem = () => setFormItems([...formItems, { name: '', qty: 1, unitPrice: 0 }]);
  const removeItem = (index: number) => setFormItems(formItems.filter((_, i) => i !== index));

  const totalEstimate = formItems.reduce((acc, i) => acc + (i.qty * i.unitPrice), 0);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900">
       {/* Mobile Overlay */}
       {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full overflow-x-hidden">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div className="flex items-center gap-3">
                <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-gray-600 md:hidden"><Menu /></button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
                    <p className="text-sm text-gray-500">Create and manage professional invoices.</p>
                </div>
            </div>
            <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
            >
                <Plus size={18} /> Create Invoice
            </button>
        </header>

        {/* Search */}
        <div className="mb-6 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text" 
                placeholder="Search by client or invoice #..." 
                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
        </div>

        {/* List */}
        {loading ? (
             <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div>
        ) : invoices.length === 0 ? (
             <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                 <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                     <FileText size={32} />
                 </div>
                 <h3 className="font-bold text-gray-900">No Invoices Yet</h3>
                 <p className="text-sm text-gray-500 mt-1">Create your first invoice to get started.</p>
             </div>
        ) : (
            <div className="grid grid-cols-1 gap-4">
                {invoices.map((inv) => (
                    <div key={inv._id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-start gap-4">
                             <div className={`p-3 rounded-xl ${
                                 inv.status === 'PAID' ? 'bg-green-50 text-green-600' : 
                                 inv.status === 'CANCELLED' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                             }`}>
                                 <FileText size={24} />
                             </div>
                             <div>
                                 <div className="flex items-center gap-2">
                                     <h3 className="font-bold text-gray-900">{inv.customerName}</h3>
                                     <span className="text-xs text-gray-400 font-mono">{inv.invoiceNumber}</span>
                                 </div>
                                 <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                     <span>{new Date(inv.dateIssued).toLocaleDateString()}</span>
                                     <span>•</span>
                                     <span className="font-bold text-gray-900">₦{inv.totalAmount.toLocaleString()}</span>
                                 </div>
                             </div>
                        </div>

                        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                             {/* Status Badge */}
                             <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                 inv.status === 'PAID' ? 'bg-green-50 text-green-700 border-green-100' :
                                 inv.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-100' :
                                 'bg-blue-50 text-blue-700 border-blue-100'
                             }`}>
                                 {inv.status}
                             </span>

                             {/* Actions */}
                             <div className="flex items-center gap-1">
                                 <button 
                                    onClick={() => handleViewPdf(inv._id)}
                                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg hover:text-gray-900 transition-colors"
                                    title="View PDF"
                                 >
                                     <ExternalLink size={18} />
                                 </button>

                                 {inv.status === 'GENERATED' && (
                                     <>
                                        <button 
                                            onClick={() => handleStatusUpdate(inv._id, 'PAID')}
                                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                            title="Mark Paid"
                                        >
                                            <CheckCircle2 size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleStatusUpdate(inv._id, 'CANCELLED')}
                                            className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                                            title="Cancel"
                                        >
                                            <XCircle size={18} />
                                        </button>
                                     </>
                                 )}

                                 <button 
                                     onClick={() => handleDelete(inv._id)}
                                     className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                                     title="Delete"
                                 >
                                     <Trash2 size={18} />
                                 </button>
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* Create Modal */}
        {isCreateModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-gray-900">New Invoice</h2>
                        <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full">
                            <XCircle size={24} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Customer Name</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-medium"
                                    placeholder="e.g. Dangote Refinery"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Description (Optional)</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-medium"
                                    placeholder="e.g. Supply of materials"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Items</label>
                            </div>
                            
                            <div className="space-y-3">
                                {formItems.map((item, idx) => (
                                    <div key={idx} className="flex gap-2 items-start">
                                        <div className="flex-1">
                                            <input 
                                                type="text" 
                                                placeholder="Item Name"
                                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                                                value={item.name}
                                                onChange={(e) => updateItem(idx, 'name', e.target.value)}
                                            />
                                        </div>
                                        <div className="w-20">
                                            <input 
                                                type="number" 
                                                placeholder="Qty"
                                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                                                value={item.qty}
                                                onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))}
                                            />
                                        </div>
                                        <div className="w-28">
                                            <input 
                                                type="number" 
                                                placeholder="Price"
                                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                                                value={item.unitPrice}
                                                onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                                            />
                                        </div>
                                        <button 
                                            onClick={() => removeItem(idx)}
                                            className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            
                            <button onClick={addItem} className="mt-3 text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                                <Plus size={16} /> Add Item
                            </button>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                             <div>
                                 <p className="text-xs text-gray-400 uppercase font-bold">Total Estimate</p>
                                 <p className="text-xl font-bold text-gray-900">₦{totalEstimate.toLocaleString()}</p>
                             </div>
                             <button 
                                 onClick={handleCreate}
                                 disabled={creating}
                                 className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-2"
                             >
                                 {creating ? <Loader2 className="animate-spin" /> : 'Generate Invoice'}
                             </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}
