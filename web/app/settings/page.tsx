'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import { useRouter } from 'next/navigation';
import {
  Save,
  User,
  Clock,
  Languages,
  FileText,
  Crown,
  Loader2,
  Users,
  Plus,
  Trash2,
  X,
  Menu,
  Shield,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Lock,
  Camera,
  Copy,
  ExternalLink,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';
import { uploadToR2 } from '../../src/utils/uploadToR2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

interface StaffMember {
  id: string;
  phoneNumber: string;
  name?: string;
  dateAdded: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [shopSlug, setShopSlug] = useState(''); // New State
  const [shopDescription, setShopDescription] = useState(''); // ✅ Shop Desc
  const [heroImageUrl, setHeroImageUrl] = useState(''); // ✅ Hero Image
  const [uploadingHero, setUploadingHero] = useState(false); // ✅ Upload state

  const [closingTime, setClosingTime] = useState('');
  const [language, setLanguage] = useState('');
  const [pdfEnabled, setPdfEnabled] = useState(false);

  // Staff State
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);

  // New Staff Input State
  const [staffCountryCode, setStaffCountryCode] = useState('+234');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);

  const getTokenOrRedirect = () => {
    const token = getCookie('tallyToken');
    if (!token) router.push('/login');
    return token;
  };

  const isTycoon = String(user?.planType || '').toUpperCase() === 'TYCOON';

  // ✅ Helper: Parse trialEndsAt safely (it may come as ISO string)
  const trialEndsAtMs = useMemo(() => {
    if (!user?.trialEndsAt) return 0;
    const ms = new Date(user.trialEndsAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }, [user?.trialEndsAt]);

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

  const fetchStaff = async (token: string) => {
    try {
      const res = await axios.get(`${API_URL}/staff`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStaff(res.data);
    } catch (err) {
      console.error('Failed to load staff', err);
    }
  };

  const hydrateFromDashboard = (userData: any) => {
    // ✅ FIX: businessName must read from businessName first (not shopName)
    const bName = userData?.businessName || userData?.shopName || 'My Shop';

    setUser({
      ...userData,
      planType: userData?.planType || 'OGA_BOSS',
    });

    setBusinessName(bName);
    setShopSlug(userData?.shopSlug || '');
    setShopDescription(userData?.shopDescription || '');
    setHeroImageUrl(userData?.heroImageUrl || '');
    setClosingTime(userData?.settings?.closingTime || '20:00');
    setLanguage(userData?.settings?.language || 'English');

    // allow both names just in case
    setPdfEnabled(
      userData?.settings?.pdfReportsEnabled ??
        userData?.settings?.pdfEnabled ??
        false
    );
  };

  useEffect(() => {
    const token = getTokenOrRedirect();
    if (!token) return;

    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = res.data?.user || {};
        hydrateFromDashboard(userData);

        if (String(userData?.planType || '').toUpperCase() === 'TYCOON') {
          await fetchStaff(token);
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const showLockedModal = () => {
    const isTrial = user?.subscriptionStatus === 'trial';
    const expiredTrial = isTrial && Date.now() >= trialEndsAtMs;

    Swal.fire({
      title: 'Subscription Required',
      text: expiredTrial
        ? 'Your free trial has expired. Subscribe to continue.'
        : 'You need an active subscription (or active trial) to use this feature.',
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

  const handleSave = async () => {
    const token = getTokenOrRedirect();
    if (!token) return;

    setSaving(true);

    try {
      // ✅ Send BOTH keys to be compatible with older backend fields
      await axios.put(
        `${API_URL}/settings`,
        {
          businessName,
          shopName: businessName, // backward compatibility
          settings: {
            closingTime,
            language,
            pdfReportsEnabled: pdfEnabled,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // ✅ Re-fetch dashboard so UI ALWAYS reflects saved data
      const res = await axios.get(`${API_URL}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userData = res.data?.user || {};
      hydrateFromDashboard(userData);

      Swal.fire({
        title: 'Saved!',
        text: 'Your settings have been updated.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
        confirmButtonColor: '#16a34a',
      });
    } catch (err: any) {
      console.error('Save failed:', err?.response?.data || err);
      Swal.fire(
        'Error',
        err?.response?.data?.error || err?.response?.data?.message || 'Failed to save settings',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

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
       console.error(err);
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
        { 
          shopSlug, 
          businessName,
          shopDescription,
          heroImageUrl
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      Swal.fire({
        title: 'Shop Updated',
        text: 'Your storefront settings have been saved.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err: any) {
      console.error('Shop save failed', err);
      Swal.fire('Error', err?.response?.data?.error || 'Failed to update shop', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaffPhone) return;

    const token = getTokenOrRedirect();
    if (!token) return;

    setAddingStaff(true);

    try {
      // Format Number: Remove leading zero from local number, combine with code
      const cleanLocalNumber = newStaffPhone.replace(/^0+/, '');
      const cleanCode = staffCountryCode.replace('+', '');
      const formattedNumber = `${cleanCode}${cleanLocalNumber}`;

      await axios.post(
        `${API_URL}/staff`,
        { phoneNumber: formattedNumber, name: newStaffName },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Swal.fire({
        title: 'Invitation Sent!',
        text: `${newStaffName || formattedNumber} has been added as staff.`,
        icon: 'success',
        confirmButtonColor: '#9333ea',
      });

      setNewStaffPhone('');
      setNewStaffName('');
      setIsStaffModalOpen(false);
      fetchStaff(token); // Refresh list
    } catch (err: any) {
      Swal.fire('Error', err?.response?.data?.error || 'Failed to add staff', 'error');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    const result = await Swal.fire({
      title: 'Remove Staff?',
      text: 'They will no longer be able to record sales for you.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#e5e7eb',
      cancelButtonText: '<span style="color:#374151">Cancel</span>',
      confirmButtonText: 'Yes, remove',
    });

    if (!result.isConfirmed) return;

    const token = getTokenOrRedirect();
    if (!token) return;

    try {
      await axios.delete(`${API_URL}/staff/${staffId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setStaff((prev) => prev.filter((s) => s.id !== staffId));
      Swal.fire('Removed!', 'Staff access has been revoked.', 'success');
    } catch (err) {
      Swal.fire('Error', 'Failed to remove staff', 'error');
    }
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-green-600" />
          <p className="text-gray-500 font-medium animate-pulse">Loading Settings...</p>
        </div>
      </div>
    );

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
        <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-gray-600 hover:bg-white hover:shadow-sm rounded-lg md:hidden transition-all"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
              <p className="text-gray-500 text-sm mt-1">Manage store preferences</p>
            </div>
          </div>

          {/* Plan Badge */}
          <div
            className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 border shadow-sm ${
              isTycoon
                ? 'bg-purple-50 text-purple-700 border-purple-100'
                : 'bg-green-50 text-green-700 border-green-100'
            }`}
          >
            {isTycoon ? <Crown size={14} className="fill-purple-200" /> : <Shield size={14} />}
            {isTycoon ? 'TYCOON PLAN' : 'OGA BOSS PLAN'}
          </div>
        </header>

        <div className="max-w-4xl space-y-8 mx-auto md:mx-0">
          {/* General Settings Card */}
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-50 rounded-xl text-slate-600">
                <User size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">General Information</h2>
                <p className="text-xs text-gray-400">Basic details about your business</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Store Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm font-medium"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <Clock size={14} /> Closing Time
                  </label>
                  <input
                    type="time"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm font-medium"
                  />
                  <p className="text-[10px] text-gray-400 mt-1.5">Daily summary is generated at this time.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <Languages size={14} /> Bot Language
                  </label>
                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm font-medium appearance-none cursor-pointer"
                    >
                      <option value="English">English</option>
                      <option value="Pidgin">Pidgin</option>
                      <option value="Hausa">Hausa</option>
                      <option value="Yoruba">Yoruba</option>
                      <option value="Igbo">Igbo</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M1 1L5 5L9 1"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trial/Subscription indicator (optional but helpful) */}
              <div className="pt-2">
                {hasFeatureAccess ? (
                  <div className="inline-flex items-center gap-2 bg-green-50 border border-green-100 text-green-700 px-3 py-2 rounded-xl text-xs font-bold">
                    <CheckCircle2 size={14} />
                    {user?.subscriptionStatus === 'trial' ? (
                      <>
                        Trial Active
                        {typeof trialDaysLeft === 'number' ? (
                          <span className="text-green-700/80 font-semibold">
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
                    className="inline-flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-red-100 transition"
                  >
                    <Lock size={14} />
                    Trial Expired / Subscription Inactive
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reports & Automation */}
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                <FileText size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Reports & Automation</h2>
                <p className="text-xs text-gray-400">Configure how you receive updates</p>
              </div>
            </div>

            <div
              className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                pdfEnabled ? 'bg-green-50/30 border-green-100' : 'bg-slate-50 border-slate-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 p-1 rounded-full ${pdfEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-400'}`}>
                  {pdfEnabled ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Automatic PDF Reports</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Receive a formatted PDF summary with your daily closing message.
                  </p>
                  {!isTycoon && (
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                      <Crown size={10} /> TYCOON ONLY
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  if (!isTycoon) {
                    Swal.fire({
                      title: 'Tycoon Feature',
                      text: 'Automatic PDF reports are available on Tycoon plan.',
                      icon: 'info',
                      showCancelButton: true,
                      confirmButtonText: 'Upgrade',
                      confirmButtonColor: '#0F766E',
                      cancelButtonText: 'Close',
                      cancelButtonColor: '#64748b',
                    }).then((r) => {
                      if (r.isConfirmed) router.push('/payment?plan=TYCOON');
                    });
                    return;
                  }
                  setPdfEnabled((v) => !v);
                }}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
                  pdfEnabled ? 'bg-green-600' : 'bg-gray-300'
                } ${!isTycoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    pdfEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Storefront Settings (Tycoon Only) */}
          {isTycoon && (
             <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-pink-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-pink-50 rounded-xl text-pink-600">
                       <Smartphone size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Online Storefront</h2>
                      <p className="text-xs text-gray-400">Manage your public product page</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleSaveShop} 
                    disabled={saving}
                    className="bg-pink-600 hover:bg-pink-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-pink-600/20 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Shop Settings
                  </button>
                </div>

                <div className="space-y-6">
                   {/* Hero Image */}
                   <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                        Shop Cover Image
                      </label>
                      <div className="relative w-full h-40 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 overflow-hidden group">
                         {heroImageUrl ? (
                            <img src={heroImageUrl} alt="Cover" className="w-full h-full object-cover" />
                         ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                               <div className="text-center">
                                  <Camera className="w-8 h-8 mx-auto mb-1 opacity-50" />
                                  <span className="text-xs font-bold">Upload Cover</span>
                               </div>
                            </div>
                         )}
                         <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleHeroUpload} 
                            disabled={uploadingHero}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                         />
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
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                        Shop Description
                      </label>
                      <textarea
                        value={shopDescription}
                        onChange={(e) => setShopDescription(e.target.value)}
                        placeholder="Welcome to my shop! We sell the best quality items..."
                        maxLength={500}
                        rows={3}
                        className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-sm font-medium resize-none"
                      />
                      <p className="text-[10px] text-gray-400 mt-1.5 text-right">{shopDescription.length}/500</p>
                   </div>

                   {/* Link */}
                   <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                        Shop Link
                      </label>
                      <div className="flex items-center gap-2">
                         <div className="flex-1 flex items-center">
                            <span className="bg-slate-100 border border-r-0 border-gray-200 rounded-l-xl px-3 py-3 text-slate-500 text-sm font-medium hidden sm:block">
                               tallypadi.com/shop/
                            </span>
                            <input
                                type="text"
                                value={shopSlug}
                                onChange={(e) => setShopSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="unique-shop-name"
                                className="flex-1 border border-gray-200 sm:rounded-l-none rounded-l-xl rounded-r-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-sm font-bold text-slate-700"
                            />
                         </div>
                         
                         {shopSlug && (
                            <>
                              <button 
                                onClick={() => {
                                   navigator.clipboard.writeText(`https://tallypadi.com/shop/${shopSlug}`);
                                   Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Copied!', showConfirmButton: false, timer: 1000 });
                                }}
                                className="p-3 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition"
                                title="Copy Link"
                              >
                                 <Copy size={18} />
                              </button>
                              <a 
                                href={`https://tallypadi.com/shop/${shopSlug}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="p-3 bg-pink-50 border border-pink-100 text-pink-600 rounded-xl hover:bg-pink-100 transition"
                                title="Open Shop"
                              >
                                 <ExternalLink size={18} />
                              </a>
                            </>
                         )}
                      </div>
                   </div>
                </div>
             </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3.5 rounded-xl font-semibold text-sm shadow-lg shadow-green-600/20 flex items-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              <span>Save Changes</span>
            </button>
          </div>

          {/* Staff Management */}
          {isTycoon ? (
            <div className="relative overflow-hidden bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-purple-100 mt-8">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full opacity-50 pointer-events-none"></div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-xl text-purple-700">
                    <Users size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      Staff Management{' '}
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                        PRO
                      </span>
                    </h2>
                    <p className="text-xs text-gray-500">Allow others to record sales for your shop.</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsStaffModalOpen(true)}
                  className="mt-4 sm:mt-0 bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 shadow-lg shadow-purple-600/20 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Plus size={16} /> Add Staff
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {staff.length === 0 ? (
                  <div className="col-span-full text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                      <Smartphone className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No staff members added yet.</p>
                    <p className="text-xs text-slate-400 mt-1">Add a number to send an invite.</p>
                  </div>
                ) : (
                  staff.map((member) => (
                    <div
                      key={member.id}
                      className="flex justify-between items-center bg-white p-4 rounded-xl border border-purple-50 shadow-sm hover:border-purple-200 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 text-purple-600 flex items-center justify-center font-bold text-sm">
                          {member.name ? member.name[0].toUpperCase() : 'S'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{member.name || 'Staff Member'}</p>
                          <p className="text-xs text-gray-500 font-medium">{member.phoneNumber}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveStaff(member.id)}
                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove Staff"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-xl mt-8 text-white">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

              <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-white/10">
                    <Crown size={12} className="text-yellow-400" />
                    <span className="text-yellow-100">PREMIUM FEATURE</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Upgrade to Tycoon</h2>
                  <p className="text-slate-300 text-sm max-w-md leading-relaxed">
                    Unlock staff accounts, automated PDF reports, and export your data to Excel.
                    Take full control of your business today.
                  </p>
                </div>

                <div className="text-left md:text-right bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                  <span className="block text-3xl font-extrabold text-white">₦5,000</span>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Per Month</span>
                  <button
                    onClick={() => router.push('/payment?plan=TYCOON')}
                    className="mt-4 w-full bg-white text-slate-900 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors shadow-lg"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ADD STAFF MODAL */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200 scale-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Add New Staff</h3>
              <button
                onClick={() => setIsStaffModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-purple-50 p-4 rounded-xl mb-6 flex gap-3 items-start">
              <div className="p-1.5 bg-white rounded-full shadow-sm text-purple-600 mt-0.5">
                <Smartphone size={16} />
              </div>
              <p className="text-xs text-purple-800 leading-relaxed">
                Enter their WhatsApp number. They will receive an automated invitation to join your shop immediately.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Staff Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  className="w-full border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-medium text-gray-900 placeholder:text-gray-400"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                />
              </div>

              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                Phone Number
              </label>

              <div className="flex gap-2">
                <select
                  className="w-28 border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-3 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-medium text-gray-900 text-sm cursor-pointer"
                  value={staffCountryCode}
                  onChange={(e) => setStaffCountryCode(e.target.value)}
                >
                  <option value="+234">🇳🇬 +234</option>
                  <option value="+233">🇬🇭 +233</option>
                  <option value="+254">🇰🇪 +254</option>
                  <option value="+27">🇿🇦 +27</option>
                  <option value="+20">🇪🇬 +20</option>
                  <option value="+256">🇺🇬 +256</option>
                  <option value="+250">🇷🇼 +250</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                </select>

                <input
                  id="staffPhone"
                  type="tel"
                  placeholder="8012345678"
                  maxLength={15}
                  className="flex-1 border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-medium text-gray-900 placeholder:text-gray-400"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <p className="text-[10px] text-gray-400">Enter digits only (e.g., 8012345678 for Nigeria)</p>
            </div>

            <button
              onClick={handleAddStaff}
              disabled={addingStaff || !newStaffPhone}
              className="w-full mt-4 bg-purple-600 text-white py-3.5 rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-[0.98]"
            >
              {addingStaff ? <Loader2 className="animate-spin w-5 h-5" /> : 'Send Invitation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
