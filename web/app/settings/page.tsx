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
  Image,
  Palette,
  MapPin,
  Building,
  CreditCard,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import { Country, State, City } from 'country-state-city';

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
  const [logoUrl, setLogoUrl] = useState(''); // Brand logo
  const [uploadingLogo, setUploadingLogo] = useState(false); // Brand logo upload state
  const [logoWidth, setLogoWidth] = useState(250); // Brand logo width
  const [logoHeight, setLogoHeight] = useState(60); // Brand logo height
  const [logoBgColor, setLogoBgColor] = useState('#ffffff'); // Logo background color
  const [logoBgEnabled, setLogoBgEnabled] = useState(false); // Whether to apply logo background

  const [closingTime, setClosingTime] = useState('');
  const [language, setLanguage] = useState('');
  const [currencyCode, setCurrencyCode] = useState('NGN'); // ✅ New Explicit Currency
  const [pdfEnabled, setPdfEnabled] = useState(false);
  const [smartMatchingEnabled, setSmartMatchingEnabled] = useState(true);
  // ✅ Bank Details State
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  // ✅ Location State
  const [countryCode, setCountryCode] = useState('NG'); // defaults to Nigeria
  const [stateCode, setStateCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [addressLine, setAddressLine] = useState('');

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
    setLogoUrl(userData?.settings?.logoUrl || '');
    setLogoWidth(userData?.settings?.logoWidth ?? 250);
    setLogoHeight(userData?.settings?.logoHeight ?? 60);
    setLogoBgColor(userData?.settings?.logoBgColor || '#ffffff');
    setLogoBgEnabled(userData?.settings?.logoBgEnabled ?? false);
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
    setSmartMatchingEnabled(userData?.settings?.smartMatchingEnabled ?? true);
    
    // Location Settings
    if (userData?.settings?.location) {
       setCountryCode(userData.settings.location.country || 'NG');
       setStateCode(userData.settings.location.state || '');
       setCityName(userData.settings.location.city || '');
       setAddressLine(userData.settings.location.address || '');
    }
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
          shopDescription,
          heroImageUrl,
          settings: {
            closingTime,
            language,
            currencyCode,
            pdfReportsEnabled: pdfEnabled,
            smartMatchingEnabled,
            logoUrl,
            logoWidth,
            logoHeight,
            logoBgColor,
            logoBgEnabled,
            location: {
               country: countryCode,
               state: stateCode,
               city: cityName,
               address: addressLine
            }
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

  const resizeAndCompressImage = (
    file: File,
    maxWidth: number,
    maxHeight: number,
    quality: number
  ): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return reject(new Error('Canvas context not available'));
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return reject(new Error('Blob generation failed'));
              }
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = getTokenOrRedirect();
    if (!token) return;

    setUploadingLogo(true);
    try {
       console.log('Original size:', (file.size / 1024).toFixed(2), 'KB');
       const compressedFile = await resizeAndCompressImage(file, 250, 250, 0.85);
       console.log('Compressed size:', (compressedFile.size / 1024).toFixed(2), 'KB');
       
       const url = await uploadToR2(compressedFile, token);
       setLogoUrl(url);
    } catch (err) {
       console.error(err);
       Swal.fire('Error', 'Failed to upload logo image', 'error');
    } finally {
       setUploadingLogo(false);
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

      <main className="min-h-screen w-full min-w-0 max-w-full overflow-x-hidden p-4 md:py-8 md:pl-72 md:pr-8">
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

            <div
              className={`flex items-center justify-between p-4 rounded-xl border transition-colors mt-4 ${
                smartMatchingEnabled ? 'bg-emerald-50/30 border-emerald-100' : 'bg-slate-50 border-slate-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 p-1 rounded-full ${smartMatchingEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                  {smartMatchingEnabled ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Smart Item Matching</h3>
                  <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                    Automatically resolve typos and plural/singular item names. <b>When disabled</b>, WhatsApp will require exact name matches.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSmartMatchingEnabled((v) => !v)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                  smartMatchingEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    smartMatchingEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            </div>
          </div>

          {/* Brand Logo & Formatting Card */}
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 mt-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                <Palette size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Receipt & Invoice Branding</h2>
                <p className="text-xs text-gray-400">Add your custom logo and adjust print dimensions</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Upload & Fine-tune dimensions & Background color (6 cols) */}
              <div className="lg:col-span-6 space-y-6">
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                  {logoUrl ? (
                    <div className="relative w-24 h-24 bg-white rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden group shadow-sm">
                      <img src={logoUrl} alt="Brand Logo" className="object-contain w-full h-full p-1.5" />
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="absolute inset-0 bg-red-600/90 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ) : (
                    <label className="w-24 h-24 bg-white border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center cursor-pointer text-gray-400 hover:text-emerald-600 hover:border-emerald-500 transition-all hover:bg-slate-50 shadow-sm">
                      {uploadingLogo ? (
                        <Loader2 size={24} className="animate-spin text-emerald-600" />
                      ) : (
                        <>
                          <Camera size={24} className="mb-1 text-slate-400" />
                          <span className="text-[10px] font-bold tracking-wider">UPLOAD LOGO</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                        className="hidden"
                      />
                    </label>
                  )}
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-gray-800">Business Logo Image</h4>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                      Upload your brand logo (PNG, JPG, or WEBP). Your logo is compressed client-side before upload to keep file size small.
                    </p>
                  </div>
                </div>

                {logoUrl && (
                  <div className="space-y-4">
                    {/* Width Adjustment */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                      {/* Logo Width */}
                      <div className="bg-white/50 border border-slate-200/60 p-5 rounded-2xl shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800">Print Width</span>
                            <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Horizontal Size</span>
                          </div>
                          <div className="flex items-center bg-slate-100/80 rounded-lg p-1 border border-slate-200/50">
                            <button
                              type="button"
                              onClick={() => setLogoWidth((w) => Math.max(100, w - 10))}
                              className="w-8 h-8 rounded-md bg-white text-slate-600 shadow-sm hover:text-emerald-600 hover:shadow flex items-center justify-center text-lg font-bold transition-all active:scale-95"
                            >
                              -
                            </button>
                            <div className="w-16 text-center text-sm font-black text-slate-700 font-mono">
                              {logoWidth}<span className="text-[10px] text-slate-400 ml-0.5">px</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setLogoWidth((w) => Math.min(300, w + 10))}
                              className="w-8 h-8 rounded-md bg-white text-slate-600 shadow-sm hover:text-emerald-600 hover:shadow flex items-center justify-center text-lg font-bold transition-all active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="300"
                          step="10"
                          value={logoWidth}
                          onChange={(e) => setLogoWidth(Number(e.target.value))}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
                        />
                      </div>

                      {/* Logo Height */}
                      <div className="bg-white/50 border border-slate-200/60 p-5 rounded-2xl shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800">Print Height</span>
                            <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Vertical Size</span>
                          </div>
                          <div className="flex items-center bg-slate-100/80 rounded-lg p-1 border border-slate-200/50">
                            <button
                              type="button"
                              onClick={() => setLogoHeight((h) => Math.max(30, h - 5))}
                              className="w-8 h-8 rounded-md bg-white text-slate-600 shadow-sm hover:text-emerald-600 hover:shadow flex items-center justify-center text-lg font-bold transition-all active:scale-95"
                            >
                              -
                            </button>
                            <div className="w-16 text-center text-sm font-black text-slate-700 font-mono">
                              {logoHeight}<span className="text-[10px] text-slate-400 ml-0.5">px</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setLogoHeight((h) => Math.min(120, h + 5))}
                              className="w-8 h-8 rounded-md bg-white text-slate-600 shadow-sm hover:text-emerald-600 hover:shadow flex items-center justify-center text-lg font-bold transition-all active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <input
                          type="range"
                          min="30"
                          max="120"
                          step="5"
                          value={logoHeight}
                          onChange={(e) => setLogoHeight(Number(e.target.value))}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
                        />
                      </div>
                    </div>

                    {/* Background Color Settings (Premium Redesign) */}
                    <div className="mt-6 bg-gradient-to-br from-slate-50 to-slate-100/50 p-6 rounded-2xl border border-slate-200/80 shadow-inner">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2.5 rounded-xl ${logoBgEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'} transition-colors`}>
                            <Image size={20} />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-800 block">Transparent Logo Background</span>
                            <span className="text-xs text-slate-500 mt-0.5 block leading-relaxed">
                              Apply a solid colored frame behind logos with transparent backgrounds.
                            </span>
                          </div>
                        </div>
                        
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={logoBgEnabled}
                            onChange={() => setLogoBgEnabled(!logoBgEnabled)} 
                          />
                          <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                        </label>
                      </div>

                      {logoBgEnabled && (
                        <div className="mt-5 pt-5 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                          {/* Color Picker Interface */}
                          <div className="flex-1 flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
                            <div className="relative group">
                              <input
                                type="color"
                                value={logoBgColor}
                                onChange={(e) => setLogoBgColor(e.target.value)}
                                className="w-12 h-12 rounded-xl cursor-pointer border-0 p-0 overflow-hidden bg-transparent shadow-sm opacity-0 absolute inset-0 z-10"
                                title="Choose custom color"
                              />
                              <div 
                                className="w-12 h-12 rounded-xl border-2 border-white shadow-md flex items-center justify-center transition-transform group-hover:scale-105"
                                style={{ backgroundColor: logoBgColor }}
                              >
                                <Palette size={16} className={['#ffffff', '#fdf6e2', '#f8fafc'].includes(logoBgColor.toLowerCase()) ? 'text-slate-400' : 'text-white/80'} />
                              </div>
                            </div>
                            
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Hex Color</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-slate-700 font-mono tracking-wide">{logoBgColor.toUpperCase()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Refined Quick Swatches */}
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Quick Select</span>
                            <div className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-200/60 shadow-sm">
                              {[
                                { label: 'White', value: '#ffffff' },
                                { label: 'Soft Cream', value: '#fdf6e2' },
                                { label: 'Light Slate', value: '#f8fafc' },
                                { label: 'Navy Blue', value: '#1e3a8a' },
                                { label: 'Deep Charcoal', value: '#1e293b' },
                              ].map((swatch) => (
                                <button
                                  key={swatch.value}
                                  type="button"
                                  onClick={() => setLogoBgColor(swatch.value)}
                                  className={`w-8 h-8 rounded-full shadow-sm transition-all relative overflow-hidden group ${
                                    logoBgColor.toLowerCase() === swatch.value.toLowerCase()
                                      ? 'ring-2 ring-offset-2 ring-emerald-500 scale-110 z-10'
                                      : 'ring-1 ring-slate-200/50 hover:scale-110 hover:ring-slate-300'
                                  }`}
                                  style={{ backgroundColor: swatch.value }}
                                  title={swatch.label}
                                >
                                  {logoBgColor.toLowerCase() === swatch.value.toLowerCase() && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                      <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Mini Document Header Live Mockup (6 cols) */}
              <div className="lg:col-span-6">
                <div className="flex flex-col h-full bg-slate-50 rounded-2xl p-5 border border-slate-150 shadow-inner">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Live Document Header Mockup</span>
                    {logoUrl && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        Active Custom Logo
                      </span>
                    )}
                  </div>

                  {/* Document Header representation */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[160px] flex flex-col justify-between relative overflow-hidden">
                    {/* Header Strip background representation (light blue/gray) */}
                    <div className="absolute inset-x-0 top-0 h-[80px] bg-slate-50/70 border-b border-slate-100 z-0" />

                    <div className="z-10 flex items-start justify-between gap-4">
                      {/* Left Side: Mock Shop details */}
                      <div className="space-y-1">
                        <div className="font-extrabold text-slate-900 text-sm tracking-tight truncate max-w-[150px] uppercase">
                          {businessName || 'My Business Name'}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400">INVOICE</div>
                        <div className="text-[8px] text-slate-400">Professional billing document</div>
                      </div>

                      {/* Right Side: Mock logo drawing box */}
                      <div className="flex items-center justify-end">
                        {logoUrl ? (
                          <div 
                            className="border rounded-lg flex items-center justify-center p-1 shadow-sm transition-all duration-150 ease-out"
                            style={{ 
                              width: `${logoWidth * 0.45}px`, 
                              height: `${logoHeight * 0.45}px`,
                              backgroundColor: logoBgEnabled ? logoBgColor : 'transparent',
                              borderColor: logoBgEnabled ? logoBgColor : '#e2e8f0'
                            }}
                          >
                            <img src={logoUrl} alt="Mock PDF logo" className="object-contain w-full h-full" />
                          </div>
                        ) : (
                          <div className="w-[50px] h-[50px] bg-teal-700 text-white rounded-lg flex items-center justify-center font-black text-xs shadow-md">
                            TP
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom: Mock Invoice metadata card */}
                    <div className="z-10 mt-6 pt-4 border-t border-dashed border-slate-100 flex justify-between items-center text-[8px] text-slate-400">
                      <div>
                        <span className="font-semibold text-slate-500">ISSUED TO: </span>
                        Guest Customer
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500">DATE: </span>
                        14 July 2026
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500">INVOICE NO: </span>
                        #INV-035107
                      </div>
                    </div>
                  </div>
                </div>
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
