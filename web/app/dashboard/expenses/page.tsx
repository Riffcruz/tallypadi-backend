'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import Sidebar from '../../../components/Sidebar';
import {
  Banknote,
  Plus,
  Trash2,
  Calendar,
  Search,
  Filter,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Menu
} from 'lucide-react';
import { getCookie } from '../../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface Expense {
  _id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  timestamp: string;
}

interface ExpenseResponse {
  expenses: Expense[];
  total: number;
  totalPages: number;
}

export default function ExpensesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Form State
  const [newExpense, setNewExpense] = useState({
    amount: '',
    description: '',
    category: '',
    date: new Date().toISOString().split('T')[0]
  });

  const fetchCategories = async () => {
    const token = getCookie('tallyToken');
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/expenses/categories`, {
         headers: { Authorization: `Bearer ${token}` }
      });
      setCategories(res.data);
    } catch (error) {
      console.error('Failed to fetch categories', error);
    }
  };

  const fetchExpenses = async () => {
    const token = getCookie('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/expenses?page=${page}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExpenses(res.data.expenses);
      setTotal(res.data.total);
    } catch (error) {
      console.error('Failed to fetch expenses', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
  }, [page]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getCookie('tallyToken');
    if (!token) return;

    if (!newExpense.amount || !newExpense.description) return;

    try {
      setSubmitting(true);
      await axios.post(
        `${API_URL}/expenses`,
        {
          amount: parseFloat(newExpense.amount),
          description: newExpense.description,
          category: newExpense.category || 'General',
          date: newExpense.date
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setShowModal(false);
      setNewExpense({
        amount: '',
        description: '',
        category: '',
        date: new Date().toISOString().split('T')[0]
      });
      
      Swal.fire({
        title: 'Success!',
        text: 'Expense added successfully',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });

      fetchExpenses(); // Refresh list
      fetchCategories(); // Refresh categories in case a new one was added
    } catch (error) {
      console.error('Failed to add expense', error);
      Swal.fire({
        title: 'Error!',
        text: 'Failed to add expense. Please try again.',
        icon: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!'
    });

    if (!result.isConfirmed) return;
    
    const token = getCookie('tallyToken');
    if (!token) return;

    try {
      await axios.delete(`${API_URL}/expenses/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      Swal.fire(
        'Deleted!',
        'Your expense has been deleted.',
        'success'
      );
      
      fetchExpenses();
    } catch (error) {
      console.error('Failed to delete expense', error);
      Swal.fire({
        title: 'Error!',
        text: 'Failed to delete expense.',
        icon: 'error',
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-700 md:hidden"><Menu /></button>
            <div>
               <h1 className="text-3xl font-black tracking-tight text-slate-900">Expenses</h1>
               <p className="text-slate-500 font-medium mt-1">Track your spending and costs</p>
            </div>
          </div>
          
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Add Expense
          </button>
        </div>



        {/* Expenses Table */}
        <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
               <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-500" />
               <p className="font-bold text-sm uppercase tracking-widest">Loading expenses...</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-16 flex flex-col items-center justify-center text-center">
               <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                 <Banknote className="w-8 h-8 text-slate-300" />
               </div>
               <h3 className="text-lg font-black text-slate-900">No expenses found</h3>
               <p className="text-slate-500 mt-1 max-w-xs mx-auto">
                 Record your first expense to start tracking your business costs.
               </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 text-[11px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((expense) => (
                    <tr key={expense._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {expense.description}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wide">
                          {expense.category || 'General'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium text-sm">
                        {expense.date}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-900">
                        {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(expense.amount)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleDelete(expense._id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination (Simple) */}
          {expenses.length > 0 && (
            <div className="p-4 border-t border-slate-100 flex justify-center gap-2">
               <button 
                 disabled={page === 1}
                 onClick={() => setPage(p => Math.max(1, p - 1))}
                 className="px-4 py-2 text-sm font-bold text-slate-500 disabled:opacity-50 hover:bg-slate-50 rounded-lg"
               >
                 Previous
               </button>
               <span className="px-4 py-2 text-sm font-black text-slate-900 bg-slate-50 rounded-lg">
                 Page {page}
               </span>
               <button 
                  // If we retrieved less than limit (20), likely end of list
                 disabled={expenses.length < 20} 
                 onClick={() => setPage(p => p + 1)}
                 className="px-4 py-2 text-sm font-bold text-slate-500 disabled:opacity-50 hover:bg-slate-50 rounded-lg"
               >
                 Next
               </button>
            </div>
          )}
        </div>
      </main>

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100">
            <h2 className="text-2xl font-black text-slate-900 mb-6">Add New Expense</h2>
            
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Amount</label>
                <div className="relative">
                   <span className="absolute left-4 top-3.5 text-slate-400 font-bold">₦</span>
                   <input
                      type="number"
                      value={newExpense.amount}
                      onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-bold text-slate-900 transition-all"
                      placeholder="0.00"
                      required
                   />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>
                <input
                  type="text"
                  value={newExpense.description}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-medium text-slate-900 transition-all"
                  placeholder="e.g. Fuel for generator"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Category</label>
                  <input
                    type="text"
                    list="category-list"
                    value={newExpense.category}
                    onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-medium text-slate-900 transition-all"
                    placeholder="Select or type new..."
                  />
                  <datalist id="category-list">
                    {categories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Date</label>
                  <input
                    type="date"
                    value={newExpense.date}
                    onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-medium text-slate-900 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
