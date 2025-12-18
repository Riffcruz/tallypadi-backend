'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Calendar, 
  Loader2, 
  Search, 
  Filter, 
  ArrowRight, 
  Receipt, 
  TrendingUp, 
  Package 
} from 'lucide-react';
import { UserProfile } from './page';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function SalesHistory({ user }: { user: UserProfile | null }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: '', end: '' });

  const fetchHistory = () => {
    setLoading(true);
    const token = localStorage.getItem('tallyToken');
    const params: any = {};
    if (dates.start) params.startDate = dates.start;
    if (dates.end) params.endDate = dates.end;

    axios.get(`${API_URL}/sales`, { headers: { Authorization: `Bearer ${token}` }, params })
      .then((res) => {
        setHistory(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('History Error', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency', 
      currency: user?.currencyCode || 'NGN',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return {
      date: d.toLocaleDateString(user?.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(user?.locale, { hour: '2-digit', minute: '2-digit' })
    };
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* --- CONTROL BAR --- */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Title & Total Count */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-gray-900">Transaction History</h2>
            <p className="text-xs text-gray-500 font-medium">
              {loading ? 'Syncing...' : `${history.length} records found`}
            </p>
          </div>
        </div>

        {/* Date Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto bg-gray-50/50 p-1.5 rounded-xl border border-gray-200/50">
          <div className="relative group flex-1 sm:flex-none">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Calendar className="h-4 w-4 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
            </div>
            <input 
              type="date" 
              className="pl-9 pr-3 py-2 w-full sm:w-36 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              value={dates.start}
              onChange={(e) => setDates({ ...dates, start: e.target.value })}
            />
          </div>
          
          <ArrowRight className="hidden sm:block w-4 h-4 text-gray-300" />
          
          <div className="relative group flex-1 sm:flex-none">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Calendar className="h-4 w-4 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
            </div>
            <input 
              type="date" 
              className="pl-9 pr-3 py-2 w-full sm:w-36 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              value={dates.end}
              onChange={(e) => setDates({ ...dates, end: e.target.value })}
            />
          </div>

          <button 
            onClick={fetchHistory}
            disabled={loading}
            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-bold rounded-lg shadow-lg shadow-gray-200 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Filter className="w-4 h-4" />}
            <span className="hidden sm:inline">Filter</span>
          </button>
        </div>
      </div>

      {/* --- TABLE CARD --- */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Date & Time</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Items Sold</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Total Amount</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                // Loading Skeleton
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-6"><div className="h-4 bg-gray-100 rounded w-24 mb-2"></div><div className="h-3 bg-gray-50 rounded w-16"></div></td>
                    <td className="px-6 py-6"><div className="h-4 bg-gray-100 rounded w-32"></div></td>
                    <td className="px-6 py-6 text-right"><div className="h-5 bg-gray-100 rounded w-20 ml-auto"></div></td>
                  </tr>
                ))
              ) : history.length === 0 ? (
                // Empty State
                <tr>
                  <td colSpan={3}>
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-gray-300" />
                      </div>
                      <h3 className="text-gray-900 font-bold text-lg mb-1">No transactions found</h3>
                      <p className="text-gray-500 text-sm max-w-xs mx-auto">
                        Try adjusting your date filters or record a new sale to see it appear here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                // Data Rows
                history.map((sale: any) => {
                  const { date, time } = formatDate(sale.date || sale.timestamp);
                  const itemCount = sale.items.reduce((acc: number, i: any) => acc + (i.quantity || 0), 0);
                  
                  return (
                    <tr key={sale.id || sale._id} className="group hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                            {new Date(sale.date || sale.timestamp).getDate()}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{date}</p>
                            <p className="text-xs font-medium text-gray-400 group-hover:text-gray-500 transition-colors">{time}</p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {sale.items.slice(0, 2).map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                              <span className="w-5 h-5 rounded flex items-center justify-center bg-gray-100 text-[10px] font-bold text-gray-500">
                                {item.quantity}
                              </span>
                              <span className="capitalize font-medium truncate max-w-[140px] sm:max-w-xs">
                                {item.name}
                              </span>
                            </div>
                          ))}
                          {sale.items.length > 2 && (
                            <span className="text-xs font-bold text-emerald-600 pl-7">
                              +{sale.items.length - 2} more items...
                            </span>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-extrabold text-gray-900 text-base tracking-tight">
                            {formatMoney(sale.totalAmount || sale.totalMoney)}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100">
                            <TrendingUp className="w-3 h-3" /> Paid
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}