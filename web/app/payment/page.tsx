'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { usePaystackPayment } from 'react-paystack'; // 🟢 Use the Hook, not the Button component
import {
  CheckCircle2,
  ShieldCheck,
  Zap,
  AlertCircle,
  Loader2,
  Lock,
  ArrowRight
} from 'lucide-react';

// --- TYPES ---
type PlanType = 'OGA_BOSS' | 'TYCOON';

interface PlanDetails {
  id: PlanType;
  name: string;
  price: number;
  features: string[];
  recommended?: boolean;
}

// --- CONFIGURATION ---
const PLANS: PlanDetails[] = [
  {
    id: 'OGA_BOSS',
    name: 'Oga Boss Plan',
    price: 2500,
    features: [
      'Unlimited Sales Records',
      'Basic Inventory Tracking',
      'Daily Profit Summary',
      '1 User Account',
      'Standard Support'
    ]
  },
  {
    id: 'TYCOON',
    name: 'Tycoon Plan',
    price: 5000,
    features: [
      'Everything in Oga Boss',
      'Multi-Staff Login (Up to 5)',
      'Branded PDF Invoices',
      'Advanced Web Dashboard',
      'Priority VIP Support'
    ],
    recommended: true
  }
];

// 🟢 Helper to get Backend URL (Handles VPS IP & Localhost)
const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    
    // Localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
    
    // VPS IP Address Detection (IPv4)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return `${protocol}//${hostname}:5000/api`;
    }
  }
  return 'https://tallypadi.com/api';
};

export default function PaymentPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('OGA_BOSS');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userId, setUserId] = useState(''); 
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPlan = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];

  // Auto-select plan & load user
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const planParam = params.get('plan');
      if (planParam === 'TYCOON') setSelectedPlan('TYCOON');

      const savedUser = localStorage.getItem('tallyUser');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          if (user.email) setEmail(String(user.email));
          if (user.phoneNumber) setPhoneNumber(String(user.phoneNumber));
          if (user.id || user._id) setUserId(user.id || user._id);
        } catch (e) {}
      }
    }
  }, []);

  // 🟢 PAYSTACK CONFIG (Hook)
  const config = {
    reference: (new Date()).getTime().toString(),
    email: email,
    amount: currentPlan.price * 100, // kobo
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '',
    metadata: {
      planType: selectedPlan,
      phoneNumber: phoneNumber,
      userId: userId,
      custom_fields: [
        { display_name: "Plan", variable_name: "plan", value: selectedPlan },
        { display_name: "Phone", variable_name: "phone", value: phoneNumber }
      ]
    },
  };

  // Initialize Hook
  const initializePayment = usePaystackPayment(config);

  // 🟢 1. TRIGGER PAYMENT
  const handlePayClick = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!config.publicKey) {
      setError("Missing Paystack Public Key in environment variables.");
      return;
    }

    if (!email || !phoneNumber) {
      setError("Please provide both Email and WhatsApp Number.");
      return;
    }

    // Trigger the Paystack Popup
    initializePayment({
        onSuccess: (reference: any) => handleSuccess(reference),
        onClose: () => console.log("Payment closed")
    });
  };

  // 🟢 2. VERIFY ON BACKEND
  const handleSuccess = async (referenceObj: any) => {
    setVerifying(true);
    // referenceObj is like { reference: "...", message: "Approved", status: "success", trans: "..." }
    const ref = referenceObj.reference; 

    const API_URL = getApiUrl();

    try {
      // Call your backend to verify and update DB
      await axios.get(`${API_URL}/payment/verify/${ref}`);
      
      setSuccess(true);
      // Redirect to dashboard after 2.5s
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2500);

    } catch (err: any) {
      console.error(err);
      
      if (err.response?.status === 502) {
        setError(`Server Error (502): Backend unreachable at ${API_URL}.`);
      } else if (err.response?.status === 404) {
        setError(`Server Error (404): Backend verify route not found.`);
      } else {
        setError("Payment was successful, but server verification failed. Please contact support.");
      }
    } finally {
      setVerifying(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md w-full animate-in zoom-in duration-300">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h2>
          <p className="text-slate-500 mb-6">Your {selectedPlan.replace('_', ' ')} subscription is now active.</p>
          <a href="/dashboard" className="block w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition">
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-emerald-500 selection:text-white flex flex-col">
      {/* Simple Header */}
      <div className="bg-white border-b border-slate-200 py-4 px-6 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-xl text-slate-900 hover:opacity-80 transition"
          >
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
              <Zap size={18} fill="currentColor" />
            </div>
            Tallypadi
          </a>
          <div className="text-sm text-slate-500 flex items-center gap-1">
            <Lock size={14} /> Secure Checkout
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 grid md:grid-cols-12 gap-8">
        {/* LEFT COLUMN: Plan Selection */}
        <div className="md:col-span-7 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Select Subscription</h1>
            <p className="text-slate-500 text-sm mt-1">
              Upgrade your business today. Cancel anytime.
            </p>
          </div>

          <div className="space-y-4">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-start gap-4 ${
                  selectedPlan === plan.id
                    ? 'border-emerald-500 bg-emerald-50/30 shadow-md scale-[1.01]'
                    : 'border-slate-200 bg-white hover:border-emerald-200 hover:shadow-sm'
                }`}
              >
                {/* Radio Circle */}
                <div
                  className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedPlan === plan.id ? 'border-emerald-500' : 'border-slate-300'
                  }`}
                >
                  {selectedPlan === plan.id && (
                    <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex justify-between items-center mb-2">
                    <h3
                      className={`font-bold text-lg ${
                        selectedPlan === plan.id ? 'text-emerald-900' : 'text-slate-700'
                      }`}
                    >
                      {plan.name}
                    </h3>
                    {plan.recommended && (
                      <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full tracking-wide">
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed mb-4">
                    {plan.id === 'OGA_BOSS'
                      ? 'Perfect for solo shop owners managing sales.'
                      : 'For growing businesses needing staff accounts and branding.'}
                  </p>
                  <div className="text-2xl font-bold text-slate-900">
                    ₦{plan.price.toLocaleString()}{' '}
                    <span className="text-sm font-medium text-slate-400">/ month</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Features List */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h4 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider">
              What's included in {currentPlan.name}
            </h4>
            <ul className="grid sm:grid-cols-2 gap-3">
              {currentPlan.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* RIGHT COLUMN: Checkout Form */}
        <div className="md:col-span-5">
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-xl sticky top-8">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Billing Details</h2>

            <form onSubmit={handlePayClick} className="space-y-6">
              {/* Email Input */}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition outline-none"
                />
                <p className="text-xs text-slate-400">Receipt will be sent here.</p>
              </div>

              {/* Phone Number Input */}
              <div className="space-y-2">
                <label htmlFor="phoneNumber" className="block text-sm font-medium text-slate-700">
                  WhatsApp Phone Number
                </label>
                <input
                  type="tel"
                  id="phoneNumber"
                  required
                  placeholder="+2348012345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition outline-none"
                />
                <p className="text-xs text-slate-400">
                  Used to link payment to your account.
                </p>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Plan</span>
                  <span className="font-medium">{currentPlan.name}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Billing Cycle</span>
                  <span className="font-medium">Monthly</span>
                </div>
                <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                  <span className="font-bold text-slate-900">Total</span>
                  <span className="text-xl font-bold text-emerald-600">
                    ₦{currentPlan.price.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2 whitespace-pre-wrap">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit Button (Custom button triggering hook) */}
              <button
                type="submit"
                disabled={verifying || !email || !phoneNumber}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95"
              >
                {verifying ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Pay Now <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="flex justify-center items-center gap-2 text-slate-400 text-xs mt-4">
                <ShieldCheck size={12} />
                Payments secured by Paystack
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}