'use client';

import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Phone,
  Store,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ArrowLeft,
  Clock,
  Languages
} from 'lucide-react';
import { setCookie, getCookie } from '../../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

const COUNTRY_CODES = [
  { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+233', flag: '🇬🇭', name: 'Ghana' },
  { code: '+254', flag: '🇰🇪', name: 'Kenya' },
  { code: '+27',  flag: '🇿🇦', name: 'South Africa' },
  { code: '+44',  flag: '🇬🇧', name: 'UK' },
  { code: '+1',   flag: '🇺🇸', name: 'USA' },
];

const LANGUAGES = [
  { code: 'English', name: 'English' },
  { code: 'Pidgin', name: 'Pidgin' },
  { code: 'Yoruba', name: 'Yoruba' },
  { code: 'Igbo', name: 'Igbo' },
  { code: 'Hausa', name: 'Hausa' },
];

function buildPhoneIdentifier(input: string, selectedCountryCode: string) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (raw.startsWith('+')) {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return null;
    return `+${digits}`;
  }
  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;
  const cc = selectedCountryCode.replace('+', '').trim();
  if (digitsOnly.startsWith('0')) {
    const stripped = digitsOnly.replace(/^0+/, '');
    return `+${cc}${stripped}`;
  }
  if (digitsOnly.startsWith(cc)) {
    return `+${digitsOnly}`;
  }
  return `+${cc}${digitsOnly}`;
}

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getCookie('tallyToken');
    if (token) {
      router.replace('/dashboard');
    }
  }, [router]);

  const [countryCode, setCountryCode] = useState('+234');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [shopName, setShopName] = useState('');
  const [password, setPassword] = useState('');
  const [closingHour, setClosingHour] = useState('20:00');
  const [language, setLanguage] = useState('English');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!password.trim() || password.length < 6) return false;
    if (!shopName.trim()) return false;
    if (!phoneNumber.trim()) return false;
    return true;
  }, [loading, password, shopName, phoneNumber]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const pass = password.trim();
    if (pass.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    const phoneId = buildPhoneIdentifier(phoneNumber, countryCode);
    if (!phoneId) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(
        `${API_URL}/register`,
        { 
          phoneNumber: phoneId,
          businessName: shopName,
          password: pass,
          closingTime: closingHour,
          language: language,
          countryCode: countryCode.replace('+', '')
        },
        { timeout: 20000 }
      );

      if (res.data?.success) {
        setCookie('tallyToken', res.data.token, 7);
        const user = res.data.user;
        sessionStorage.setItem('tallyUser', JSON.stringify(user));
        router.push('/dashboard');
        return;
      }

      setError('Registration failed. Please try again.');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Registration failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden font-sans">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=2070&auto=format&fit=crop')",
        }}
      />
      <div className="absolute inset-0 z-0 bg-slate-900/60 backdrop-blur-sm" />

      <Link
        href="/"
        className="absolute top-6 left-6 z-20 text-white/80 hover:text-white flex items-center gap-2 transition-colors"
      >
        <ArrowLeft size={20} /> <span className="text-sm font-medium">Back to Home</span>
      </Link>

      <div className="relative z-10 bg-white/95 backdrop-blur-md w-full max-w-[480px] p-8 md:p-10 rounded-3xl shadow-2xl border border-white/20 my-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-600/20 mb-5">
            <Store fill="currentColor" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Account</h1>
          <p className="text-slate-500 text-sm mt-2">Start managing your shop with TallyPadi.</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-start">
            <div className="mt-0.5 mr-2">⚠️</div>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Phone */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
              WhatsApp Number
            </label>
            <div className="flex gap-2">
              <div className="relative w-[35%]">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full h-12 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer font-medium"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  size={14}
                />
              </div>
              <input
                type="tel"
                className="flex-1 h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                placeholder="908 123 4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Shop Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
              Shop Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Store className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                className="w-full h-12 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                placeholder="e.g. Mama Tunde Stores"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
            </div>
          </div>

          {/* Closing Hour & Language */}
          <div className="flex gap-4">
             <div className="space-y-1.5 flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                  Closing Time
                </label>
                <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Clock className="h-4 w-4 text-slate-400" />
                   </div>
                   <input
                      type="time"
                      className="w-full h-12 pl-10 pr-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none text-slate-900 font-medium"
                      value={closingHour}
                      onChange={(e) => setClosingHour(e.target.value)}
                   />
                </div>
             </div>
             
             <div className="space-y-1.5 flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                  Language
                </label>
                <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Languages className="h-4 w-4 text-slate-400" />
                   </div>
                   <select
                      className="w-full h-12 pl-10 pr-8 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none text-slate-900 font-medium appearance-none"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                   >
                      {LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                   </select>
                   <ChevronDown
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      size={14}
                    />
                </div>
             </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full h-12 pl-11 pr-11 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            disabled={!canSubmit}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Register Shop</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
            >
              Log in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
