'use client';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, FileDown, Loader2 } from 'lucide-react';
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
  }, []); // Initial load

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(user?.locale || 'en-NG', {
      style: 'currency', currency: user?.currencyCode || 'NGN'
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-lg font-bold text-gray-800">Transaction History</h2>
        
        <div className="flex gap-2">
          <input 
            type="date" 
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={dates.start}
            onChange={(e) => setDates({ ...dates, start: e.target.value })}
          />
          <input 
            type="date" 
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={dates.end}
            onChange={(e) => setDates({ ...dates, end: e.target.value })}
          />
          <button 
            onClick={fetchHistory}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold"
          >
            Filter
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={3} className="text-center py-8"><Loader2 className="animate-spin w-6 h-6 mx-auto"/></td></tr>
            ) : history.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-8 text-gray-400">No transactions found.</td></tr>
            ) : (
              history.map((sale: any) => (
                <tr key={sale.id || sale._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-bold text-gray-900">
                      {new Date(sale.date || sale.timestamp).toLocaleDateString(user?.locale)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(sale.date || sale.timestamp).toLocaleTimeString(user?.locale)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {sale.items.map((i: any, idx: number) => (
                      <div key={idx} className="capitalize text-gray-700">
                        {i.quantity}x {i.name}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600">
                    {formatMoney(sale.totalAmount || sale.totalMoney)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}