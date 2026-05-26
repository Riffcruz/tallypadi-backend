'use client';

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import Preloader from '../../components/Preloader';
import { useRouter } from 'next/navigation';
import {
  Save,
  Loader2,
  Menu,
  Shield,
  BadgeCheck,
  FileCheck,
  UploadCloud,
  AlertCircle,
  Crown,
  Smartphone,
  Camera,
  X,
  Copy,
  ExternalLink,
  Check,
  Palette,
  ChevronDown,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getCookie } from '../../utils/cookies';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import { Country, State, City } from 'country-state-city';
import StoreProductsModal from './StoreProductsModal';
import { NIGERIA_CUSTOM_CITIES } from '../../utils/nigeriaLocations';

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

const STORE_SETUP_LABELS: Record<string, string> = {
  businessName: 'Business name',
  shopSlug: 'Shop link',
  shopDescription: 'Shop description',
  phoneNumber: 'Contact phone',
  'location.country': 'Country',
  'location.state': 'State / region',
  'location.city': 'City',
  'location.address': 'Street address',
};

type VerificationDocumentField = 'documentFrontUrl' | 'documentBackUrl';
type VerificationFaceField =
  | 'selfieCenterUrl'
  | 'selfieLeftUrl'
  | 'selfieRightUrl'
  | 'selfieUpUrl'
  | 'selfieDownUrl';
type VerificationUploadField = VerificationDocumentField | VerificationFaceField;

interface PublicSellerVerification {
  id: string;
  status: string;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  submittedAt?: string | null;
}

export default function OnlineStorePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openSettingsCard, setOpenSettingsCard] = useState<'storefront' | 'location' | 'verification' | null>('storefront');
  const router = useRouter();

  const [businessName, setBusinessName] = useState('');
  const [shopSlug, setShopSlug] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [uploadingHero, setUploadingHero] = useState(false);
  const [themeColor, setThemeColor] = useState('#10b981');

  // Location State
  const [countryCode, setCountryCode] = useState('NG'); // defaults to Nigeria
  const [stateCode, setStateCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [addressLine, setAddressLine] = useState('');

  const [showProductsModal, setShowProductsModal] = useState(false);
  const [storeSetup, setStoreSetup] = useState<{ isComplete: boolean; missing: string[] } | null>(null);
  const [verificationStatus, setVerificationStatus] = useState('UNVERIFIED');
  const [latestVerification, setLatestVerification] = useState<PublicSellerVerification | null>(null);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [verificationUploading, setVerificationUploading] = useState<Record<string, boolean>>({});
  const [cameraCapture, setCameraCapture] = useState<{ field: VerificationFaceField; label: string } | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraUploading, setCameraUploading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [verificationForm, setVerificationForm] = useState({
    idType: 'NIN',
    fullName: '',
    governmentIdNumber: '',
    dateOfBirth: '',
    address: '',
    documentFrontUrl: '',
    documentBackUrl: '',
    selfieCenterUrl: '',
    selfieLeftUrl: '',
    selfieRightUrl: '',
    selfieUpUrl: '',
    selfieDownUrl: '',
    consentAccepted: false,
  });

  const getTokenOrRedirect = () => {
    const token = getCookie('tallyToken');
    if (!token) router.push('/login');
    return token;
  };

  const isTycoon = String(user?.planType || '').toUpperCase() === 'TYCOON';
  const requiresDocumentUpload = verificationForm.idType !== 'NIN';
  const documentUploadFields: [VerificationDocumentField, string][] = requiresDocumentUpload
    ? [['documentFrontUrl', 'ID Front'], ['documentBackUrl', 'ID Back']]
    : [];
  const faceCaptureFields: [VerificationFaceField, string][] = [
    ['selfieCenterUrl', 'Face Center'],
    ...(countryCode !== 'NG' ? [
      ['selfieLeftUrl', 'Face Left'] as [VerificationFaceField, string],
      ['selfieRightUrl', 'Face Right'] as [VerificationFaceField, string],
      ['selfieUpUrl', 'Face Up'] as [VerificationFaceField, string],
      ['selfieDownUrl', 'Face Down'] as [VerificationFaceField, string],
    ] : []),
  ];

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cameraCapture) {
      stopCamera();
      return;
    }

    let cancelled = false;
    const startCamera = async () => {
      setCameraStarting(true);
      setCameraError('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        setCameraError('Camera access failed. Please allow camera permission and try again.');
      } finally {
        if (!cancelled) setCameraStarting(false);
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCapture?.field]);

  const hydrateFromDashboard = (userData: any) => {
    setUser({ ...userData, planType: userData?.planType || 'OGA_BOSS' });
    setBusinessName(userData?.businessName || userData?.shopName || 'My Shop');
    setShopSlug(userData?.shopSlug || '');
    setShopDescription(userData?.shopDescription || '');
    setHeroImageUrl(userData?.heroImageUrl || '');
    setThemeColor(userData?.themeColor || '#10b981');
    
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
        const [dashboardRes, shopRes, verificationRes] = await Promise.allSettled([
          axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/shop/me`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/shop/verification`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (dashboardRes.status === 'fulfilled') hydrateFromDashboard(dashboardRes.value.data?.user || {});
        if (shopRes.status === 'fulfilled') {
          const shop = shopRes.value.data || {};
          setStoreSetup(shop.storeSetup || null);
          setVerificationStatus(shop.verification?.status || 'UNVERIFIED');
          setVerificationForm((current) => ({
            ...current,
            fullName: current.fullName || shop.businessName || '',
            address: current.address || shop.location?.address || '',
          }));
        }
        if (verificationRes.status === 'fulfilled') {
          setVerificationStatus(verificationRes.value.data?.status || 'UNVERIFIED');
          setLatestVerification(verificationRes.value.data?.verification || null);
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
      const res = await axios.put(
        `${API_URL}/shop/me`,
        { 
          shopSlug, 
          businessName, 
          shopDescription, 
          heroImageUrl, 
          themeColor,
          location: {
            country: countryCode,
            state: stateCode,
            city: cityName,
            address: addressLine
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStoreSetup(res.data?.storeSetup || null);
      Swal.fire({ title: 'Shop Updated', text: 'Your storefront settings have been saved.', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err?.response?.data?.error || 'Failed to update shop', 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadVerificationBlob = async (field: VerificationUploadField, blob: Blob, ext: string, purpose: string) => {
    const token = getTokenOrRedirect();
    if (!token) return null;
    setVerificationUploading((current) => ({ ...current, [field]: true }));
    try {
      const presignRes = await fetch(`${API_URL}/shop/verification/upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mime: blob.type || 'image/jpeg',
          ext,
          purpose,
        }),
      });

      if (!presignRes.ok) {
        const error = await presignRes.json().catch(() => ({}));
        throw new Error(error.error || 'Could not prepare upload');
      }

      const { uploadUrl, publicUrl } = await presignRes.json();
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'image/jpeg' },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error('Upload failed');

      setVerificationForm((current) => ({ ...current, [field]: publicUrl }));
      return publicUrl as string;
    } catch (err: any) {
      Swal.fire('Upload failed', err?.message || 'Could not upload verification file', 'error');
      return null;
    } finally {
      setVerificationUploading((current) => ({ ...current, [field]: false }));
    }
  };

  const uploadVerificationFile = async (field: VerificationDocumentField, file?: File | null) => {
    if (!file) return;
    const purpose = field === 'documentBackUrl' ? 'documentBack' : 'documentFront';
    const publicUrl = await uploadVerificationBlob(field, file, file.name.split('.').pop() || 'jpg', purpose);
    if (publicUrl) Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Uploaded', showConfirmButton: false, timer: 1000 });
  };

  const captureFaceImage = async () => {
    if (!cameraCapture || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) {
      Swal.fire('Camera Error', 'Could not capture image from the camera.', 'error');
      return;
    }

    setCameraUploading(true);
    try {
      const publicUrl = await uploadVerificationBlob(cameraCapture.field, blob, 'jpg', cameraCapture.field.replace('Url', ''));
      if (publicUrl) {
        Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Face captured', showConfirmButton: false, timer: 1000 });
        setCameraCapture(null);
      }
    } finally {
      setCameraUploading(false);
    }
  };

  const handleSubmitVerification = async () => {
    const token = getTokenOrRedirect();
    if (!token) return;
    setVerificationSubmitting(true);
    try {
      const payload = {
        ...verificationForm,
        countryCode,
        address: verificationForm.address || addressLine,
      };
      const res = await axios.post(`${API_URL}/shop/verification`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVerificationStatus(res.data?.verification?.status || 'PENDING');
      setLatestVerification(res.data?.verification || null);
      Swal.fire('Submitted', 'Your seller verification is pending admin review.', 'success');
    } catch (err: any) {
      Swal.fire('Verification Error', err?.response?.data?.error || 'Failed to submit verification', 'error');
    } finally {
      setVerificationSubmitting(false);
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

      <main className="min-h-screen w-full min-w-0 max-w-full overflow-x-hidden p-4 md:py-8 md:pl-72 md:pr-8">
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
                <div className="flex items-center justify-between mb-6">
                  <button
                    type="button"
                    onClick={() => setOpenSettingsCard(openSettingsCard === 'storefront' ? null : 'storefront')}
                    className="flex flex-1 items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-pink-50 rounded-xl text-pink-600"><Smartphone size={20} /></div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">Online Storefront Settings</h2>
                        <p className="text-xs text-gray-400">Shop link, cover image, description, products, and theme color.</p>
                      </div>
                    </div>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${openSettingsCard === 'storefront' ? 'rotate-180' : ''}`} />
                  </button>
                  <button 
                    onClick={() => setShowProductsModal(true)}
                    className="ml-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    Manage Products
                  </button>
                </div>

                {openSettingsCard === 'storefront' && (
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
                )}
              </div>

              {/* ── Theme Color Card ── */}
              {openSettingsCard === 'storefront' && (
              <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-purple-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-50 rounded-xl text-purple-600"><Palette size={20} /></div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Store Theme Color</h2>
                    <p className="text-xs text-gray-400">Pick an accent color for your public shop page (buttons, cart, highlights)</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
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
              )}

              {/* ── Location Card ── */}
              <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-emerald-100">
                <button
                  type="button"
                  onClick={() => setOpenSettingsCard(openSettingsCard === 'location' ? null : 'location')}
                  className="mb-6 flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Shop Location Settings</h2>
                      <p className="text-xs text-gray-400">Country, state, city, and street address used for marketplace visibility.</p>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${openSettingsCard === 'location' ? 'rotate-180' : ''}`} />
                </button>
                
                {openSettingsCard === 'location' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Country</label>
                      <select
                        value={countryCode}
                        onChange={(e) => { setCountryCode(e.target.value); setStateCode(''); setCityName(''); }}
                        className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
                      >
                        <option value="">Select Country</option>
                        {Country.getAllCountries().map(c => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">State / Region</label>
                      <select
                        value={stateCode}
                        onChange={(e) => { setStateCode(e.target.value); setCityName(''); }}
                        disabled={!countryCode}
                        className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium disabled:opacity-50"
                      >
                        <option value="">Select State</option>
                        {countryCode && State.getStatesOfCountry(countryCode).map(s => <option key={s.isoCode} value={s.isoCode}>{s.name}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">City / Local Govt</label>
                      <input
                        type="text"
                        list="city-list"
                        value={cityName}
                        onChange={(e) => setCityName(e.target.value)}
                        disabled={!stateCode}
                        placeholder="Type or select city..."
                        className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium disabled:opacity-50"
                      />
                      <datalist id="city-list">
                        {stateCode && (
                          // Merge custom cities (if Nigeria) with the standard cities, removing duplicates
                          Array.from(new Set([
                            ...(countryCode === 'NG' && NIGERIA_CUSTOM_CITIES[stateCode] ? NIGERIA_CUSTOM_CITIES[stateCode] : []),
                            ...City.getCitiesOfState(countryCode, stateCode).map(c => c.name)
                          ])).sort().map(cityName => (
                            <option key={cityName} value={cityName} />
                          ))
                        )}
                      </datalist>
                   </div>
                   <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Town / Street Address</label>
                      <input
                        type="text"
                        value={addressLine}
                        onChange={(e) => setAddressLine(e.target.value)}
                        placeholder="e.g. Ikeja, 12 Broad St"
                        className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
                      />
                   </div>
                </div>
                )}
              </div>

              {/* ── Save Button ── */}
              <div className="flex justify-end">
                <button onClick={handleSaveShop} disabled={saving}
                  className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-pink-600/20 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Shop Settings
                </button>
              </div>

              {/* ── Marketplace Readiness ── */}
              <div className={`bg-white p-6 md:p-8 rounded-2xl shadow-sm border ${storeSetup?.isComplete ? 'border-emerald-100' : 'border-amber-100'}`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${storeSetup?.isComplete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {storeSetup?.isComplete ? <FileCheck size={20} /> : <AlertCircle size={20} />}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-gray-900">Marketplace Readiness</h2>
                    <p className="text-xs text-gray-400">Your direct shop link stays public, but marketplace discovery needs these details completed.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {Object.entries(STORE_SETUP_LABELS).map(([key, label]) => {
                        const missing = Boolean(storeSetup?.missing?.includes(key));
                        return (
                          <span key={key} className={`rounded-full px-3 py-1 text-xs font-bold ${missing ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {missing ? 'Add ' : ''}{label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Seller Verification ── */}
              <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-sky-100">
                <div className="flex items-center gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setOpenSettingsCard(openSettingsCard === 'verification' ? null : 'verification')}
                    className="flex flex-1 items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-sky-50 rounded-xl text-sky-600"><BadgeCheck size={20} /></div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">Seller Verification</h2>
                        <p className="text-xs text-gray-400">Submit ID and live face capture to show a Verified ID badge.</p>
                      </div>
                    </div>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${openSettingsCard === 'verification' ? 'rotate-180' : ''}`} />
                  </button>
                  <span className={`ml-auto rounded-full px-3 py-1 text-xs font-black ${verificationStatus === 'VERIFIED' ? 'bg-sky-100 text-sky-700' : verificationStatus === 'PENDING' || verificationStatus === 'REVERIFY_REQUIRED' ? 'bg-amber-100 text-amber-700' : verificationStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    {verificationStatus === 'REVERIFY_REQUIRED' ? 'REVERIFY' : verificationStatus}
                  </span>
                </div>

                {openSettingsCard === 'verification' && (
                <>
                {verificationStatus === 'VERIFIED' ? (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-white p-2 text-sky-700 shadow-sm">
                        <BadgeCheck size={24} fill="currentColor" />
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-900">ID verified</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">Your marketplace profile and storefront can show the Verified ID badge.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {(verificationStatus === 'REJECTED' || verificationStatus === 'REVERIFY_REQUIRED') && latestVerification?.rejectionReason && (
                      <div className={`mb-5 rounded-xl border p-4 text-sm ${verificationStatus === 'REVERIFY_REQUIRED' ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-red-100 bg-red-50 text-red-700'}`}>
                        <p className="font-black">{verificationStatus === 'REVERIFY_REQUIRED' ? 'Reverification required' : 'Verification rejected'}</p>
                        <p className="mt-1 font-medium">{latestVerification.rejectionReason}</p>
                        <p className="mt-2 text-xs font-semibold opacity-80">You can correct the details below and submit again.</p>
                      </div>
                    )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">ID Type</label>
                    <select
                      value={verificationForm.idType}
                      onChange={(e) => {
                        const nextIdType = e.target.value;
                        setVerificationForm({
                          ...verificationForm,
                          idType: nextIdType,
                          documentFrontUrl: nextIdType === 'NIN' ? '' : verificationForm.documentFrontUrl,
                          documentBackUrl: nextIdType === 'NIN' ? '' : verificationForm.documentBackUrl,
                        });
                      }}
                      className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 text-sm font-medium"
                    >
                      <option value="NIN">NIN</option>
                      <option value="NATIONAL_ID">National ID</option>
                      <option value="DRIVERS_LICENSE">Driver Licence</option>
                      <option value="INTERNATIONAL_PASSPORT">International Passport</option>
                      <option value="GOVERNMENT_ID">Government Issued ID</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Full Name</label>
                    <input value={verificationForm.fullName} onChange={(e) => setVerificationForm({ ...verificationForm, fullName: e.target.value })} className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 text-sm font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">ID Number</label>
                    <input value={verificationForm.governmentIdNumber} onChange={(e) => setVerificationForm({ ...verificationForm, governmentIdNumber: e.target.value })} className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 text-sm font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Date of Birth</label>
                    <input type="date" value={verificationForm.dateOfBirth} onChange={(e) => setVerificationForm({ ...verificationForm, dateOfBirth: e.target.value })} className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 text-sm font-medium" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Residential Address</label>
                    <input value={verificationForm.address} onChange={(e) => setVerificationForm({ ...verificationForm, address: e.target.value })} placeholder={addressLine || 'Enter address'} className="w-full border border-gray-200 bg-slate-50/50 rounded-xl px-4 py-3 text-sm font-medium" />
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {requiresDocumentUpload && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">ID Document</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {documentUploadFields.map(([field, label]) => (
                          <label key={field} className="relative flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center hover:bg-slate-100">
                            <UploadCloud size={18} className="mb-2 text-sky-600" />
                            <span className="text-xs font-black text-slate-700">{label}</span>
                            <span className={`mt-1 text-[10px] font-bold ${verificationForm[field] ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {verificationUploading[field] ? 'Uploading...' : verificationForm[field] ? 'Uploaded' : 'Tap to upload'}
                            </span>
                            <input type="file" accept="image/*,application/pdf" className="absolute inset-0 opacity-0" onChange={(e) => uploadVerificationFile(field, e.target.files?.[0])} />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Live Face Capture</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {faceCaptureFields.map(([field, label]) => (
                        <button
                          type="button"
                          key={field}
                          onClick={() => setCameraCapture({ field, label })}
                          className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center hover:bg-slate-100"
                        >
                          <Camera size={18} className="mb-2 text-sky-600" />
                          <span className="text-xs font-black text-slate-700">{label}</span>
                          <span className={`mt-1 text-[10px] font-bold ${verificationForm[field] ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {verificationUploading[field] ? 'Uploading...' : verificationForm[field] ? 'Captured' : 'Open camera'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  <input type="checkbox" checked={verificationForm.consentAccepted} onChange={(e) => setVerificationForm({ ...verificationForm, consentAccepted: e.target.checked })} className="mt-1" />
                  <span>I confirm this information belongs to me and I authorize TallyPadi to review it for marketplace seller verification.</span>
                </label>

                <div className="mt-5 flex justify-end">
                  <button onClick={handleSubmitVerification} disabled={verificationSubmitting || verificationStatus === 'PENDING' || verificationStatus === 'VERIFIED'} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/20 disabled:opacity-50">
                    {verificationSubmitting ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
                    {verificationStatus === 'REJECTED' || verificationStatus === 'REVERIFY_REQUIRED' ? 'Resubmit Verification' : 'Submit Verification'}
                  </button>
                </div>
                  </>
                )}
                </>
                )}
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

      {showProductsModal && (
        <StoreProductsModal
          token={getCookie('tallyToken') as string}
          onClose={() => setShowProductsModal(false)}
        />
      )}

      {cameraCapture && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">{cameraCapture.label}</h3>
                <p className="text-xs font-medium text-slate-500">Use your camera to capture this face angle.</p>
              </div>
              <button
                type="button"
                onClick={() => setCameraCapture(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close camera"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-4">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-900">
                {cameraStarting && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900 text-white">
                    <Loader2 size={24} className="animate-spin" />
                  </div>
                )}
                {cameraError ? (
                  <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-white">
                    {cameraError}
                  </div>
                ) : (
                  <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setCameraCapture(null)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={captureFaceImage}
                  disabled={cameraStarting || cameraUploading || Boolean(cameraError)}
                  className="flex-1 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {cameraUploading ? 'Uploading...' : 'Capture'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
