'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import Preloader from '../../components/Preloader';
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
  Bell,
  Pencil,
  ClipboardList,
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
  isHqManager?: boolean;
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
  const [currencyCode, setCurrencyCode] = useState('NGN'); // ✅ New Explicit Currency
  const [pdfEnabled, setPdfEnabled] = useState(false);
  // ✅ Bank Details State
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  // Phone Change State
  const [changePhoneModalOpen, setChangePhoneModalOpen] = useState(false);
  const [changePhoneStep, setChangePhoneStep] = useState<1 | 2>(1);
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [changePhoneOtp, setChangePhoneOtp] = useState('');
  const [staffCountryCode, setStaffCountryCode] = useState('+234');
  const [changingPhone, setChangingPhone] = useState(false);

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
    setCurrencyCode(userData?.settings?.currencyCode || userData?.currencyCode || 'NGN');

    // Bank Details
    setBankName(userData?.bankDetails?.bankName || '');
    setAccountNumber(userData?.bankDetails?.accountNumber || '');
    setAccountName(userData?.bankDetails?.accountName || '');

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
            pdfReportsEnabled: pdfEnabled,
            currencyCode
          },
          bankDetails: {
             bankName,
             accountNumber,
             accountName
          }
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

  // --- Phone Change Logic ---
  const handleRequestChangePhoneOTP = async () => {
    if (!newOwnerPhone) return;
    const token = getTokenOrRedirect();
    if (!token) return;

    setChangingPhone(true);
    try {
      // Clean local number (remove leading 0)
      const cleanLocal = newOwnerPhone.replace(/^0+/, '');
      const cleanCode = staffCountryCode.replace('+', '');
      const finalNumber = `${cleanCode}${cleanLocal}`;

      await axios.post(`${API_URL}/auth/change-phone`, 
        { newPhoneNumber: finalNumber },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setChangePhoneStep(2);
      Swal.fire({
        title: 'OTP Sent',
        text: `We sent a code to your CURRENT WhatsApp number.`,
        icon: 'success',
        timer: 3000
      });
    } catch (err: any) {
       Swal.fire('Error', err?.response?.data?.error || 'Failed to request OTP', 'error');
    } finally {
      setChangingPhone(false);
    }
  };

  const handleVerifyChangePhone = async () => {
    if (!changePhoneOtp) return;
    const token = getTokenOrRedirect();
    if (!token) return;

    setChangingPhone(true);
    try {
      await axios.post(`${API_URL}/auth/change-phone/verify`, 
        { otp: changePhoneOtp },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      Swal.fire('Success', 'Your phone number has been updated.', 'success');
      setChangePhoneModalOpen(false);
      
      // Update local user state or refresh
      setUser((prev: any) => ({ ...prev, phoneNumber: newOwnerPhone })); // simplified update
      
      // Reset state
      setChangePhoneStep(1);
      setNewOwnerPhone('');
      setChangePhoneOtp('');
    } catch (err: any) {
       Swal.fire('Error', err?.response?.data?.error || 'Failed to verify OTP', 'error');
    } finally {
      setChangingPhone(false);
    }
  };

  if (loading)
    return <Preloader />;


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

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Owner Phone Number
                </label>
                <div className="flex gap-2">
                   <div className="flex-1 border border-gray-200 bg-slate-100 rounded-xl px-4 py-3 text-sm font-medium text-gray-500 cursor-not-allowed">
                     {user?.phoneNumber}
                   </div>
                   <button 
                     onClick={() => setChangePhoneModalOpen(true)}
                     className="bg-slate-900 text-white px-4 rounded-xl text-xs font-bold hover:bg-slate-800 transition"
                   >
                     Change
                   </button>
                </div>
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

                {/* Currency Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    Currency
                  </label>
                  <div className="relative">
                    <select
                      value={currencyCode}
                      onChange={(e) => setCurrencyCode(e.target.value)}
                      className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm font-medium appearance-none cursor-pointer"
                    >
                      <option value="NGN">🇳🇬 NGN - Naira</option>
                      <option value="USD">🇺🇸 USD - US Dollar</option>
                      <option value="GBP">🇬🇧 GBP - British Pound</option>
                      <option value="GHS">🇬🇭 GHS - Cedis</option>
                      <option value="KES">🇰🇪 KES - Shillings</option>
                      <option value="ZAR">🇿🇦 ZAR - Rand</option>
                      <option value="EUR">🇪🇺 EUR - Euro</option>
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
                      <>
                        Subscription Active
                        {user?.nextBillingDate && (
                          <span className="text-green-700/80 font-semibold ml-1">
                             • Renews {new Date(user.nextBillingDate).toLocaleDateString()}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-3 bg-red-50 border border-red-100 p-3 rounded-xl w-full">
                    <div className="flex items-center gap-2 text-red-700 text-xs font-bold">
                       <Lock size={14} />
                       <span>Trial Expired / Subscription Inactive</span>
                    </div>
                    <button
                      onClick={() => router.push('/payment')}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm whitespace-nowrap"
                    >
                      Subscribe
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bank Details Card */}
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                 <ClipboardList size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Bank Details</h2>
                <p className="text-xs text-gray-400">For Invoices & Receipts</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
               <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. GTBank"
                    className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
                  />
               </div>
               <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                    Account Number
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="0123456789"
                    maxLength={10}
                    className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
                  />
               </div>
               <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                    Account Name
                  </label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. My Shop Enterprise"
                    className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
                  />
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

        </div>
      </main>

      {/* CHANGE PHONE MODAL */}
      {changePhoneModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200 scale-100">
             <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Change Phone Number</h3>
              <button
                onClick={() => {
                   setChangePhoneModalOpen(false);
                   setChangePhoneStep(1);
                   setNewOwnerPhone('');
                   setChangePhoneOtp('');
                }}
                className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {changePhoneStep === 1 ? (
               <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                     Enter your new phone number below. For security, we will send the OTP to your <b>current</b> WhatsApp number.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                      New Phone Number
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="w-28 border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-3 py-3.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all font-medium text-gray-900 text-sm cursor-pointer"
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
                        type="tel"
                        placeholder="8012345678"
                        className="flex-1 border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all font-medium text-gray-900 placeholder:text-gray-400"
                        value={newOwnerPhone}
                        onChange={(e) => setNewOwnerPhone(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleRequestChangePhoneOTP}
                    disabled={changingPhone || !newOwnerPhone}
                    className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {changingPhone ? <Loader2 className="animate-spin w-5 h-5" /> : 'Send Verification Code'}
                  </button>
               </div>
            ) : (
               <div className="space-y-4">
                  <div className="bg-green-50 p-4 rounded-xl flex gap-3 items-start">
                    <div className="p-1.5 bg-white rounded-full shadow-sm text-green-600 mt-0.5">
                      <CheckCircle2 size={16} />
                    </div>
                    <p className="text-xs text-green-800 leading-relaxed">
                      OTP Sent to your <b>current</b> WhatsApp number. Please check it.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                      Enter OTP
                    </label>
                    <input
                      type="text"
                      placeholder="123456"
                      className="w-full border border-gray-200 bg-slate-50 focus:bg-white rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all font-medium text-gray-900 placeholder:text-gray-400 text-center tracking-widest text-lg"
                      value={changePhoneOtp}
                      onChange={(e) => setChangePhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                  <button
                    onClick={handleVerifyChangePhone}
                    disabled={changingPhone || changePhoneOtp.length < 6}
                    className="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {changingPhone ? <Loader2 className="animate-spin w-5 h-5" /> : 'Verify & Update Number'}
                  </button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
