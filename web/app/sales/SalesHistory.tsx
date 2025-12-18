'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation'; // ✅ Added for redirect
import { 
  Calendar, 
  Loader2, 
  Search, 
  Filter, 
  ArrowRight, 
  Receipt, 
  TrendingUp, 
  Clock, 
  FileDown, 
  Lock,
  CalendarDays,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { UserProfile } from './page';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function SalesHistory({ user }: { user: UserProfile | null }) {
  const router = useRouter(); // ✅ Initialize Router
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dates, setDates] = useState({ start: '', end: '' });
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

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

  // ✅ UPDATED: PDF Download Logic with Redirect & Friendly Name
  const downloadPDF = async () => {
    if (user?.planType !== 'TYCOON') {
      Swal.fire({
        title: 'Upgrade Required',
        text: 'PDF Reports are available exclusively for Tycoon Plan users.',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Upgrade to Tycoon',
        confirmButtonColor: '#0F766E',
        cancelButtonText: 'Close',
        cancelButtonColor: '#64748b'
      }).then((result) => {
        if (result.isConfirmed) {
          router.push('/payment?plan=TYCOON'); // 🚀 Redirect to upgrade page
        }
      });
      return;
    }

    setPdfLoading(true);
    const token = localStorage.getItem('tallyToken');
    
    try {
      const params: any = {};
      if (dates.start) params.startDate = dates.start;
      if (dates.end) params.endDate = dates.end;

      const res = await axios.get(`${API_URL}/sales/report`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        responseType: 'blob', 
      });

      // Create friendly filename
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `TallyPadi_Sales_Report_${dateStr}.pdf`;

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName); // 📄 Set clear name
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      Swal.fire({
        toast: true,
        icon: 'success',
        title: 'Report Downloaded Successfully',
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });

    } catch (err) {
      console.error('PDF Download Error', err);
      Swal.fire({
        title: 'Download Failed',
        text: 'Could not generate the report. Please try again.',
        icon: 'error'
      });
    } finally {
      setPdfLoading(false);
    }
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
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      fullDate: d.toLocaleDateString(user?.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(user?.locale, { hour: '2-digit', minute: '2-digit' })
    };
  };

  const toggleRowExpansion = (saleId: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [saleId]: !prev[saleId]
    }));
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* --- HEADER & CONTROLS --- */}
      <div className="bg-white p-4 md:p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 md:gap-6">
        
        {/* Title Section */}
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
            <Receipt className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-black text-gray-900 tracking-tight">Transaction History</h2>
            <p className="text-xs md:text-sm text-gray-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {loading ? 'Syncing records...' : `${history.length} transactions found`}
            </p>
          </div>
        </div>

        {/* Controls Section */}
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-stretch sm:items-end">
          
          {/* Date Filter Card */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-1.5 border border-blue-100 shadow-sm flex-1 sm:flex-none">
            <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/80 backdrop-blur-sm rounded-xl p-2 border border-blue-50/50">
              
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg shadow-sm shrink-0">
                <CalendarDays className="w-4 h-4 text-white" />
              </div>
              
              <div className="flex flex-row items-center gap-2 w-full">
                <div className="relative w-full sm:w-32 group">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <Calendar className="h-3 w-3 text-blue-500" />
                  </div>
                  <input 
                    type="date" 
                    className="w-full pl-7 pr-1 py-1.5 bg-white/90 border border-blue-100 rounded-lg text-xs text-gray-800 font-bold outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
                    value={dates.start}
                    onChange={(e) => setDates({ ...dates, start: e.target.value })}
                    max={dates.end || today}
                  />
                </div>
                
                <ArrowRight className="w-3 h-3 text-blue-300 flex-shrink-0" />
                
                <div className="relative w-full sm:w-32 group">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <Calendar className="h-3 w-3 text-purple-500" />
                  </div>
                  <input 
                    type="date" 
                    className="w-full pl-7 pr-1 py-1.5 bg-white/90 border border-purple-100 rounded-lg text-xs text-gray-800 font-bold outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition-all"
                    value={dates.end}
                    onChange={(e) => setDates({ ...dates, end: e.target.value })}
                    min={dates.start}
                    max={today}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={fetchHistory}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-2xl shadow-lg shadow-gray-200 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Filter className="w-3 h-3" />}
              Filter
            </button>

            {/* ✅ DOWNLOAD BUTTON */}
            <button 
              onClick={downloadPDF}
              disabled={pdfLoading || loading}
              className={`flex-1 px-4 py-3 font-bold text-xs rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                user?.planType === 'TYCOON' 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-200'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
              title={user?.planType === 'TYCOON' ? "Download PDF Report" : "Upgrade to Tycoon to download PDF"}
            >
              {pdfLoading ? (
                <Loader2 className="w-3 h-3 animate-spin"/>
              ) : user?.planType === 'TYCOON' ? (
                <>
                  <FileDown className="w-3 h-3" />
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">PDF</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" />
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* --- DESKTOP TABLE --- */}
      <div className="hidden md:block bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-blue-50/30 border-b border-blue-100">
                <th className="py-4 px-6 text-xs font-extrabold text-blue-600 uppercase tracking-wider min-w-[120px]">Date Recorded</th>
                <th className="py-4 px-6 text-xs font-extrabold text-blue-600 uppercase tracking-wider min-w-[200px]">Items Sold</th>
                <th className="py-4 px-6 text-xs font-extrabold text-blue-600 uppercase tracking-wider text-right min-w-[100px]">Total Amount</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-blue-50/30">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-10 w-10 bg-gray-100 rounded-xl mb-1 inline-block mr-3 align-middle"></div>
                      <div className="h-4 bg-gray-100 rounded w-24 inline-block align-middle"></div>
                    </td>
                    <td className="px-6 py-4"><div className="h-6 bg-gray-100 rounded w-48"></div></td>
                    <td className="px-6 py-4 text-right"><div className="h-6 bg-gray-100 rounded w-24 ml-auto"></div></td>
                  </tr>
                ))
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <div className="py-24 flex flex-col items-center justify-center text-center">
                      <div className="w-20 h-20 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-full flex items-center justify-center mb-4 border border-blue-100 shadow-sm">
                        <Search className="w-10 h-10 text-blue-300" />
                      </div>
                      <h3 className="text-gray-900 font-extrabold text-xl mb-1">No transactions found</h3>
                      <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed mb-4">
                        {dates.start || dates.end 
                          ? "No transactions match your date range filter"
                          : "Start recording sales to see transaction history"
                        }
                      </p>
                      {dates.start || dates.end ? (
                        <button
                          onClick={() => {
                            setDates({ start: '', end: '' });
                            fetchHistory();
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all"
                        >
                          Clear Date Filter
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                history.map((sale: any) => {
                  const { day, fullDate, time, weekday } = formatDate(sale.date || sale.timestamp);
                  return (
                    <tr key={sale.id || sale._id} className="group hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-indigo-50/10 transition-all duration-200">
                      
                      {/* DATE COLUMN */}
                      <td className="px-6 py-5 whitespace-nowrap align-top">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white border border-blue-400 flex flex-col items-center justify-center shrink-0 group-hover:scale-105 group-hover:shadow-lg transition-all duration-300 shadow-sm">
                            <span className="text-xs font-bold uppercase leading-none">{weekday}</span>
                            <span className="text-lg font-black leading-none">{day}</span>
                          </div>
                          <div className="pt-0.5">
                            <p className="font-bold text-gray-900 text-sm">{fullDate}</p>
                            <p className="text-xs font-medium text-blue-500 group-hover:text-blue-600 transition-colors flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" /> {time}
                            </p>
                          </div>
                        </div>
                      </td>
                      
                      {/* ITEMS COLUMN */}
                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-wrap gap-2">
                          {sale.items.slice(0, 4).map((item: any, idx: number) => (
                            <div key={idx} className="inline-flex items-center pl-2 pr-3 py-1 rounded-lg bg-gradient-to-r from-blue-50 to-blue-50/50 text-blue-700 text-xs font-semibold border border-blue-100 group-hover:border-blue-200 group-hover:bg-white transition-all shadow-sm">
                              <span className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded text-[10px] font-bold mr-2">
                                {item.quantity}
                              </span>
                              <span className="capitalize truncate max-w-[120px]">{item.name}</span>
                            </div>
                          ))}
                          {sale.items.length > 4 && (
                            <span className="inline-flex items-center px-3 py-1 text-xs font-bold text-blue-500 bg-blue-50 rounded-full border border-blue-100">
                              +{sale.items.length - 4} more
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {/* AMOUNT COLUMN */}
                      <td className="px-6 py-5 text-right align-top">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-black text-gray-900 text-lg tracking-tight group-hover:text-blue-700 transition-colors">
                            {formatMoney(sale.totalAmount || sale.totalMoney)}
                          </span>
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-100/50 shadow-sm">
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

      {/* --- MOBILE CARD VIEW --- */}
      <div className="md:hidden space-y-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-blue-100 p-4 animate-pulse shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-24"></div>
                    <div className="h-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-16"></div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="h-5 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-20 ml-auto"></div>
                  <div className="h-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-16 ml-auto"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-full"></div>
                <div className="h-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded w-3/4"></div>
              </div>
            </div>
          ))
        ) : history.length === 0 ? (
          <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl border border-blue-100 p-8 flex flex-col items-center justify-center text-center shadow-sm">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-full flex items-center justify-center mb-4 border border-blue-100 shadow-sm">
              <Search className="w-8 h-8 text-blue-300" />
            </div>
            <h3 className="text-gray-900 font-extrabold text-lg mb-1">No transactions found</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              {dates.start || dates.end 
                ? "Try adjusting your date range"
                : "Record sales to see history here"
              }
            </p>
            {dates.start || dates.end ? (
              <button
                onClick={() => {
                  setDates({ start: '', end: '' });
                  fetchHistory();
                }}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all"
              >
                Clear Filter
              </button>
            ) : null}
          </div>
        ) : (
          history.map((sale: any) => {
            const { day, fullDate, time, weekday } = formatDate(sale.date || sale.timestamp);
            const isExpanded = expandedRows[sale.id || sale._id];
            
            return (
              <div key={sale.id || sale._id} className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm hover:shadow-md transition-shadow">
                {/* Header with Date and Amount */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white border border-blue-400 flex flex-col items-center justify-center shrink-0 shadow-sm">
                      <span className="text-xs font-bold uppercase leading-none">{weekday}</span>
                      <span className="text-base font-black leading-none">{day}</span>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{fullDate}</p>
                      <p className="text-xs font-medium text-blue-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {time}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-gray-900 text-lg block">
                      {formatMoney(sale.totalAmount || sale.totalMoney)}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-100">
                      Paid
                    </span>
                  </div>
                </div>

                {/* Items Preview */}
                <div className="mb-3">
                  <div className="flex flex-wrap gap-2">
                    {sale.items.slice(0, isExpanded ? sale.items.length : 3).map((item: any, idx: number) => (
                      <div key={idx} className="inline-flex items-center pl-2 pr-3 py-1 rounded-lg bg-gradient-to-r from-blue-50 to-blue-50/50 text-blue-700 text-xs font-medium border border-blue-100">
                        <span className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded text-[10px] font-bold mr-2">
                          {item.quantity}
                        </span>
                        <span className="capitalize truncate max-w-[100px]">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expand/Collapse Button */}
                {sale.items.length > 3 && (
                  <button
                    onClick={() => toggleRowExpansion(sale.id || sale._id)}
                    className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 w-full justify-center pt-2 border-t border-blue-100"
                  >
                    {isExpanded ? (
                      <>
                        Show Less <ChevronUp className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        Show {sale.items.length - 3} More Items <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}