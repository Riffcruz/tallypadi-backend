'use client';

import React, { useState } from 'react';
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
  ArrowLeft
} from 'lucide-react';

const API_URL = 'https://tallypadi.com/api';

// Common African & Major Business Hub Codes
const COUNTRY_CODES = [
  { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+233', flag: '🇬🇭', name: 'Ghana' },
  { code: '+254', flag: '🇰🇪', name: 'Kenya' },
  { code: '+27',  flag: '🇿🇦', name: 'South Africa' },
  { code: '+44',  flag: '🇬🇧', name: 'UK' },
  { code: '+1',   flag: '🇺🇸', name: 'USA' },
];

export default function LoginPage() {
  const router = useRouter();
  
  // State Management
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [countryCode, setCountryCode] = useState('+234');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let identifier = '';

      if (loginMethod === 'phone') {
        if (!phoneNumber) throw new Error('Please enter your phone number');
        
        // Smart Formatting
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const finalNumber = cleanNumber.startsWith('0') ? cleanNumber.substring(1) : cleanNumber;
        const code = countryCode.replace('+', '');
        
        identifier = `${code}${finalNumber}`;
      } else {
        if (!email || !email.includes('@')) throw new Error('Please enter a valid email address');
        identifier = email;
      }

      const res = await axios.post(`${API_URL}/login`, { 
        identifier, 
        password 
      });

      if (res.data.success) {
        localStorage.setItem('tallyToken', res.data.token);
        localStorage.setItem('tallyUser', JSON.stringify(res.data.user));
        router.push('/dashboard');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Connection failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden font-sans">
      
      {/* Background Image & Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070&auto=format&fit=crop')" }} 
      />
      {/* Dark Overlay with Blur */}
      <div className="absolute inset-0 z-0 bg-slate-900/60 backdrop-blur-sm" />

      {/* Floating Back Button */}
      <Link href="/" className="absolute top-6 left-6 z-20 text-white/80 hover:text-white flex items-center gap-2 transition-colors">
        <ArrowLeft size={20} /> <span className="text-sm font-medium">Back to Home</span>
      </Link>

      {/* Main Card */}
      <div className="relative z-10 bg-white/95 backdrop-blur-md w-full max-w-[440px] p-8 md:p-10 rounded-3xl shadow-2xl border border-white/20 animate-fade-in">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-green-600 to-emerald-500 text-white shadow-lg shadow-green-600/20 mb-5">
             <Phone fill="currentColor" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">Welcome Back</h1>
          <p className="text-slate-500 text-sm mt-2">Log in to manage your inventory and sales.</p>
        </div>

        {/* Login Method Toggle */}
        <div className="flex p-1.5 bg-slate-100 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => { setLoginMethod('phone'); setError(''); }}
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
            onClick={() => { setLoginMethod('email'); setError(''); }}
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
        
        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-start animate-in fade-in slide-in-from-top-2">
            <div className="mt-0.5 mr-2">⚠️</div>
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Dynamic Input (Phone or Email) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
              {loginMethod === 'phone' ? 'Phone Number' : 'Email Address'}
            </label>
            
            {loginMethod === 'phone' ? (
              <div className="flex gap-2">
                {/* Country Code Selector */}
                <div className="relative w-[35%]">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full h-12 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all appearance-none cursor-pointer font-medium"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>

                {/* Phone Input */}
                <div className="relative flex-1">
                  <input 
                    type="tel" 
                    className="w-full h-12 pl-4 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                    placeholder="812 345 6789"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              // Email Input
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
                />
              </div>
            )}
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center ml-1">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Password
              </label>
              {/* <a href="#" className="text-xs font-semibold text-green-600 hover:text-green-700 hover:underline">
                Forgot password?
              </a> */}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input 
                type={showPassword ? "text" : "password"}
                className="w-full h-12 pl-11 pr-11 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button 
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-green-600/20 hover:shadow-green-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Login to Dashboard</span>
            )}
          </button>
        </form>
        
        {/* Footer */}
        <div className="mt-8 text-center pt-6 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            Don't have an account?{' '}
            <a href="/register" className="font-bold text-green-600 hover:text-green-700 hover:underline transition-colors">
              Create Free Account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}