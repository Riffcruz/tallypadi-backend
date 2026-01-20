'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Trash2, User, Calendar, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface Investor {
  _id: string;
  name?: string;
  phoneNumber: string;
  email?: string;
  lastLogin?: string;
  createdAt: string;
}

export default function InvestorsTab({ adminToken }: { adminToken: string }) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchInvestors();
  }, []);

  const fetchInvestors = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/investors`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      setInvestors(res.data);
    } catch (error) {
      console.error('Error fetching investors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const result = await Swal.fire({
      title: 'Delete Investor?',
      text: `Are you sure you want to delete ${name || 'this investor'}? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#334155',
      confirmButtonText: 'Yes, delete it!',
    });

    if (result.isConfirmed) {
      setDeletingId(id);
      try {
        await axios.delete(`${API_URL}/admin/investors/${id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        setInvestors((prev) => prev.filter((inv) => inv._id !== id));
        Swal.fire('Deleted!', 'Investor has been deleted.', 'success');
      } catch (error) {
        console.error('Error deleting investor:', error);
        Swal.fire('Error', 'Failed to delete investor.', 'error');
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 font-medium uppercase text-xs">
              <tr>
                <th className="px-6 py-4">Investor</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Last Login</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {investors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                    No investors found.
                  </td>
                </tr>
              ) : (
                investors.map((inv) => (
                  <tr key={inv._id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                          <User size={16} />
                        </div>
                        <div>
                          <p className="font-extrabold text-white">{inv.name || 'Unnamed Investor'}</p>
                          <p className="text-xs text-slate-500">
                            Joined {new Date(inv.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-white font-mono">{inv.phoneNumber}</span>
                        {inv.email && <span className="text-xs text-slate-500">{inv.email}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {inv.lastLogin ? (
                        <div className="flex items-center gap-2 text-slate-300">
                          <Calendar size={14} className="text-slate-500" />
                          {new Date(inv.lastLogin).toLocaleString()}
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">Never</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(inv._id, inv.name || '')}
                        disabled={deletingId === inv._id}
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete Investor"
                      >
                        {deletingId === inv._id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
