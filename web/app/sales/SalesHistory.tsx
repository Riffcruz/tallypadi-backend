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
  Package,
  Clock,
  ChevronRight
} from 'lucide-react';
import { UserProfile } from './page'; // Ensure this points to your types

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
      day: d.getDate(),
      fullDate: d.toLocaleDateString(user?.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(user?.locale, { hour: '2-digit', minute: '2-digit' })
    };
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* --- HEADER & CONTROLS --- */}
      <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
        
        {/* Title Section */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 tracking-tight">Transaction History</h2>
            <p className="text-sm text-gray-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {loading ? 'Syncing records...' : `${history.length} transactions found`}
            </p>
          </div>
        </div>

        {/* Date Filter Section */}
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-200 w-full sm:w-auto transition-colors focus-within:border-emerald-200 focus-within:bg-emerald-50/30">
            {/* Start Date */}
            <div className="relative flex-1 sm:w-40 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-gray-400 group-focus-within:text-emerald-600 transition-colors" />
              </div>
              <input 
                type="date" 
                className="w-full pl-9 pr-2 py-2 bg-transparent rounded-lg text-sm text-gray-700 font-medium outline-none"
                value={dates.start}
                onChange={(e) => setDates({ ...dates, start: e.target.value })}
              />
            </div>
            
            <ArrowRight className="w-4 h-4 text-gray-300 hidden sm:block" />
            
            {/* End Date */}
            <div className="relative flex-1 sm:w-40 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-gray-400 group-focus-within:text-emerald-600 transition-colors" />
              </div>
              <input 
                type="date" 
                className="w-full pl-9 pr-2 py-2 bg-transparent rounded-lg text-sm text-gray-700 font-medium outline-none"
                value={dates.end}
                onChange={(e) => setDates({ ...dates, end: e.target.value })}
              />
            </div>
          </div>

          <button 
            onClick={fetchHistory}
            disabled={loading}
            className="px-6 py-3 bg-gray-900 hover:bg-black text-white font-bold text-sm rounded-2xl shadow-lg shadow-gray-200 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Filter className="w-4 h-4" />}
            Filter
          </button>
        </div>
      </div>

      {/* --- TABLE CARD --- */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="py-4 px-6 text-xs font-extrabold text-gray-400 uppercase tracking-wider w-[25%]">Date Recorded</th>
                <th className="py-4 px-6 text-xs font-extrabold text-gray-400 uppercase tracking-wider w-[50%]">Items Sold</th>
                <th className="py-4 px-6 text-xs font-extrabold text-gray-400 uppercase tracking-wider text-right w-[25%]">Total Amount</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                // LOADING SKELETON
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-6"><div className="h-10 w-10 bg-gray-100 rounded-xl mb-1 inline-block mr-3 align-middle"></div><div className="h-4 bg-gray-100 rounded w-24 inline-block align-middle"></div></td>
                    <td className="px-6 py-6"><div className="h-6 bg-gray-100 rounded w-48 mb-2"></div><div className="h-6 bg-gray-50 rounded w-32"></div></td>
                    <td className="px-6 py-6 text-right"><div className="h-6 bg-gray-100 rounded w-24 ml-auto"></div></td>
                  </tr>
                ))
              ) : history.length === 0 ? (
                // EMPTY STATE
                <tr>
                  <td colSpan={3}>
                    <div className="py-24 flex flex-col items-center justify-center text-center">
                      <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                        <Search className="w-10 h-10 text-gray-300" />
                      </div>
                      <h3 className="text-gray-900 font-extrabold text-xl mb-1">No transactions found</h3>
                      <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">
                        We couldn't find any sales for this date range. Try selecting different dates above.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                // DATA ROWS
                history.map((sale: any) => {
                  const { day, fullDate, time } = formatDate(sale.date || sale.timestamp);
                  return (
                    <tr key={sale.id || sale._id} className="group hover:bg-slate-50 transition-colors duration-200">
                      
                      {/* DATE COLUMN */}
                      <td className="px-6 py-5 whitespace-nowrap align-top">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex flex-col items-center justify-center shrink-0 group-hover:scale-105 group-hover:shadow-md transition-all duration-300">
                            <span className="text-xs font-bold uppercase leading-none">{new Date(sale.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            <span className="text-lg font-black leading-none">{day}</span>
                          </div>
                          <div className="pt-0.5">
                            <p className="font-bold text-gray-900 text-sm">{fullDate}</p>
                            <p className="text-xs font-medium text-gray-400 group-hover:text-gray-500 transition-colors flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" /> {time}
                            </p>
                          </div>
                        </div>
                      </td>
                      
                      {/* ITEMS COLUMN */}
                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-wrap gap-2">
                          {sale.items.map((item: any, idx: number) => (
                            <div key={idx} className="inline-flex items-center pl-2 pr-3 py-1 rounded-lg bg-gray-50 text-gray-700 text-xs font-medium border border-gray-100 group-hover:border-gray-200 group-hover:bg-white transition-colors shadow-sm">
                              <span className="w-5 h-5 flex items-center justify-center bg-gray-200 text-gray-700 rounded text-[10px] font-bold mr-2">
                                {item.quantity}
                              </span>
                              <span className="capitalize">{item.name}</span>
                            </div>
                          ))}
                          {sale.items.length > 3 && (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-bold text-gray-400">
                              +{sale.items.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {/* AMOUNT COLUMN */}
                      <td className="px-6 py-5 text-right align-top">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-black text-gray-900 text-lg tracking-tight group-hover:text-emerald-700 transition-colors">
                            {formatMoney(sale.totalAmount || sale.totalMoney)}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-100/50">
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