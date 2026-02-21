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
  Filter,
  Trash2,
  ScanBarcode, // Import ScanBarcode
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import dynamic from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('../../components/BarcodeScanner'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type InventoryItem = {
  id: string;
  name: string;
  stock: number;
  price: number;
  lastUnitPrice?: number;
  costPrice?: number;
  image?: string;
  category?: string;
  barcode?: string;
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
  const [categories, setCategories] = useState<string[]>([]); // ✅ Categories list
  const [selectedCategory, setSelectedCategory] = useState<string>(''); // ✅ Filter
  const [user, setUser] = useState<any>(null);

  // add item
  const [newItemName, setNewItemName] = useState('');
  const [newItemStock, setNewItemStock] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCostPrice, setNewItemCostPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState(''); // ✅ New Item Category
  const [newItemBarcode, setNewItemBarcode] = useState(''); // ✅ New Item Barcode
  const [newItemImage, setNewItemImage] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false); // ✅ Scanner visibility
  const [scannerTarget, setScannerTarget] = useState<'search' | 'add' | 'edit'>('search'); // ✅ Scanner target
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUploadingImage, setIsLoadingImage] = useState(false); // New state for upload status

  // ✅ Dropdown states
  const [showAddCategoryDropdown, setShowAddCategoryDropdown] = useState(false);
  const [showEditCategoryDropdown, setShowEditCategoryDropdown] = useState(false);

  // ✅ POPUP EDIT (Modal)
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [editStock, setEditStock] = useState<number | string>('');
  const [editPrice, setEditPrice] = useState<number | string>('');
  const [editCostPrice, setEditCostPrice] = useState<number | string>('');
  const [editCategory, setEditCategory] = useState<string>(''); // ✅ Edit Category
  const [editBarcode, setEditBarcode] = useState<string>(''); // ✅ Edit Barcode
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
      const [invRes, userRes, catRes] = await Promise.all([
        axios.get(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/inventory/categories`, { headers: { Authorization: `Bearer ${token}` } }),
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
        category: x.category || '',
        barcode: x.barcode || '',
      }));

      setInventory(normalized.filter((i) => i.id && i.name));
      setUser(userRes.data.user);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);

      // ✅ Staff Permission Check
      const u = userRes.data.user;
      if (u.role === 'STAFF') {
         // Default is true, so only block if explicitly false
         const canManage = u.settings?.staffPermissions?.canManageInventory !== false;
         if (!canManage) {
            router.replace('/sales');
            return;
         }
      }
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

  // Filter items based on search and category
  const filteredInventory = useMemo(() => {
    let res = inventory;
    
    // Filter by Category
    if (selectedCategory) {
      res = res.filter((item) => item.category === selectedCategory);
    }

    const q = searchTerm.trim().toLowerCase();
    if (!q) return res;

    return res.filter((item) => String(item.name || '').toLowerCase().includes(q));
  }, [inventory, searchTerm, selectedCategory]);

  const handleScan = (code: string) => {
    setShowScanner(false);
    
    // Intelligent Routing based on active modal
    if (addOpen) {
      setNewItemBarcode(code);
    } else if (editOpen) {
      setEditBarcode(code);
    } else {
      setSearchTerm(code);
    }
  };

  useEffect(() => {
    // USB/Bluetooth Scanner Hardware Detection
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if user is manually typing in an input field and it's not a rapid scan
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

        const currentTime = Date.now();
        // Hardware scanners simulate keystrokes extremely fast (< 50ms)
        if (currentTime - lastKeyTime > 50) {
            buffer = '';
        }
        lastKeyTime = currentTime;

        if (e.key === 'Enter') {
            if (buffer.length > 2) {
                // If we detected a fast string ending in Enter, it's a scan
                e.preventDefault();
                console.log('USB Scanner Detected:', buffer);
                handleScan(buffer);
                buffer = '';
                
                // If it originated in an input, blur it so they don't accidentally type normally over it
                if (isInput) target.blur();
            }
        } else if (e.key.length === 1) {
            buffer += e.key;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addOpen, editOpen]); // Rebind when modal states change so handleScan routes correctly

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
      category: newItemCategory,
      barcode: newItemBarcode,
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
        category: x.category || '',
        barcode: x.barcode || '',
      }));

      setInventory(normalized.filter((i) => i.id && i.name));

      // Update categories if new
      if (newItemCategory && !categories.includes(newItemCategory.toLowerCase())) {
        setCategories(prev => [...prev, newItemCategory.toLowerCase()].sort());
      }

      setNewItemName('');
      setNewItemStock('');
      setNewItemPrice('');
      setNewItemCostPrice('');
      setNewItemCategory('');
      setNewItemBarcode('');
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

  const handleDelete = async (item: InventoryItem) => {
    if (!hasFeatureAccess) {
      showLockedModal();
      return;
    }

    const result = await Swal.fire({
      title: 'Delete Item?',
      text: `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#e5e7eb',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: '<span style="color:#374151">Cancel</span>',
    });

    if (!result.isConfirmed) return;

    const token = getCookie('tallyToken');
    try {
      await axios.delete(`${API_URL}/inventory/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setInventory((prev) => prev.filter((i) => i.id !== item.id));

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Deleted',
        text: 'Item removed.',
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
      });
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to delete item.', 'error');
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
    setEditCategory(item.category || '');
    setEditBarcode(item.barcode || '');
    setEditOpen(true);
  };

  const cancelEditing = () => {
    setEditOpen(false);
    setEditingId(null);
    setEditingName('');
    setEditStock('');
    setEditPrice('');
    setEditCostPrice('');
    setEditCategory('');
    setEditBarcode('');
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
          category: editCategory,
          barcode: editBarcode,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );

      setInventory((prev) =>
        prev.map((item) => 
          item.id === id ? { 
            ...item, 
            stock: Number(editStock), 
            price: Number(editPrice), 
            costPrice: Number(editCostPrice), 
            image: editImage || item.image,
            category: editCategory,
            barcode: editBarcode,
          } : item
        )
      );
      
      if (editCategory && !categories.includes(editCategory.toLowerCase())) {
        setCategories(prev => [...prev, editCategory.toLowerCase()].sort());
      }

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
    if (path.startsWith('http')) return path; // R2 public URL
    if (path.startsWith('data:')) return path; // Base64 image
    const baseUrl = API_URL.replace(/\/api\/?$/, '');
    return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`; // Local /uploads path
  };

  const handleImageSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string | null) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user) {
      Swal.fire('Error', 'User not authenticated', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      Swal.fire('File too large', 'Image must be under 5MB', 'error');
      return;
    }

    const token = getCookie('tallyToken');
    if (!token) {
      Swal.fire('Error', 'Authentication token missing.', 'error');
      return;
    }

    setIsLoadingImage(true);
    try {
      // Show local preview immediately using FileReader
      const reader = new FileReader();
      reader.onload = (evt) => {
        setter(evt.target?.result as string);
      };
      reader.readAsDataURL(file);
      
      // Upload to R2
      const publicUrl = await uploadToR2(file, token);
      setter(publicUrl); // Update state with the public URL
    } catch (error: any) {
      console.error('Image upload failed:', error);
      Swal.fire('Upload Error', error.message || 'Failed to upload image.', 'error');
      setter(null); // Clear image on error
    } finally {
      setIsLoadingImage(false);
      e.target.value = ''; // Clear file input
    }
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
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      <main className="relative z-10 flex-1 lg:ml-64 p-4 lg:p-8 min-h-screen w-full">
        {/* Header */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div className="flex items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 -ml-2 text-slate-700 bg-white rounded-xl border border-slate-200 shadow-sm lg:hidden"
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
              <div className="relative flex-1 flex items-center gap-2">
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
                    type="button"
                    onClick={() => {
                        setScannerTarget('search');
                        setShowScanner(true);
                    }}
                    className="p-3 bg-slate-100 rounded-2xl border border-slate-200 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                 >
                    <ScanBarcode className="w-5 h-5" />
                 </button>
              </div>

              {/* Category Filter */}
              <div className="hidden sm:block relative">
                 <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 max-w-[140px]"
                 >
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
                 <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 pointer-events-none" />
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
          <div className="col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
            
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-sm transition-colors ${
                  showLockUI ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                }`}
              >
                {showLockUI ? <Lock className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
              </div>
              <div>
                <p className="font-black text-xl text-slate-900 leading-tight">
                  {showLockUI ? 'Inventory Locked' : 'Add New Product'}
                </p>
                <p className="text-sm text-slate-500 font-medium">
                  {showLockUI ? 'Upgrade to manage stock' : 'Fill in the details below'}
                </p>
              </div>
            </div>

            <form onSubmit={handleAddItem} className="relative z-10">
              <div className="grid grid-cols-12 gap-6">
                {/* Left: Image Upload */}
                <div className="col-span-12 md:col-span-4 lg:col-span-3">
                   <div className="relative w-full aspect-square group/image cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelect(e, setNewItemImage)}
                      className="absolute inset-0 opacity-0 cursor-pointer z-20"
                      disabled={showLockUI || isUploadingImage}
                    />
                    
                    {newItemImage ? (
                      <div className="w-full h-full rounded-3xl overflow-hidden border-2 border-slate-200 shadow-sm relative">
                        <img 
                          src={newItemImage} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-105" 
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center">
                           <p className="text-white font-bold text-sm flex items-center gap-2">
                             <Edit2 className="w-4 h-4"/> Change
                           </p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-3xl bg-slate-50 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 group-hover/image:bg-slate-100 group-hover/image:border-emerald-400 group-hover/image:text-emerald-500 transition-all">
                        <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-3">
                           <Upload className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-black uppercase tracking-wide">Upload Image</span>
                        <span className="text-[10px] font-semibold mt-1 opacity-60">Tap to browse</span>
                      </div>
                    )}
                    
                    {isUploadingImage && (
                        <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm rounded-3xl flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                        </div>
                    )}
                  </div>
                </div>

                {/* Right: Inputs */}
                <div className="col-span-12 md:col-span-8 lg:col-span-9 space-y-5">
                   
                   {/* Name & Category Row */}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider ml-1">Product Name</label>
                        <input
                          type="text"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-base font-bold text-slate-900 placeholder:text-slate-400 transition-all"
                          placeholder="e.g. Nike Air Max"
                          required
                          disabled={showLockUI}
                        />
                      </div>

                      <div className="space-y-1.5 relative">
                        <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider ml-1">Category</label>
                        <div className="relative">
                           <input
                            type="text"
                            value={newItemCategory}
                            onChange={(e) => setNewItemCategory(e.target.value)}
                            onFocus={() => setShowAddCategoryDropdown(true)}
                            onBlur={() => setTimeout(() => setShowAddCategoryDropdown(false), 200)}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-base font-bold text-slate-900 placeholder:text-slate-400 transition-all"
                            placeholder="Select or type..."
                            disabled={showLockUI}
                          />
                          
                          {/* Custom Dropdown */}
                          {showAddCategoryDropdown && (
                             <ul className="absolute z-50 left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto py-2 animate-scale-in">
                                {categories
                                  .filter(c => c.toLowerCase().includes(newItemCategory.toLowerCase()))
                                  .map((c) => (
                                   <li
                                     key={c}
                                     onMouseDown={() => {
                                        setNewItemCategory(c);
                                        setShowAddCategoryDropdown(false);
                                     }}
                                     className="px-5 py-3 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold text-sm cursor-pointer transition-colors flex items-center justify-between"
                                   >
                                      {c}
                                      {newItemCategory.toLowerCase() === c.toLowerCase() && <Check className="w-4 h-4 text-emerald-600"/>}
                                   </li>
                                ))}
                                {newItemCategory && !categories.some(c => c.toLowerCase() === newItemCategory.toLowerCase()) && (
                                   <li className="px-5 py-3 text-emerald-600 font-bold text-sm bg-emerald-50/50 border-t border-slate-100 flex items-center gap-2">
                                      <Plus className="w-4 h-4" /> Create "{newItemCategory}"
                                   </li>
                                )}
                                {categories.length === 0 && !newItemCategory && (
                                   <li className="px-5 py-3 text-slate-400 text-xs font-semibold text-center">No categories yet</li>
                                )}
                             </ul>
                          )}

                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                             <Filter className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                   </div>

                   {/* Barcode Row */}
                   <div className="space-y-1.5 relative mb-5">
                      <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider ml-1">Barcode (Optional)</label>
                      <div className="relative flex items-center gap-2">
                        <input
                          type="text"
                          value={newItemBarcode}
                          onChange={(e) => setNewItemBarcode(e.target.value)}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-base font-bold text-slate-900 placeholder:text-slate-400 transition-all"
                          placeholder="Scan or type..."
                          disabled={showLockUI}
                        />
                        <button
                          type="button"
                          onClick={() => {
                              setScannerTarget('add');
                              setShowScanner(true);
                          }}
                          className="p-4 bg-slate-100 rounded-2xl border border-slate-200 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <ScanBarcode className="w-5 h-5" />
                        </button>
                      </div>
                   </div>

                   {/* Numbers Row */}
                   <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                         <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider ml-1">Stock</label>
                         <input
                          type="number"
                          value={newItemStock}
                          onChange={(e) => setNewItemStock(e.target.value)}
                          className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-bold text-slate-900 placeholder:text-slate-400"
                          placeholder="0"
                          required
                          disabled={showLockUI}
                        />
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider ml-1">Cost</label>
                         <div className="relative">
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">{prefix}</span>
                           <input
                            type="number"
                            value={newItemCostPrice}
                            onChange={(e) => setNewItemCostPrice(e.target.value)}
                            className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-bold text-slate-900 placeholder:text-slate-400 text-right"
                            placeholder="0"
                          />
                         </div>
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider ml-1">Selling Price</label>
                         <div className="relative">
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">{prefix}</span>
                           <input
                            type="number"
                            value={newItemPrice}
                            onChange={(e) => setNewItemPrice(e.target.value)}
                            className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-bold text-slate-900 placeholder:text-slate-400 text-right"
                            placeholder="0"
                            required
                            disabled={showLockUI}
                          />
                         </div>
                      </div>
                   </div>

                   {/* Action Button */}
                   <div className="pt-2">
                      <button
                        type="submit"
                        disabled={showLockUI || isUploadingImage}
                        className={`w-full py-4 rounded-2xl font-black text-sm shadow-xl shadow-emerald-200/50 transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${
                          showLockUI || isUploadingImage
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border border-slate-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-transparent'
                        }`}
                      >
                        {showLockUI ? <Lock className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        <span className="text-base">Add Product to Inventory</span>
                      </button>
                      
                      {showLockUI && (
                        <p className="text-center mt-3 text-xs font-bold text-emerald-700 cursor-pointer hover:underline" onClick={showLockedModal}>
                           Tap here to upgrade plan
                        </p>
                      )}
                   </div>

                </div>
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
                        <div className="flex items-center justify-end gap-2">
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

                          <button
                            onClick={() => handleDelete(item)}
                            disabled={showLockUI}
                            className={`p-2 rounded-2xl border transition active:scale-[0.98] ${
                                showLockUI 
                                ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' 
                                : 'bg-white text-rose-500 border-rose-100 hover:bg-rose-50 hover:border-rose-200'
                            }`}
                            title="Delete"
                          >
                             <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => startEditing(item)}
                      disabled={showLockUI}
                      className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 transition active:scale-[0.98] ${
                        showLockUI
                          ? 'bg-slate-100 border-slate-200 text-slate-400'
                          : 'bg-slate-900 border-slate-900 text-white hover:bg-black'
                      }`}
                      title={showLockUI ? 'Upgrade to edit' : 'Edit'}
                    >
                      {showLockUI ? <Lock className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                    </button>
                    
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={showLockUI}
                      className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 transition active:scale-[0.98] ${
                        showLockUI
                          ? 'bg-slate-100 border-slate-200 text-slate-300'
                          : 'bg-white border-rose-100 text-rose-500 hover:bg-rose-50'
                      }`}
                    >
                       <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setAddOpen(false)} />
          <div className="relative w-full md:max-w-lg bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-slide-in-from-bottom">
            
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Sparkles className="w-5 h-5" />
                 </div>
                 <div>
                    <p className="text-slate-900 font-black text-lg leading-tight">Add Product</p>
                    <p className="text-slate-500 text-xs font-bold">New Inventory Item</p>
                 </div>
              </div>
              <button
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform"
                onClick={() => setAddOpen(false)}
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-6">
               {/* Image Upload */}
               <div className="w-full aspect-[4/3] relative group rounded-3xl overflow-hidden border-2 border-dashed border-slate-300 bg-slate-50">
                  <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelect(e, setNewItemImage)}
                      className="absolute inset-0 opacity-0 z-20"
                      disabled={isUploadingImage}
                    />
                    
                    {newItemImage ? (
                      <>
                        <img src={newItemImage} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <span className="bg-white/90 px-4 py-2 rounded-xl text-xs font-black shadow-sm flex items-center gap-2">
                             <Edit2 className="w-3 h-3" /> Change Image
                           </span>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                         <div className="w-14 h-14 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 text-emerald-500">
                            <Upload className="w-6 h-6" />
                         </div>
                         <p className="text-sm font-black text-slate-600">Tap to upload image</p>
                         <p className="text-xs font-semibold opacity-60">Supports JPG, PNG</p>
                      </div>
                    )}

                    {isUploadingImage && (
                        <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                        </div>
                    )}
               </div>

               <form onSubmit={handleAddItem} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider ml-1">Product Name</label>
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-base font-bold text-slate-900 placeholder:text-slate-400"
                      placeholder="e.g. Nike Sneakers"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider ml-1">Category</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={newItemCategory}
                        onChange={(e) => setNewItemCategory(e.target.value)}
                        onFocus={() => setShowAddCategoryDropdown(true)}
                        onBlur={() => setTimeout(() => setShowAddCategoryDropdown(false), 200)}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-base font-bold text-slate-900 placeholder:text-slate-400"
                        placeholder="Select or type..."
                      />
                      
                      {/* Custom Dropdown Mobile */}
                      {showAddCategoryDropdown && (
                             <ul className="absolute z-50 left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto py-2 animate-scale-in">
                                {categories
                                  .filter(c => c.toLowerCase().includes(newItemCategory.toLowerCase()))
                                  .map((c) => (
                                   <li
                                     key={c}
                                     onMouseDown={() => {
                                        setNewItemCategory(c);
                                        setShowAddCategoryDropdown(false);
                                     }}
                                     className="px-5 py-3 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold text-sm cursor-pointer transition-colors flex items-center justify-between"
                                   >
                                      {c}
                                      {newItemCategory.toLowerCase() === c.toLowerCase() && <Check className="w-4 h-4 text-emerald-600"/>}
                                   </li>
                                ))}
                                {newItemCategory && !categories.some(c => c.toLowerCase() === newItemCategory.toLowerCase()) && (
                                   <li className="px-5 py-3 text-emerald-600 font-bold text-sm bg-emerald-50/50 border-t border-slate-100 flex items-center gap-2">
                                      <Plus className="w-4 h-4" /> Create "{newItemCategory}"
                                   </li>
                                )}
                                {categories.length === 0 && !newItemCategory && (
                                   <li className="px-5 py-3 text-slate-400 text-xs font-semibold text-center">No categories yet</li>
                                )}
                             </ul>
                      )}

                      <Filter className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider ml-1">Quantity</label>
                        <input
                          type="number"
                          value={newItemStock}
                          onChange={(e) => setNewItemStock(e.target.value)}
                          className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-bold text-slate-900 placeholder:text-slate-400"
                          placeholder="0"
                          required
                        />
                     </div>
                     
                     <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider ml-1">Cost Price</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">{prefix}</span>
                          <input
                            type="number"
                            value={newItemCostPrice}
                            onChange={(e) => setNewItemCostPrice(e.target.value)}
                            className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-bold text-slate-900 placeholder:text-slate-400 text-right"
                            placeholder="0"
                          />
                        </div>
                     </div>
                  </div>

                  <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider ml-1">Selling Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">{prefix}</span>
                        <input
                          type="number"
                          value={newItemPrice}
                          onChange={(e) => setNewItemPrice(e.target.value)}
                          className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-bold text-slate-900 placeholder:text-slate-400 text-right"
                          placeholder="0"
                          required
                        />
                      </div>
                  </div>

                  <div className="pt-4 pb-safe">
                    <button
                      type="submit"
                      disabled={isUploadingImage}
                      className="w-full py-4 rounded-2xl font-black text-base shadow-xl shadow-emerald-200/50 bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Add to Inventory
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setAddOpen(false)}
                      className="w-full py-3 mt-3 rounded-2xl font-bold text-sm text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
               </form>
            </div>
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
                <div className="relative w-24 h-24 group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageSelect(e, setEditImage)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    disabled={isUploadingImage}
                  />
                  {editImage ? (
                    <img src={getImageUrl(editImage)} className="w-full h-full rounded-2xl object-cover border border-slate-200 shadow-sm" />
                  ) : (
                    <div className="w-full h-full rounded-2xl bg-slate-50 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 group-hover:bg-slate-100 group-hover:border-emerald-400 transition-colors">
                      <Upload size={24} className="mb-1" />
                      <span className="text-[10px] font-bold uppercase">Upload</span>
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 border border-slate-200 shadow-sm pointer-events-none">
                     <Edit2 size={12} className="text-slate-600"/>
                  </div>
                </div>
              </div>

               <div className="mb-3 relative">
                  <label className="block text-xs font-extrabold text-slate-600 mb-1">Category (Optional)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      onFocus={() => setShowEditCategoryDropdown(true)}
                      onBlur={() => setTimeout(() => setShowEditCategoryDropdown(false), 200)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold"
                      placeholder="e.g. Drinks"
                    />
                    
                    {/* Custom Dropdown Edit */}
                    {showEditCategoryDropdown && (
                             <ul className="absolute z-50 left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto py-2 animate-scale-in">
                                {categories
                                  .filter(c => c.toLowerCase().includes(editCategory.toLowerCase()))
                                  .map((c) => (
                                   <li
                                     key={c}
                                     onMouseDown={() => {
                                        setEditCategory(c);
                                        setShowEditCategoryDropdown(false);
                                     }}
                                     className="px-5 py-3 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold text-sm cursor-pointer transition-colors flex items-center justify-between"
                                   >
                                      {c}
                                      {editCategory.toLowerCase() === c.toLowerCase() && <Check className="w-4 h-4 text-emerald-600"/>}
                                   </li>
                                ))}
                                {editCategory && !categories.some(c => c.toLowerCase() === editCategory.toLowerCase()) && (
                                   <li className="px-5 py-3 text-emerald-600 font-bold text-sm bg-emerald-50/50 border-t border-slate-100 flex items-center gap-2">
                                      <Plus className="w-4 h-4" /> Create "{editCategory}"
                                   </li>
                                )}
                                {categories.length === 0 && !editCategory && (
                                   <li className="px-5 py-3 text-slate-400 text-xs font-semibold text-center">No categories yet</li>
                                )}
                             </ul>
                    )}
                  </div>
               </div>

               <div className="mb-3 relative">
                  <label className="block text-xs font-extrabold text-slate-600 mb-1">Barcode (Optional)</label>
                  <div className="relative flex items-center gap-2">
                    <input
                      type="text"
                      value={editBarcode}
                      onChange={(e) => setEditBarcode(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm font-semibold"
                      placeholder="e.g. 123456789"
                    />
                    <button
                      type="button"
                      onClick={() => {
                          setScannerTarget('edit');
                          setShowScanner(true);
                      }}
                      className="p-3 bg-slate-100 rounded-2xl border border-slate-200 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                    >
                      <ScanBarcode className="w-4 h-4" />
                    </button>
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
                  disabled={isUploadingImage}
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

      {/* Barcode Scanner Overlay */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
