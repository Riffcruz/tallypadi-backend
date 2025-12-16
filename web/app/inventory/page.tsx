'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { Plus, Edit2, Check, X, Loader2, Menu, Search, Package, Lock } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type InventoryItem = {
  id: string;
  name: string;
  stock: number;
  price: number;
  lastUnitPrice?: number;
};

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemStock, setNewItemStock] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState<number | string>('');
  const [editPrice, setEditPrice] = useState<number | string>('');

  const router = useRouter();

  // ✅ Helper: Parse trialEndsAt safely (it may come as ISO string)
  const trialEndsAtMs = useMemo(() => {
    if (!user?.trialEndsAt) return 0;
    const ms = new Date(user.trialEndsAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }, [user?.trialEndsAt]);

  // ✅ Helper: Is user allowed to use premium features?
  const hasFeatureAccess = useMemo(() => {
    if (!user) return false;
    if (user.subscriptionStatus === 'active') return true;

    // ✅ trial users can access until trialEndsAt expires
    if (user.subscriptionStatus === 'trial') {
      return Date.now() < trialEndsAtMs;
    }

    return false;
  }, [user, trialEndsAtMs]);

  const trialDaysLeft = useMemo(() => {
    if (!user || user.subscriptionStatus !== 'trial') return null;
    const diff = trialEndsAtMs - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [user, trialEndsAtMs]);

  useEffect(() => {
    const token = localStorage.getItem('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        const [invRes, userRes] = await Promise.all([
          axios.get(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        setInventory(invRes.data);
        setUser(userRes.data.user);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // Filter items based on search
  const filteredInventory = inventory.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const showLockedModal = () => {
    const isTrial = user?.subscriptionStatus === 'trial';
    const expiredTrial = isTrial && Date.now() >= trialEndsAtMs;

    Swal.fire({
      title: 'Subscription Required',
      text: expiredTrial
        ? 'Your 7-day free trial has expired. Subscribe to continue using this feature.'
        : 'You need an active subscription (or an active trial) to use this feature.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Subscribe Now',
      confirmButtonColor: '#16a34a',
      cancelButtonText: 'Close',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (result.isConfirmed) router.push('/payment');
    });
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Updated: allow active OR trial (not expired)
    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }

    if (!newItemName || !newItemStock || !newItemPrice) return;

    const token = localStorage.getItem('tallyToken');
    const newItem = {
      name: newItemName,
      stock: parseInt(newItemStock, 10),
      price: parseFloat(newItemPrice),
    };

    axios
      .post(`${API_URL}/inventory`, newItem, { headers: { Authorization: `Bearer ${token}` } })
      .then(() => axios.get(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } }))
      .then((res) => {
        setInventory(res.data);
        setNewItemName('');
        setNewItemStock('');
        setNewItemPrice('');
        Swal.fire({
          title: 'Added!',
          text: `${newItem.name} added to stock.`,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          confirmButtonColor: '#16a34a',
        });
      })
      .catch((err) => {
        console.error('Failed to add item:', err);
        Swal.fire({
          title: 'Error',
          text: 'Could not add item.',
          icon: 'error',
          confirmButtonColor: '#d33',
        });
      });
  };

  const startEditing = (item: InventoryItem) => {
    // ✅ Updated: lock editing too
    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }

    setEditingId(item.id);
    setEditStock(item.stock);
    setEditPrice(item.price || item.lastUnitPrice || 0);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditStock('');
    setEditPrice('');
  };

  const saveEdit = async (id: string) => {
    // ✅ Updated: lock saving too
    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }

    const token = localStorage.getItem('tallyToken');
    try {
      if (!id) return;

      await axios.put(
        `${API_URL}/inventory/${id}`,
        {
          stock: Number(editStock),
          price: Number(editPrice),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );

      setInventory(
        inventory.map((item) =>
          item.id === id ? { ...item, stock: Number(editStock), price: Number(editPrice) } : item
        )
      );
      setEditingId(null);

      Swal.fire({
        icon: 'success',
        title: 'Updated',
        showConfirmButton: false,
        timer: 1000,
      });
    } catch (err: any) {
      console.error('Update failed', err);
      Swal.fire('Error', 'Failed to update item.', 'error');
    }
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-green-600" />
          <p className="text-gray-500 font-medium animate-pulse">Loading Inventory...</p>
        </div>
      </div>
    );

  const showLockUI = !hasFeatureAccess;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-x-hidden min-h-screen w-full">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-gray-600 hover:bg-white hover:shadow-sm rounded-lg md:hidden transition-all"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                Inventory
              </h1>
              <p className="text-gray-500 text-sm mt-1">Manage your stock and prices</p>
            </div>
          </div>

          {/* ✅ Status Indicator */}
          {user && (
            <>
              {hasFeatureAccess ? (
                <div className="bg-green-50 border border-green-100 text-green-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                  {user.subscriptionStatus === 'trial' ? (
                    <>
                      <Check size={14} /> Trial Active
                      {typeof trialDaysLeft === 'number' && (
                        <span className="text-green-700/80 font-semibold">
                          • {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <Check size={14} /> Subscription Active
                    </>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => router.push('/payment')}
                  className="bg-red-50 border border-red-100 text-red-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-red-100 transition"
                >
                  <Lock size={14} /> Trial Expired / Subscription Inactive
                </div>
              )}
            </>
          )}
        </header>

        {/* Action Bar (Search + Add Form) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Add New Item Card */}
          <div
            className={`lg:col-span-2 bg-white p-5 rounded-2xl border shadow-sm transition-colors ${
              showLockUI ? 'border-red-100 opacity-90' : 'border-gray-100'
            }`}
          >
            <div className="flex items-center gap-2 mb-4 text-gray-800 font-semibold">
              <div className={`p-1.5 rounded-lg ${showLockUI ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                {showLockUI ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              {showLockUI ? 'Adding Locked' : 'Add New Item'}
            </div>

            <form onSubmit={handleAddItem} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="w-full sm:flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1 ml-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm"
                  placeholder="e.g. Bag of Rice"
                  required
                  disabled={showLockUI}
                />
              </div>

              <div className="w-full sm:w-28">
                <label className="block text-xs font-medium text-gray-500 mb-1 ml-1">
                  Quantity
                </label>
                <input
                  type="number"
                  value={newItemStock}
                  onChange={(e) => setNewItemStock(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm"
                  placeholder="0"
                  required
                  disabled={showLockUI}
                />
              </div>

              <div className="w-full sm:w-36">
                <label className="block text-xs font-medium text-gray-500 mb-1 ml-1">
                  Price (₦)
                </label>
                <input
                  type="number"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm"
                  placeholder="0.00"
                  required
                  disabled={showLockUI}
                />
              </div>

              <button
                type="submit"
                disabled={showLockUI}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-sm shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  showLockUI
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                    : 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20'
                }`}
              >
                {showLockUI && <Lock size={14} />} Add
              </button>
            </form>

            {showLockUI && (
              <button
                type="button"
                onClick={showLockedModal}
                className="mt-4 text-xs font-semibold text-green-700 hover:underline"
              >
                Upgrade to unlock
              </button>
            )}
          </div>

          {/* Stats / Search Card */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                Total Items
              </p>
              <h3 className="text-3xl font-extrabold text-gray-900">{inventory.length}</h3>
            </div>

            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Inventory List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Item Details
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Stock Level
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {filteredInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 font-bold text-xs shrink-0 uppercase">
                          {item.name.substring(0, 2)}
                        </div>
                        <span className="text-sm font-semibold text-gray-900 capitalize">
                          {item.name}
                        </span>
                      </div>
                    </td>

                    {/* Stock Column */}
                    <td className="px-6 py-4">
                      {editingId === item.id ? (
                        <input
                          type="number"
                          className="w-24 px-2 py-1.5 bg-white border border-green-500 rounded-lg outline-none focus:ring-2 focus:ring-green-200 text-sm font-medium"
                          value={editStock}
                          onChange={(e) => setEditStock(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              item.stock < 5
                                ? 'bg-red-50 text-red-700 border border-red-100'
                                : 'bg-green-50 text-green-700 border border-green-100'
                            }`}
                          >
                            {item.stock} units
                          </span>
                          {item.stock < 5 && (
                            <span className="text-[10px] text-red-500 font-medium animate-pulse">
                              Low Stock
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Price Column */}
                    <td className="px-6 py-4">
                      {editingId === item.id ? (
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                            ₦
                          </span>
                          <input
                            type="number"
                            className="w-28 pl-5 pr-2 py-1.5 bg-white border border-green-500 rounded-lg outline-none focus:ring-2 focus:ring-green-200 text-sm font-medium"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                          />
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-gray-600">
                          ₦{(item.price || item.lastUnitPrice || 0).toLocaleString()}
                        </span>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="px-6 py-4 text-right">
                      {editingId === item.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => saveEdit(item.id)}
                            className="text-white bg-green-600 hover:bg-green-700 p-1.5 rounded-lg transition-colors shadow-sm"
                            title="Save"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 p-1.5 rounded-lg transition-colors"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(item)}
                          className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-all"
                          title="Edit Item"
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredInventory.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="bg-gray-50 p-4 rounded-full mb-3">
                <Package className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm font-medium">No items found.</p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-green-600 text-xs mt-1 hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
