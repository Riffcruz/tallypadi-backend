'use client';

import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ArrowLeft,
  Users,
  Briefcase
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

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/**
 * Make a phone identifier your backend can match:
 * - allow user to type: "+234 908...", "234908...", "0908...", "908..."
 * - output: "+<digits>"
 */
function buildPhoneIdentifier(input: string, selectedCountryCode: string) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  // If user already typed +..., respect it
  if (raw.startsWith('+')) {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return null;
    return `+${digits}`;
  }

  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;

  // selected country digits (e.g. "+234" -> "234")
  const cc = selectedCountryCode.replace('+', '').trim();

  // If user typed a local NG style "0xxxxxxxxxx", strip the 0 then prefix cc
  if (digitsOnly.startsWith('0')) {
    const stripped = digitsOnly.replace(/^0+/, '');
    return `+${cc}${stripped}`;
  }

  // If user typed country code already (e.g. "234...." while cc=234)
  if (digitsOnly.startsWith(cc)) {
    return `+${digitsOnly}`;
  }

  // Otherwise treat it as national number and prefix cc
  return `+${cc}${digitsOnly}`;
}

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getCookie('tallyToken');
    if (token) {
      router.replace('/dashboard');
    }
  }, [router]);

  // Login Mode: 'owner' or 'staff'
  const [isStaffLogin, setIsStaffLogin] = useState(false);

  // Auth Method (Owner only): 'phone' or 'email'
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  
  const [countryCode, setCountryCode] = useState('+234');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Staff OTP Flow
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => {
    if (loading) return false;
    
    // Staff Flow
    if (isStaffLogin) {
      if (!phoneNumber.trim()) return false;
      if (otpSent && otpCode.length < 4) return false;
      return true;
    }

    // Owner Flow
    if (!password.trim()) return false;
    if (loginMethod === 'email') return isValidEmail(email);
    return Boolean(phoneNumber.trim());
  }, [loading, password, loginMethod, email, phoneNumber, isStaffLogin, otpSent, otpCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // --- SHARED IDENTIFIER BUILDER ---
    let identifier = '';
    if (isStaffLogin || loginMethod === 'phone') {
      const phoneId = buildPhoneIdentifier(phoneNumber, countryCode);
      if (!phoneId) {
        setError('Please enter your phone number');
        return;
      }
      identifier = phoneId;
    } else {
      const em = email.trim().toLowerCase();
      if (!isValidEmail(em)) {
        setError('Please enter a valid email address');
        return;
      }
      identifier = em;
    }

    setLoading(true);

    try {
      if (isStaffLogin) {
        // --- STAFF LOGIN FLOW ---
        if (!otpSent) {
          // Step 1: Request OTP
          const res = await axios.post(
            `${API_URL}/login/staff/request-otp`,
            { identifier },
            { timeout: 20000 }
          );
          if (res.data?.success) {
            setOtpSent(true);
            setError(''); // Clear any prev errors
          } else {
             setError(res.data?.message || 'Failed to send OTP');
          }
        } else {
          // Step 2: Verify OTP
          const res = await axios.post(
             `${API_URL}/login/staff`,
             { identifier, otp: otpCode },
             { timeout: 20000 }
          );
          
          if (res.data?.success) {
             setCookie('tallyToken', res.data.token, 7);
             const user = res.data.user;
             sessionStorage.setItem('tallyUser', JSON.stringify(user));
             // Staff go to sales page
             router.push('/sales');
             return;
          }
          setError('Invalid OTP. Please try again.');
        }

      } else {
        // --- OWNER LOGIN FLOW (Standard) ---
        const pass = password.trim();
        const res = await axios.post(
          `${API_URL}/login`,
          { identifier, password: pass },
          { timeout: 20000 }
        );

        if (res.data?.success) {
          setCookie('tallyToken', res.data.token, 7);
          const user = res.data.user;
          sessionStorage.setItem('tallyUser', JSON.stringify(user));

          if (user.role === 'HQ') {
            router.push('/hq/dashboard');
          } else if (user.role === 'INVESTOR') {
            router.push('/investor/dashboard');
          } else if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
            router.push('/admin/dashboard');
          } else {
            router.push('/dashboard');
          }
          return;
        }
        setError('Login failed. Please try again.');
      }

    } catch (err: any) {
      console.error(err);
      
      const status = err?.response?.status;
      const apiError = err?.response?.data?.error;

      if (!err?.response && (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error' || err?.message?.includes('status code 429'))) {
        setError('Network error. Kindly check your internet connection and try again.');
      } else if (status === 429) {
        setError('Too many attempts, please wait a few minutes and try again.');
      } else if (status === 401 || status === 404) {
        setError('Invalid credentials. Please try again.');
      } else if (status >= 500) {
        setError('Server issues. Kindly try again later.');
      } else {
        const msg = apiError || 'Connection failed. Please try again.';
        if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('not found')) {
            setError('Invalid credentials. Please try again.');
        } else {
            setError(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden font-sans">
      {/* Background */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070&auto=format&fit=crop')",
        }}
      />
      <div className="absolute inset-0 z-0 bg-slate-900/60 backdrop-blur-sm" />

      {/* Back */}
      <Link
        href="/"
        className="absolute top-6 left-6 z-20 text-white/80 hover:text-white flex items-center gap-2 transition-colors"
      >
        <ArrowLeft size={20} /> <span className="text-sm font-medium">Back to Home</span>
      </Link>

      {/* Card */}
      <div className="relative z-10 bg-white/95 backdrop-blur-md w-full max-w-[440px] p-8 md:p-10 rounded-3xl shadow-2xl border border-white/20">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-green-600 to-emerald-500 text-white shadow-lg shadow-green-600/20 mb-5">
            <Phone fill="currentColor" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome Back</h1>
          <p className="text-slate-500 text-sm mt-2">Log in to manage your inventory and sales.</p>
        </div>

        {/* --- OWNER vs STAFF Toggle --- */}
        <div className="flex p-1 bg-slate-200/50 rounded-xl mb-6">
           <button
             type="button"
             onClick={() => { setIsStaffLogin(false); setError(''); }}
             className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${
               !isStaffLogin ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'
             }`}
           >
             <Briefcase size={16} />
             <span>Owner</span>
           </button>
           <button
             type="button"
             onClick={() => { setIsStaffLogin(true); setError(''); setOtpSent(false); }}
             className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${
               isStaffLogin ? 'bg-white text-green-700 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'
             }`}
           >
             <Users size={16} />
             <span>Staff</span>
           </button>
        </div>

        {/* --- AUTH METHOD TOGGLE (Owner Only) --- */}
        {!isStaffLogin && (
          <div className="flex p-1.5 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setLoginMethod('phone');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                loginMethod === 'phone'
                  ? 'bg-white text-green-700 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Phone size={16} />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLoginMethod('email');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                loginMethod === 'email'
                  ? 'bg-white text-green-700 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Mail size={16} />
              <span>Email</span>
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-start animate-in fade-in slide-in-from-top-1">
            <div className="mt-0.5 mr-2">⚠️</div>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Identifier Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
              {isStaffLogin ? 'WhatsApp Number' : (loginMethod === 'phone' ? 'Phone Number' : 'Email Address')}
            </label>

            {/* PHONE INPUT (Used for Staff OR Owner Phone) */}
            {(isStaffLogin || loginMethod === 'phone') ? (
              <div className="flex gap-2">
                <div className="relative w-[35%]">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full h-12 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all appearance-none cursor-pointer font-medium"
                    disabled={otpSent}
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
                  className="flex-1 h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium disabled:opacity-50"
                  placeholder="e.g. 0908 118 8473"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={otpSent}
                  autoComplete="tel"
                />
              </div>
            ) : (
              // EMAIL INPUT (Owner Only)
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  className="w-full h-12 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                  placeholder="name@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            )}
          </div>

          {/* OTP Input (Staff + Sent) */}
          {isStaffLogin && otpSent && (
             <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                  Enter Login Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-bold tracking-widest text-center text-lg"
                  placeholder="000 000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                />
                <div className="text-right">
                    <button type="button" onClick={() => setOtpSent(false)} className="text-xs text-green-600 font-medium hover:underline">
                        Change Number?
                    </button>
                </div>
             </div>
          )}

          {/* Password (Owner Only) */}
          {!isStaffLogin && (
            <div className="space-y-1.5 animate-in fade-in">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-semibold text-green-600 hover:text-green-700 hover:underline">
                  Forgot Password?
                </Link>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>

                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full h-12 pl-11 pr-11 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            disabled={!canSubmit}
            className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-green-600/20 hover:shadow-green-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>{isStaffLogin ? 'Processing...' : 'Authenticating...'}</span>
              </>
            ) : (
              <span>
                  {isStaffLogin 
                    ? (otpSent ? 'Verify & Login' : 'Get Login Code') 
                    : 'Login to Dashboard'}
              </span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center pt-6 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="font-bold text-green-600 hover:text-green-700 hover:underline transition-colors"
            >
              Create Free Account
            </Link>
          </p>
          <div className="mt-4 flex items-center justify-center gap-4 text-xs font-semibold text-slate-400">
            <Link href="/privacy-policy" className="hover:text-green-600 transition-colors">Privacy Policy</Link>
            <span className="text-slate-300">•</span>
            <Link href="/terms-of-service" className="hover:text-green-600 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
