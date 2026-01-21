'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import {
  Plus,
  Edit2,
  Check,
  X,
  Loader2,
  Menu,
  Search,
  Package,
  Lock,
  Sparkles,
  Save,
  XCircle,
  Upload,
  FileDown,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type InventoryItem = {
  id: string;
  name: string;
  stock: number;
  price: number;
  lastUnitPrice?: number;
  costPrice?: number;
  image?: string;
};

function currencyPrefix(code?: string) {
  const c = String(code || 'NGN').toUpperCase();
  const map: Record<string, string> = {
    NGN: '₦',
    USD: '$',
    GBP: '£',
    EUR: '€',
    GHS: '₵',
    KES: 'KSh',
    ZAR: 'R',
    INR: '₹',
    CAD: 'C$',
    AED: 'د.إ',
    JPY: '¥',
  };
  return map[c] || c;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [user, setUser] = useState<any>(null);

  // add item
  const [newItemName, setNewItemName] = useState('');
  const [newItemStock, setNewItemStock] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCostPrice, setNewItemCostPrice] = useState('');
  const [newItemImage, setNewItemImage] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ✅ POPUP EDIT (Modal)
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [editStock, setEditStock] = useState<number | string>('');
  const [editPrice, setEditPrice] = useState<number | string>('');
  const [editCostPrice, setEditCostPrice] = useState<number | string>('');
  const [editImage, setEditImage] = useState<string | null>(null);

  // ✅ Bulk Edit State
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkEdits, setBulkEdits] = useState<Record<string, number>>({});

  // ✅ File Input Ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // optional: mobile add modal (keeps the page clean)
  const [addOpen, setAddOpen] = useState(false);

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
    if (user.subscriptionStatus === 'trial') return Date.now() < trialEndsAtMs;
    return false;
  }, [user, trialEndsAtMs]);

  const trialDaysLeft = useMemo(() => {
    if (!user || user.subscriptionStatus !== 'trial') return null;
    const diff = trialEndsAtMs - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [user, trialEndsAtMs]);

  const currencyCode = String(user?.currencyCode || 'NGN').toUpperCase();
  const locale = String(user?.locale || 'en-NG');
  const prefix = currencyPrefix(currencyCode);

  const formatMoney = (n: any) => {
    const v = Number(n || 0);
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(v);
    } catch {
      // fallback
      return `${currencyCode} ${Number(v).toLocaleString()}`;
    }
  };

  const loadInventory = async () => {
    const token = getCookie('tallyToken');
    if (!token) return;
    try {
      const [invRes, userRes] = await Promise.all([
        axios.get(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const raw = Array.isArray(invRes.data) ? invRes.data : [];
      const normalized: InventoryItem[] = raw.map((x: any) => ({
        id: String(x.id || x._id || ''),
        name: String(x.name || '').trim(),
        stock: Number(x.stock ?? x.quantity ?? 0),
        price: Number(x.price ?? x.unitPrice ?? x.lastUnitPrice ?? 0),
        lastUnitPrice: x.lastUnitPrice !== undefined ? Number(x.lastUnitPrice) : undefined,
        costPrice: Number(x.costPrice ?? 0),
        image: x.image || null,
      }));

      setInventory(normalized.filter((i) => i.id && i.name));
      setUser(userRes.data.user);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getCookie('tallyToken');
    if (!token) {
      router.push('/login');
      return;
    }

    loadInventory();
  }, [router]);

  // Filter items based on search
  const filteredInventory = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((item) => String(item.name || '').toLowerCase().includes(q));
  }, [inventory, searchTerm]);

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

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }

    if (!newItemName || !newItemStock || !newItemPrice) return;

    const token = getCookie('tallyToken');
    const newItem = {
      name: newItemName,
      stock: parseInt(newItemStock, 10),
      price: parseFloat(newItemPrice),
      costPrice: parseFloat(newItemCostPrice) || 0,
      image: newItemImage,
    };

    try {
      await axios.post(`${API_URL}/inventory`, newItem, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await axios.get(`${API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = Array.isArray(res.data) ? res.data : [];
      const normalized: InventoryItem[] = raw.map((x: any) => ({
        id: String(x.id || x._id || ''),
        name: String(x.name || '').trim(),
        stock: Number(x.stock ?? x.quantity ?? 0),
        price: Number(x.price ?? x.unitPrice ?? x.lastUnitPrice ?? 0),
        lastUnitPrice: x.lastUnitPrice !== undefined ? Number(x.lastUnitPrice) : undefined,
        costPrice: Number(x.costPrice ?? 0),
        image: x.image || null,
      }));

      setInventory(normalized.filter((i) => i.id && i.name));

      setNewItemName('');
      setNewItemStock('');
      setNewItemPrice('');
      setNewItemCostPrice('');
      setNewItemImage(null);
      setAddOpen(false);

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Added',
        text: `${newItem.name} added to inventory.`,
        showConfirmButton: false,
        timer: 1800,
        timerProgressBar: true,
      });
    } catch (err) {
      console.error('Failed to add item:', err);
      Swal.fire({
        title: 'Error',
        text: 'Could not add item.',
        icon: 'error',
        confirmButtonColor: '#d33',
      });
    }
  };

  const startEditing = (item: InventoryItem) => {
    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }

    setEditingId(item.id);
    setEditingName(item.name);
    setEditStock(item.stock);
    setEditPrice(item.price || item.lastUnitPrice || 0);
    setEditCostPrice(item.costPrice || 0);
    setEditImage(item.image || null);
    setEditOpen(true);
  };

  const cancelEditing = () => {
    setEditOpen(false);
    setEditingId(null);
    setEditingName('');
    setEditStock('');
    setEditPrice('');
    setEditCostPrice('');
    setEditImage(null);
  };

  const saveEdit = async (id: string) => {
    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }

    const token = getCookie('tallyToken');
    try {
      if (!id) return;

      await axios.put(
        `${API_URL}/inventory/${id}`,
        {
          stock: Number(editStock),
          price: Number(editPrice),
          costPrice: Number(editCostPrice),
          image: editImage,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );

      setInventory((prev) =>
        prev.map((item) => 
          item.id === id ? { ...item, stock: Number(editStock), price: Number(editPrice), costPrice: Number(editCostPrice), image: editImage || item.image } : item
        )
      );

      setEditOpen(false);
      setEditingId(null);

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Updated',
        text: 'Item saved.',
        showConfirmButton: false,
        timer: 1400,
        timerProgressBar: true,
      });
    } catch (err: any) {
      console.error('Update failed', err);
      Swal.fire('Error', 'Failed to update item.', 'error');
    }
  };

  // ✅ Bulk Edit Handlers
  const toggleBulkMode = () => {
    if (isBulkMode) {
      setIsBulkMode(false);
      setBulkEdits({});
    } else {
      const init: Record<string, number> = {};
      inventory.forEach((i) => {
        if (i.costPrice) init[i.id] = i.costPrice;
      });
      setBulkEdits(init);
      setIsBulkMode(true);
    }
  };

  const handleBulkChange = (id: string, val: string) => {
    setBulkEdits((prev) => ({ ...prev, [id]: parseFloat(val) }));
  };

  const saveBulkChanges = async () => {
    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }

    setLoading(true);
    try {
      const updates = Object.entries(bulkEdits).map(([id, cost]) => ({
        id,
        costPrice: cost,
      }));

      const token = getCookie('tallyToken');
      await axios.post(`${API_URL}/inventory/bulk`, { updates }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Update local state
      setInventory((prev) =>
        prev.map((item) => (bulkEdits[item.id] !== undefined ? { ...item, costPrice: bulkEdits[item.id] } : item))
      );

      setIsBulkMode(false);
      setBulkEdits({});
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Saved', text: 'Costs updated.', showConfirmButton: false, timer: 1500 });
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to update costs', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Import Logic
  const handleImportClick = () => {
    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }
    fileInputRef.current?.click();
  };

  const processCSV = (str: string) => {
    const rows = str.split(/\r?\n/);
    if (rows.length < 2) return [];
    
    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('item'));
    const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('qty') || h.includes('quantity'));
    const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('selling'));
    const costIdx = headers.findIndex(h => h.includes('cost'));

    if (nameIdx === -1) throw new Error("CSV must have a 'Name' column");

    const items = [];
    for(let i=1; i<rows.length; i++) {
        // Handle commas in quotes roughly
        const row = rows[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || rows[i].split(',');
        if(row.length < 1) continue;
        
        const cleanCell = (val: string) => val ? val.replace(/^"|"$/g, '').trim() : '';

        const name = cleanCell(row[nameIdx]);
        if(!name) continue;

        items.push({
            name,
            stock: stockIdx > -1 ? parseFloat(cleanCell(row[stockIdx])) : 0,
            price: priceIdx > -1 ? parseFloat(cleanCell(row[priceIdx])) : 0,
            costPrice: costIdx > -1 ? parseFloat(cleanCell(row[costIdx])) : 0,
        });
    }
    return items;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(!file) return;
      e.target.value = ''; // reset

      if(!file.name.endsWith('.csv')) {
          Swal.fire('Format Error', 'Please upload a CSV file.', 'error');
          return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const text = evt.target?.result as string;
              const items = processCSV(text);
              
              if(items.length === 0) {
                  Swal.fire('Empty', 'No valid items found in CSV. Check headers: Name, Stock, Price, Cost', 'warning');
                  return;
              }

              setLoading(true);
              const token = getCookie('tallyToken');
              await axios.post(`${API_URL}/inventory/import`, { items }, { headers: { Authorization: `Bearer ${token}` } });
              
              await loadInventory();
              Swal.fire('Success', `Imported ${items.length} items successfully.`, 'success');
          } catch(err: any) {
              Swal.fire('Import Failed', err.message || 'Could not process file', 'error');
          } finally {
              setLoading(false);
          }
      };
      reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const csvContent = "Name,Stock,Price,Cost\nRice (50kg),50,45000,40000\nCoke (50cl),100,250,200";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getImageUrl = (path?: string) => {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    const baseUrl = API_URL.replace(/\/api\/?$/, '');
    return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string | null) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      Swal.fire('File too large', 'Image must be under 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const res = evt.target?.result as string;
      setter(res);
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
          <p className="text-slate-500 font-semibold animate-pulse">Loading Inventory...</p>
        </div>
      </div>
    );
  }

  const showLockUI = !hasFeatureAccess;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 relative overflow-x-hidden">
      {/* Ambient blobs */}
      <div className="fixed -top-24 -left-24 w-96 h-96 bg-emerald-200/35 rounded-full blur-[100px] pointer-events-none z-0" />
      <div className="fixed top-1/3 -right-24 w-96 h-96 bg-blue-200/25 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      <main className="relative z-10 flex-1 md:ml-64 p-4 md:p-8 min-h-screen w-full">
        {/* Header */}
        <header className="flex flex-col gap-4 md:gap-6 mb-6">
          <div className="flex items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 -ml-2 text-slate-700 bg-white rounded-xl border border-slate-200 shadow-sm md:hidden"
              >
                <Menu className="w-6 h-6" />
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight">Stocks</h1>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wide rounded-full">
                    <Sparkles className="w-3 h-3" /> Live
                  </span>
                </div>
                <p className="text-slate-500 text-sm font-semibold mt-1">
                  Fast edit with popup • Currency: <span className="text-slate-700">{currencyCode}</span>
                </p>
              </div>
            </div>

            {/* ✅ Bulk Edit Button */}
            <div className="hidden md:block">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".csv"
              />
              {isBulkMode ? (
                <div className="flex items-center gap-2">
                  <button onClick={toggleBulkMode} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs flex items-center gap-2 hover:bg-slate-200">
                    <XCircle className="w-4 h-4" /> Cancel
                  </button>
                  <button onClick={saveBulkChanges} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-200">
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImportClick}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition flex items-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5" /> Import CSV
                  </button>
                  <button
                    onClick={downloadTemplate}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition flex items-center gap-2"
                  >
                    <FileDown className="w-3.5 h-3.5" /> Template
                  </button>
                  <button
                    onClick={toggleBulkMode}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
                  >
                    Bulk Edit Costs
                  </button>
                </div>
              )}
              </div>

            {/* Status */}
            {user ? (
              hasFeatureAccess ? (
                <div className="hidden md:flex bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-2 rounded-2xl text-xs font-extrabold items-center gap-2">
                  <Check size={14} />
                  {user.subscriptionStatus === 'trial' ? (
                    <>
                      Trial Active
                      {typeof trialDaysLeft === 'number' ? (
                        <span className="text-emerald-700/80 font-bold">
                          • {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>Subscription Active</>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => router.push('/payment')}
                  className="hidden md:flex bg-rose-50 border border-rose-100 text-rose-700 px-4 py-2 rounded-2xl text-xs font-extrabold items-center gap-2 cursor-pointer hover:bg-rose-100 transition"
                >
                  <Lock size={14} /> Locked
                </div>
              )
            ) : null}
          </div>

          {/* Sticky Mobile Search + Buttons */}
          <div className="sticky top-3 z-20">
            <div className="bg-white/85 backdrop-blur-xl border border-slate-200 rounded-3xl p-3 shadow-sm flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search items…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500"
                />
              </div>

              <button
                onClick={() => {
                  if (!hasFeatureAccess) return showLockedModal();
                  setAddOpen(true);
                }}
                className={`shrink-0 px-4 py-3 rounded-2xl font-extrabold text-sm inline-flex items-center gap-2 transition active:scale-[0.98] ${
                  showLockUI
                    ? 'bg-slate-100 text-slate-400 border border-slate-200'
                    : 'bg-slate-900 hover:bg-black text-white'
                }`}
                title={showLockUI ? 'Upgrade to add items' : 'Add item'}
              >
                {showLockUI ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span className="hidden sm:inline">Add</span>
              </button>
            </div>
          </div>
        </header>

        {/* Desktop: Add form + stats */}
        <div className="hidden lg:grid grid-cols-3 gap-6 mb-8">
          <div className="col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                  showLockUI ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}
              >
                {showLockUI ? <Lock className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-black text-slate-900 leading-tight">{showLockUI ? 'Adding Locked' : 'Add New Item'}</p>
                <p className="text-xs text-slate-500 font-semibold">Create items quickly without leaving the page.</p>
              </div>
            </div>

            <form onSubmit={handleAddItem} className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12 md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">Item Name</label>
                <div className="flex gap-2">
                  <div className="relative w-10 h-10 shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelect(e, setNewItemImage)}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      disabled={showLockUI}
                    />
                    {newItemImage ? (
                      <img src={newItemImage} className="w-full h-full rounded-xl object-cover border border-slate-200" />
                    ) : (
                      <div className="w-full h-full rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                        <Upload size={14} />
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold"
                    placeholder="e.g. Rice"
                    required
                    disabled={showLockUI}
                  />
                </div>
              </div>

              <div className="col-span-6 md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">Quantity</label>
                <input
                  type="number"
                  value={newItemStock}
                  onChange={(e) => setNewItemStock(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold"
                  placeholder="0"
                  required
                  disabled={showLockUI}
                />
              </div>

              <div className="col-span-4 md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">Cost Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-extrabold">
                    {prefix}
                  </span>
                  <input
                    type="number"
                    value={newItemCostPrice}
                    onChange={(e) => setNewItemCostPrice(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold text-right"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="col-span-4 md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">Unit Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-extrabold">
                    {prefix}
                  </span>
                  <input
                    type="number"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold text-right"
                    placeholder="0"
                    required
                    disabled={showLockUI}
                  />
                </div>
              </div>

              <div className="col-span-12 flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={showLockUI}
                  className={`px-6 py-3 rounded-2xl font-extrabold text-sm shadow-lg transition active:scale-[0.98] inline-flex items-center gap-2 ${
                    showLockUI
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                  }`}
                >
                  {showLockUI ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  Add Item
                </button>

                {showLockUI ? (
                  <button
                    type="button"
                    onClick={showLockedModal}
                    className="text-sm font-extrabold text-emerald-700 hover:underline"
                  >
                    Upgrade to unlock
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total Items</p>
              <p className="text-4xl font-black text-slate-900 mt-2">{inventory.length}</p>
              <p className="text-xs text-slate-500 font-semibold mt-2">
                Tip: tap <span className="font-black">Edit</span> to update stock/price.
              </p>
            </div>

            {user ? (
              hasFeatureAccess ? (
                <div className="mt-6 bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-2xl text-xs font-extrabold inline-flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {user.subscriptionStatus === 'trial' ? (
                    <>
                      Trial Active
                      {typeof trialDaysLeft === 'number' ? (
                        <span className="text-emerald-700/80 font-bold">
                          • {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>Subscription Active</>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => router.push('/payment')}
                  className="mt-6 w-full bg-rose-50 border border-rose-100 text-rose-700 px-4 py-3 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-2 hover:bg-rose-100 transition"
                >
                  <Lock className="w-4 h-4" /> Locked — Subscribe
                </button>
              )
            ) : null}
          </div>
        </div>

        {/* Inventory List */}
        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider">Stock</th>
                  <th className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider">Cost</th>
                  <th className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider">Price</th>
                  <th className="px-6 py-4 text-right text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredInventory.map((item) => {
                  const low = Number(item.stock || 0) < 5;
                  const price = item.price || item.lastUnitPrice || 0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {item.image ? (
                            <img src={getImageUrl(item.image)} alt={item.name} className="w-10 h-10 rounded-2xl object-cover border border-slate-200 bg-white" />
                          ) : (
                            <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-black text-xs uppercase">
                              {String(item.name || 'I').slice(0, 2)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 capitalize truncate max-w-[360px]">{item.name}</p>
                            <p className="text-xs text-slate-500 font-semibold">ID: {String(item.id).slice(0, 10)}…</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-extrabold border ${
                            low ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}
                        >
                          {item.stock} units
                          {low ? <span className="text-[10px] font-black">LOW</span> : null}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {isBulkMode ? (
                          <div className="relative w-24">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-extrabold">{prefix}</span>
                            <input
                              type="number"
                              value={bulkEdits[item.id] ?? item.costPrice ?? ''}
                              onChange={(e) => handleBulkChange(item.id, e.target.value)}
                              className="w-full pl-5 pr-2 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-slate-500">{formatMoney(item.costPrice || 0)}</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-sm font-extrabold text-slate-900">{formatMoney(price)}</span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => startEditing(item)}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl font-extrabold text-xs border transition active:scale-[0.98] ${
                            showLockUI
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                          }`}
                          title={showLockUI ? 'Upgrade to edit' : 'Edit item'}
                          disabled={showLockUI}
                        >
                          {showLockUI ? <Lock className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredInventory.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="bg-slate-50 p-4 rounded-full mb-3 border border-slate-200">
                <Package className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm font-bold">No items found.</p>
              {searchTerm ? (
                <button onClick={() => setSearchTerm('')} className="text-emerald-700 text-xs mt-1 font-extrabold hover:underline">
                  Clear search
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Mobile Card List */}
        <div className="md:hidden space-y-3">
          {filteredInventory.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-3">
                <Package className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-black text-slate-900">No items found</p>
              <p className="text-sm text-slate-500 font-semibold mt-1">Try another search.</p>
              {searchTerm ? (
                <button onClick={() => setSearchTerm('')} className="mt-3 text-emerald-700 font-extrabold text-sm">
                  Clear search
                </button>
              ) : null}
            </div>
          ) : (
            filteredInventory.map((item) => {
              const low = Number(item.stock || 0) < 5;
              const price = item.price || item.lastUnitPrice || 0;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex items-start gap-3"
                >
                  <div className="w-12 h-12 rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 font-black text-xs uppercase shrink-0">
                    {String(item.name || 'I').slice(0, 2)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 capitalize truncate">{item.name}</p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold border ${
                          low ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}
                      >
                        Stock: {item.stock}
                      </span>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold border bg-slate-50 text-slate-700 border-slate-200">
                        {formatMoney(price)}
                      </span>
                      {low ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold border bg-rose-50 text-rose-700 border-rose-100">
                          Low stock
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <button
                    onClick={() => startEditing(item)}
                    disabled={showLockUI}
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 transition active:scale-[0.98] ${
                      showLockUI
                        ? 'bg-slate-100 border-slate-200 text-slate-400'
                        : 'bg-slate-900 border-slate-900 text-white hover:bg-black'
                    }`}
                    title={showLockUI ? 'Upgrade to edit' : 'Edit'}
                  >
                    {showLockUI ? <Lock className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Mobile “Locked” helper */}
        {showLockUI ? (
          <div className="md:hidden mt-6 bg-rose-50 border border-rose-100 text-rose-700 px-4 py-3 rounded-3xl text-xs font-extrabold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Inventory edit/add locked
            </div>
            <button
              onClick={showLockedModal}
              className="px-3 py-2 rounded-2xl bg-white border border-rose-200 text-rose-700 font-extrabold"
            >
              Unlock
            </button>
          </div>
        ) : null}
      </main>

      {/* ✅ ADD MODAL (Mobile friendly) */}
      {addOpen && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <p className="text-slate-900 font-black text-lg">Add Item</p>
                <p className="text-slate-500 text-sm font-semibold mt-1">Name, quantity, and price.</p>
              </div>
              <button
                className="w-10 h-10 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center"
                onClick={() => setAddOpen(false)}
              >
                <X className="w-4 h-4 text-slate-700" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-600 mb-1">Item Name</label>
                <div className="flex gap-2">
                   <div className="relative w-12 h-12 shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelect(e, setNewItemImage)}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    {newItemImage ? (
                      <img src={newItemImage} className="w-full h-full rounded-xl object-cover border border-slate-200" />
                    ) : (
                      <div className="w-full h-full rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                        <Upload size={16} />
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold"
                    placeholder="e.g. Indomie carton"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={newItemStock}
                    onChange={(e) => setNewItemStock(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-600 mb-1">Cost</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-extrabold">
                      {prefix}
                    </span>
                    <input
                      type="number"
                      value={newItemCostPrice}
                      onChange={(e) => setNewItemCostPrice(e.target.value)}
                      className="w-full pl-7 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold text-right"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-600 mb-1">Unit Price</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-extrabold">
                      {prefix}
                    </span>
                    <input
                      type="number"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold text-right"
                      placeholder="0"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="flex-1 py-3 rounded-2xl font-extrabold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl font-extrabold bg-slate-900 hover:bg-black text-white transition inline-flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✅ EDIT MODAL (Popup edit = no scrolling around the page) */}
      {editOpen && editingId && (
        <div className="fixed inset-0 z-[95] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={cancelEditing} />
          <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-slate-900 font-black text-lg truncate">Edit Item</p>
                <p className="text-slate-500 text-sm font-semibold mt-1 truncate">{editingName}</p>
              </div>
              <button
                className="w-10 h-10 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center"
                onClick={cancelEditing}
              >
                <X className="w-4 h-4 text-slate-700" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              
              <div className="flex justify-center mb-4">
                <div className="relative w-20 h-20">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageSelect(e, setEditImage)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  {editImage ? (
                    <img src={getImageUrl(editImage)} className="w-full h-full rounded-2xl object-cover border border-slate-200 shadow-sm" />
                  ) : (
                    <div className="w-full h-full rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                      <Upload size={24} />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 border border-slate-200 shadow-sm pointer-events-none">
                     <Edit2 size={12} className="text-slate-600"/>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-600 mb-1">Stock</label>
                  <input
                    type="number"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-600 mb-1">Cost</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-extrabold">
                      {prefix}
                    </span>
                    <input
                      type="number"
                      value={editCostPrice}
                      onChange={(e) => setEditCostPrice(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold text-right"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-600 mb-1">Unit Price</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-extrabold">
                      {prefix}
                    </span>
                    <input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold text-right"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-extrabold text-slate-600">Preview</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-black text-slate-900">New Price</span>
                  <span className="text-sm font-black text-slate-900">{formatMoney(editPrice)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">New Stock</span>
                  <span className="text-xs font-bold text-slate-700">{Number(editStock || 0)} units</span>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={cancelEditing}
                  className="flex-1 py-3 rounded-2xl font-extrabold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 transition inline-flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>

                <button
                  onClick={() => editingId && saveEdit(editingId)}
                  className="flex-1 py-3 rounded-2xl font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white transition inline-flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
