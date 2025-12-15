'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
// Verify this path relative to your project structure. 
// If your file is at web/app/sales/page.tsx and sidebar is at web/components/Sidebar.tsx, this is correct.
import Sidebar from '../../components/Sidebar';
import { 
    Search, ShoppingCart, Plus, Minus, Trash2, 
    CheckCircle2, Loader2, AlertCircle, Menu, Smartphone,
    History, FileDown, Calendar, Receipt, Crown, Shield
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// --- Types ---

interface InventoryItem {
    id: string;
    name: string;
    stock: number;
    price: number;
}

interface CartItem extends InventoryItem {
    sellQty: number;
    sellPrice: number;
}

interface SaleRecord {
    id: string;
    date: string;
    totalAmount: number;
    items: { name: string; quantity: number; price: number }[];
}

interface UserProfile {
    id: string;
    planType: string; // 'OGA_BOSS' | 'TYCOON'
    shopName: string;
}

export default function SalesPage() {
    const router = useRouter();
    
    // --- State: General ---
    const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // --- State: New Sale ---
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);

    // --- State: History ---
    const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [historyLoading, setHistoryLoading] = useState(false);

    // --- Initial Load ---
    useEffect(() => {
        const token = localStorage.getItem('tallyToken');
        
        // 1. Try to load user from LocalStorage immediately (Fast UI)
        const savedUser = localStorage.getItem('tallyUser');
        if (savedUser) {
            try {
                const parsedUser = JSON.parse(savedUser);
                console.log("DEBUG: Loaded User from LocalStorage:", parsedUser);
                setUser(parsedUser);
            } catch (e) {
                console.error("Error parsing saved user", e);
            }
        }
        
        if (!token) {
            router.push('/login');
            return;
        }

        // 2. Fetch Inventory
        fetchInventory(token);

        // 3. Fetch FRESH User Data (Fix for stale LocalStorage)
        // We use the dashboard endpoint since it returns the user object, ensuring planType is up to date
        axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => {
                if (res.data.user) {
                    // DEBUGGING: Check the console to see exactly what the server returns
                    console.log("DEBUG: Fetched User Plan from API:", res.data.user.planType);
                    
                    setUser(res.data.user);
                    // Update local storage to keep it in sync for next time
                    localStorage.setItem('tallyUser', JSON.stringify(res.data.user));
                }
            })
            .catch(err => console.error("Failed to refresh user profile", err));
        
        // Set default date range (Current Month)
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const today = now.toISOString().split('T')[0];
        setDateRange({ start: firstDay, end: today });

    }, [router]);

    // --- Actions ---

    const fetchInventory = async (token: string) => {
        try {
            const res = await axios.get(`${API_URL}/inventory`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setInventory(res.data);
        } catch (err) {
            console.error('Failed to load inventory', err);
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        const token = localStorage.getItem('tallyToken');
        try {
            const res = await axios.get(`${API_URL}/sales`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { 
                    startDate: dateRange.start, 
                    endDate: dateRange.end 
                }
            });
            setSalesHistory(res.data);
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Trigger history fetch when tab changes to history
    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab]);

    const downloadPDF = async () => {
        // Double check against state (which is now fresh from API)
        if (user?.planType !== 'TYCOON') {
            setErrorMsg(`Plan is ${user?.planType || 'Unknown'}. Upgrade to TYCOON for PDF.`);
            setTimeout(() => setErrorMsg(''), 4000);
            return;
        }

        setLoading(true);
        const token = localStorage.getItem('tallyToken');
        try {
            const response = await axios.get(`${API_URL}/sales/report`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { format: 'pdf', startDate: dateRange.start, endDate: dateRange.end },
                responseType: 'blob', // Important for files
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Sales_Report_${dateRange.start}_${dateRange.end}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setSuccessMsg("Report downloaded!");
        } catch (err) {
            console.error("Download failed", err);
            setErrorMsg("Failed to generate PDF. Try again.");
        } finally {
            setLoading(false);
            setTimeout(() => setSuccessMsg(''), 3000);
        }
    };

    // --- Cart Logic ---

    const filteredItems = inventory.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const addToCart = (item: InventoryItem) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, sellQty: i.sellQty + 1 } : i);
            }
            return [...prev, { ...item, sellQty: 1, sellPrice: item.price || 0 }];
        });
        setSearchQuery('');
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const updateCartItem = (id: string, field: 'sellQty' | 'sellPrice', value: number) => {
        setCart(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const calculateTotal = () => cart.reduce((acc, item) => acc + (item.sellQty * item.sellPrice), 0);

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        setLoading(true);
        const token = localStorage.getItem('tallyToken');
        
        try {
            // Process Cart Items
            for (const item of cart) {
                await axios.post(`${API_URL}/sales`, {
                    itemId: item.id,
                    quantity: item.sellQty,
                    price: item.sellPrice,
                    date: new Date().toISOString()
                }, { headers: { Authorization: `Bearer ${token}` } });
            }

            setSuccessMsg('Sale recorded successfully!');
            setCart([]);
            fetchInventory(token!); // Update stock
        } catch (err) {
            setErrorMsg('Failed to record sale.');
        } finally {
            setLoading(false);
            setTimeout(() => setSuccessMsg(''), 3000);
        }
    };

    // --- Render ---

    return (
        <div className="flex min-h-screen bg-gray-50 font-sans text-gray-900 relative">
            
            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <Sidebar />
            </div>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-x-hidden min-h-screen w-full">
                
                {/* Header & Tabs */}
                <header className="mb-6">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-gray-600 bg-white shadow-sm border border-gray-100 rounded-lg md:hidden">
                                <Menu className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
                                <p className="text-sm text-gray-500 hidden sm:block">Manage transactions & history</p>
                            </div>
                        </div>

                        {/* 🟢 PLAN CHECKER BADGE */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                            user?.planType === 'TYCOON' 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                            {/* Show Crown if Tycoon, Shield if Oga Boss, or Loader if getting info */}
                            {!user ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : user.planType === 'TYCOON' ? (
                                <Crown className="w-3 h-3" />
                            ) : (
                                <Shield className="w-3 h-3" />
                            )}
                            <span>
                                {user ? (user.planType?.replace('_', ' ') || 'PLAN UNKNOWN') : 'Checking...'}
                            </span>
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex p-1 bg-gray-200/50 rounded-xl w-full max-w-md">
                        <button 
                            onClick={() => setActiveTab('new')}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeTab === 'new' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <ShoppingCart className="w-4 h-4" /> New Sale
                        </button>
                        <button 
                            onClick={() => setActiveTab('history')}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeTab === 'history' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <History className="w-4 h-4" /> Sales History
                        </button>
                    </div>
                </header>

                {/* Notifications */}
                {(errorMsg || successMsg) && (
                    <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 shadow-sm ${errorMsg ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                        {errorMsg ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        <p className="text-sm font-medium">{errorMsg || successMsg}</p>
                    </div>
                )}

                {/* VIEW: NEW SALE */}
                {activeTab === 'new' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Item Selector */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 sticky top-4 z-10">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input 
                                        type="text" 
                                        placeholder="Search inventory..." 
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {filteredItems.slice(0, 12).map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => addToCart(item)}
                                        className="bg-white p-4 rounded-xl border border-gray-200 hover:border-green-500 hover:shadow-md transition-all text-left group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center font-bold text-xs group-hover:bg-green-600 group-hover:text-white transition-colors">
                                                {item.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${item.stock > 0 ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-600'}`}>
                                                {item.stock} left
                                            </span>
                                        </div>
                                        <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                                        <p className="text-sm text-gray-500">₦{item.price?.toLocaleString() || '0'}</p>
                                    </button>
                                ))}
                                {filteredItems.length === 0 && (
                                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                                        <Search className="w-8 h-8 mb-2 opacity-50" />
                                        <p>No items found matching "{searchQuery}"</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Cart */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-8rem)] sticky top-4">
                                <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
                                    <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                        <ShoppingCart className="w-5 h-5 text-green-600" />
                                        Current Order
                                    </h2>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {cart.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2 opacity-60">
                                            <ShoppingCart className="w-12 h-12" />
                                            <p>Cart is empty</p>
                                        </div>
                                    ) : (
                                        cart.map((item) => (
                                            <div key={item.id} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-semibold text-gray-900">{item.name}</span>
                                                    <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="flex items-center bg-white rounded-lg border border-gray-200">
                                                        <button onClick={() => updateCartItem(item.id, 'sellQty', Math.max(1, item.sellQty - 1))} className="px-2 py-1 hover:bg-gray-100 text-gray-600"><Minus className="w-3 h-3" /></button>
                                                        <input type="number" className="w-10 text-center text-sm font-semibold outline-none" value={item.sellQty} onChange={(e) => updateCartItem(item.id, 'sellQty', parseInt(e.target.value) || 1)} />
                                                        <button onClick={() => updateCartItem(item.id, 'sellQty', item.sellQty + 1)} className="px-2 py-1 hover:bg-gray-100 text-gray-600"><Plus className="w-3 h-3" /></button>
                                                    </div>
                                                    <span className="text-gray-400 text-xs">x</span>
                                                    <div className="relative flex-1">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₦</span>
                                                        <input type="number" className="w-full pl-5 pr-2 py-1 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-green-500 outline-none" value={item.sellPrice} onChange={(e) => updateCartItem(item.id, 'sellPrice', parseInt(e.target.value) || 0)} />
                                                    </div>
                                                </div>
                                                <div className="text-right text-xs font-bold text-gray-600">
                                                    = ₦{(item.sellQty * item.sellPrice).toLocaleString()}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-gray-500 text-sm">Total</span>
                                        <span className="text-2xl font-extrabold text-gray-900">₦{calculateTotal().toLocaleString()}</span>
                                    </div>
                                    <button onClick={handleCheckout} disabled={loading || cart.length === 0} className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-600/20 active:scale-[0.98] transition-all disabled:opacity-50 flex justify-center items-center gap-2">
                                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <><CheckCircle2 className="w-5 h-5" /> Check Out</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW: SALES HISTORY */}
                {activeTab === 'history' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        {/* Filters Bar */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 justify-between items-center">
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <div className="relative flex-1 md:flex-none">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input 
                                        type="date" 
                                        className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm w-full md:w-40"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                                    />
                                </div>
                                <span className="text-gray-400">-</span>
                                <div className="relative flex-1 md:flex-none">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input 
                                        type="date" 
                                        className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm w-full md:w-40"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                                    />
                                </div>
                                <button 
                                    onClick={fetchHistory}
                                    className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-black transition-colors"
                                >
                                    Filter
                                </button>
                            </div>

                            <button 
                                onClick={downloadPDF}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all ${
                                    user?.planType === 'TYCOON' 
                                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20' 
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                                title={user?.planType !== 'TYCOON' ? "Upgrade to Tycoon to download" : "Download PDF Report"}
                            >
                                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <FileDown className="w-4 h-4" />}
                                {user?.planType === 'TYCOON' ? 'Download PDF' : 'PDF (Locked)'}
                            </button>
                        </div>

                        {/* Transactions List */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                        <tr>
                                            <th className="px-6 py-4">Date</th>
                                            <th className="px-6 py-4">Items Sold</th>
                                            <th className="px-6 py-4 text-right">Total Amount</th>
                                            <th className="px-6 py-4 text-center">Receipt</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {historyLoading ? (
                                            <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400"><Loader2 className="animate-spin w-6 h-6 mx-auto mb-2" />Loading history...</td></tr>
                                        ) : salesHistory.length === 0 ? (
                                            <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400">No sales found for this period.</td></tr>
                                        ) : (
                                            salesHistory.map((sale) => (
                                                <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                        {new Date(sale.date).toLocaleDateString()} <br/>
                                                        <span className="text-xs text-gray-400">{new Date(sale.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1">
                                                            {sale.items?.slice(0, 2).map((i, idx) => (
                                                                <span key={idx} className="text-gray-900 font-medium capitalize">
                                                                    {i.quantity}x {i.name}
                                                                </span>
                                                            ))}
                                                            {sale.items?.length > 2 && <span className="text-xs text-gray-400">+{sale.items.length - 2} more...</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                                                        ₦{sale.totalAmount.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button className="text-gray-400 hover:text-green-600 transition-colors">
                                                            <Receipt className="w-4 h-4 mx-auto" />
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
                )}
            </main>
        </div>
    );
}