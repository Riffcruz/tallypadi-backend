'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ArrowLeft,
  CheckCircle2
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

const COUNTRY_CODES = [
  { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+233', flag: '🇬🇭', name: 'Ghana' },
  { code: '+254', flag: '🇰🇪', name: 'Kenya' },
  { code: '+27',  flag: '🇿🇦', name: 'South Africa' },
  { code: '+44',  flag: '🇬🇧', name: 'UK' },
  { code: '+1',   flag: '🇺🇸', name: 'USA' },
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

export default function ForgotPasswordPage() {
  const router = useRouter();

  // Step 1: Phone
  // Step 2: OTP + New Password (simplified UI to just one screen after OTP sent)
  // Actually, typically you enter OTP then Password. 
  // Let's do: Step 1 (Request), Step 2 (Verify & Reset)
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Request, 2: Reset, 3: Success

  const [countryCode, setCountryCode] = useState('+234');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Step 1: Request OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');

    const identifier = buildPhoneIdentifier(phoneNumber, countryCode);
    if (!identifier) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/forgot-password`, { identifier });
      if (res.data.success) {
        setStep(2);
        setMsg('OTP sent! Check your WhatsApp.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');

    if (!otp || otp.length < 6) {
      setError('Enter the 6-digit OTP');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password too short');
      return;
    }

    const identifier = buildPhoneIdentifier(phoneNumber, countryCode);
    setLoading(true);

    try {
      const res = await axios.post(`${API_URL}/auth/reset-password`, {
        identifier,
        otp,
        newPassword
      });
      if (res.data.success) {
        setStep(3);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reset password');
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
        href="/login"
        className="absolute top-6 left-6 z-20 text-white/80 hover:text-white flex items-center gap-2 transition-colors"
      >
        <ArrowLeft size={20} /> <span className="text-sm font-medium">Back to Login</span>
      </Link>

      {/* Card */}
      <div className="relative z-10 bg-white/95 backdrop-blur-md w-full max-w-[440px] p-8 md:p-10 rounded-3xl shadow-2xl border border-white/20">
        
        {step === 1 && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20 mb-5">
                <Lock fill="currentColor" size={24} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Forgot Password?</h1>
              <p className="text-slate-500 text-sm mt-2">
                Enter your WhatsApp number to receive a reset OTP.
              </p>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 text-left">
                <strong>Important:</strong> You must have sent a message to the TallyPadi bot on WhatsApp within the last 24 hours to receive this code.
              </div>
            </div>

            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-start">
                <div className="mt-0.5 mr-2">⚠️</div>{error}
              </div>
            )}

            <form onSubmit={handleRequestOTP} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                  WhatsApp Number
                </label>
                <div className="flex gap-2">
                  <div className="relative w-[35%]">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-full h-12 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all appearance-none cursor-pointer font-medium"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  </div>
                  <input
                    type="tel"
                    className="flex-1 h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                    placeholder="812 345 6789"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <button
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white h-12 rounded-xl font-bold shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send OTP'}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/20 mb-5">
                <CheckCircle2 size={24} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reset Password</h1>
              <p className="text-slate-500 text-sm mt-2">
                OTP sent! Check your WhatsApp and enter it below.
              </p>
            </div>

            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}
            {msg && (
               <div className="mb-6 bg-green-50 border border-green-100 text-green-600 px-4 py-3 rounded-xl text-sm">{msg}</div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-5">
              
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">OTP Code</label>
                <input
                  type="text"
                  placeholder="123456"
                  className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-slate-900 font-medium tracking-widest text-center text-lg"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full h-12 pl-4 pr-11 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-slate-900 font-medium"
                    placeholder="New strong password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Change Password'}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-slate-400 text-sm py-2 hover:text-slate-600 transition-colors"
              >
                Wrong number? Go back
              </button>
            </form>
          </>
        )}

        {step === 3 && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 mb-6 animate-bounce">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Password Reset!</h2>
            <p className="text-slate-500 mb-8">
              Your password has been changed successfully. You can now login with your new password.
            </p>
            <Link
              href="/login"
              className="block w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-all"
            >
              Go to Login
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
