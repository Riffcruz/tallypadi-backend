'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import Preloader from '../../components/Preloader';
import { useRouter } from 'next/navigation';
import {
  Save,
  Loader2,
  Menu,
  Shield,
  Crown,
  Smartphone,
  Camera,
  Copy,
  ExternalLink,
  Check,
  Palette,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';
import { uploadToR2 } from '../../src/utils/uploadToR2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

const THEME_COLORS = [
  { label: 'Emerald',  hex: '#10b981' },
  { label: 'Purple',   hex: '#8b5cf6' },
  { label: 'Rose',     hex: '#f43f5e' },
  { label: 'Blue',     hex: '#3b82f6' },
  { label: 'Orange',   hex: '#f97316' },
  { label: 'Teal',     hex: '#14b8a6' },
  { label: 'Indigo',   hex: '#6366f1' },
  { label: 'Slate',    hex: '#475569' },
];

export default function OnlineStorePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  const [businessName, setBusinessName] = useState('');
  const [shopSlug, setShopSlug] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [uploadingHero, setUploadingHero] = useState(false);
  const [themeColor, setThemeColor] = useState('#10b981');

  const getTokenOrRedirect = () => {
    const token = getCookie('tallyToken');
    if (!token) router.push('/login');
    return token;
  };

  const isTycoon = String(user?.planType || '').toUpperCase() === 'TYCOON';

  const hydrateFromDashboard = (userData: any) => {
    setUser({ ...userData, planType: userData?.planType || 'OGA_BOSS' });
    setBusinessName(userData?.businessName || userData?.shopName || 'My Shop');
    setShopSlug(userData?.shopSlug || '');
    setShopDescription(userData?.shopDescription || '');
    setHeroImageUrl(userData?.heroImageUrl || '');
    setThemeColor(userData?.themeColor || '#10b981');
  };

  useEffect(() => {
    const token = getTokenOrRedirect();
    if (!token) return;
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
        hydrateFromDashboard(res.data?.user || {});
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getTokenOrRedirect();
    if (!token) return;
    setUploadingHero(true);
    try {
      const url = await uploadToR2(file, token);
      setHeroImageUrl(url);
    } catch (err) {
      Swal.fire('Error', 'Failed to upload image', 'error');
    } finally {
      setUploadingHero(false);
    }
  };

  const handleSaveShop = async () => {
    const token = getTokenOrRedirect();
    if (!token) return;
    setSaving(true);
    try {
      await axios.put(
        `${API_URL}/shop/me`,
        { shopSlug, businessName, shopDescription, heroImageUrl, themeColor },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Swal.fire({ title: 'Shop Updated', text: 'Your storefront settings have been saved.', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err?.response?.data?.error || 'Failed to update shop', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Preloader />;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-gray-900 relative">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-x-hidden min-h-screen w-full">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-gray-600 hover:bg-white hover:shadow-sm rounded-lg md:hidden transition-all">
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Online Store</h1>
              <p className="text-gray-500 text-sm mt-1">Manage your public storefront link and appearance</p>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 border shadow-sm ${isTycoon ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
            {isTycoon ? <Crown size={14} className="fill-purple-200" /> : <Shield size={14} />}
            {isTycoon ? 'TYCOON PLAN' : 'OGA BOSS PLAN'}
          </div>
        </header>

        <div className="max-w-4xl space-y-6 mx-auto md:mx-0">
          {isTycoon ? (
            <>
              {/* ── Storefront Card ── */}
              <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-pink-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-pink-50 rounded-xl text-pink-600"><Smartphone size={20} /></div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Online Storefront</h2>
                    <p className="text-xs text-gray-400">Manage your public product page</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Hero Image */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Shop Cover Image</label>
                    <div className="relative w-full h-40 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 overflow-hidden">
                      {heroImageUrl ? (
                        <img src={heroImageUrl} alt="Cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                          <div className="text-center"><Camera className="w-8 h-8 mx-auto mb-1 opacity-50" /><span className="text-xs font-bold">Upload Cover</span></div>
                        </div>
                      )}
                      <input type="file" accept="image/*" onChange={handleHeroUpload} disabled={uploadingHero} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                      {uploadingHero && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-20">
                          <Loader2 className="w-6 h-6 animate-spin text-pink-600" />
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">Recommended: 1200x400px. Appears at the top of your shop.</p>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Shop Description</label>
                    <textarea value={shopDescription} onChange={(e) => setShopDescription(e.target.value)} placeholder="Welcome to my shop! We sell the best quality items..." maxLength={500} rows={3}
                      className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-sm font-medium resize-none" />
                    <p className="text-[10px] text-gray-400 mt-1.5 text-right">{shopDescription.length}/500</p>
                  </div>

                  {/* Shop Link */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Shop Link</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center">
                        <span className="bg-slate-100 border border-r-0 border-gray-200 rounded-l-xl px-3 py-3 text-slate-500 text-sm font-medium hidden sm:block">tallypadi.com/shop/</span>
                        <input type="text" value={shopSlug} onChange={(e) => setShopSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="unique-shop-name"
                          className="flex-1 border border-gray-200 sm:rounded-l-none rounded-l-xl rounded-r-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-sm font-bold text-slate-700" />
                      </div>
                      {shopSlug && (
                        <>
                          <button onClick={() => { navigator.clipboard.writeText(`https://tallypadi.com/shop/${shopSlug}`); Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Copied!', showConfirmButton: false, timer: 1000 }); }}
                            className="p-3 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition" title="Copy Link">
                            <Copy size={18} />
                          </button>
                          <a href={`https://tallypadi.com/shop/${shopSlug}`} target="_blank" rel="noopener noreferrer" className="p-3 bg-pink-50 border border-pink-100 text-pink-600 rounded-xl hover:bg-pink-100 transition" title="Open Shop">
                            <ExternalLink size={18} />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Theme Color Card ── */}
              <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-purple-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-50 rounded-xl text-purple-600"><Palette size={20} /></div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Store Theme Color</h2>
                    <p className="text-xs text-gray-400">Pick an accent color for your public shop page (buttons, cart, highlights)</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                  {THEME_COLORS.map((color) => {
                    const isActive = themeColor === color.hex;
                    return (
                      <button
                        key={color.hex}
                        onClick={() => setThemeColor(color.hex)}
                        title={color.label}
                        className={`relative w-full aspect-square rounded-2xl transition-all duration-200 shadow-sm hover:scale-110 active:scale-95 ${isActive ? 'scale-110 shadow-xl' : ''}`}
                        style={{ backgroundColor: color.hex, outline: isActive ? `3px solid ${color.hex}` : 'none', outlineOffset: '3px' }}
                      >
                        {isActive && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Check size={18} className="text-white drop-shadow-lg" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Live preview */}
                <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1 py-3 px-5 rounded-xl text-white text-sm font-bold text-center shadow-lg transition-all duration-300" style={{ backgroundColor: themeColor }}>
                    Preview: Add to Cart Button
                  </div>
                  <div className="px-5 py-3 rounded-xl text-sm font-bold border-2 text-center transition-all duration-300" style={{ borderColor: themeColor, color: themeColor }}>
                    {THEME_COLORS.find(c => c.hex === themeColor)?.label || 'Custom'}
                  </div>
                </div>
              </div>

              {/* ── Save Button ── */}
              <div className="flex justify-end">
                <button onClick={handleSaveShop} disabled={saving}
                  className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-pink-600/20 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Shop Settings
                </button>
              </div>
            </>
          ) : (
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 text-white">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-white/10">
                    <Crown size={12} className="text-yellow-400" /><span className="text-yellow-100">PREMIUM FEATURE</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Upgrade to Tycoon</h2>
                  <p className="text-slate-300 text-sm max-w-md leading-relaxed">Create a beautiful online storefront, showcase your inventory to everyone, and allow customers to easily search and contact you.</p>
                </div>
                <div className="text-left md:text-right bg-white/10 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                  <span className="block text-3xl font-extrabold text-white">₦5,000</span>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Per Month</span>
                  <button onClick={() => router.push('/payment?plan=TYCOON')} className="mt-4 w-full bg-white text-slate-900 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors shadow-lg">Get Started</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
