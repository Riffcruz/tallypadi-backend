'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
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

// Sanitize URL & Handle Localhost Logic
const getApiUrl = () => {
    // 1. If explicit env var exists, use it
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
    }
    
    // 2. If running locally and no env var, assume local backend
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        // Adjust port 5000 if your server runs on a different port (e.g. 3000, 8080)
        return 'http://localhost:5000/api'; 
    }

    // 3. Fallback to production
    return 'https://tallypadi.com/api';
};

export default function PaymentPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('OGA_BOSS');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-select plan from URL query param
  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const planParam = params.get('plan');
        if (planParam === 'TYCOON') setSelectedPlan('TYCOON');

        // Optional: Auto-fill email if stored in local storage
        const savedUser = localStorage.getItem('tallyUser');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                if (user.email) setEmail(user.email);
            } catch (e) {}
        }
    }
  }, []);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanEmail = email.trim();
      const API_URL = getApiUrl();

      console.log(`Connecting to Backend: ${API_URL}/payment/initialize`);

      // 1. Call Backend
      const response = await axios.post(`${API_URL}/payment/initialize`, {
        email: cleanEmail,
        targetPlan: selectedPlan
      });

      const { authorization_url } = response.data;

      // 2. Validate URL before redirecting
      if (authorization_url && authorization_url.startsWith('http')) {
        console.log("Redirecting to Paystack:", authorization_url);
        window.location.href = authorization_url;
      } else {
        throw new Error('Received invalid redirect URL from payment provider.');
      }

    } catch (err: any) {
      console.error("Payment Error:", err);
      
      // Handle 404 specifically (Route not found on server)
      if (err.response?.status === 404) {
        setError(`Server Error (404): Could not find the payment endpoint. Please ensure your backend server is running and the payment routes are registered.`);
        return;
      }

      // Detailed error message
      const msg = err.response?.data?.message || err.message || "Connection failed. Please check your internet.";
      setError(msg);
      
      // If user not found, give a hint
      if (msg.includes('User not found')) {
        setError("This email is not registered. Please use the email you signed up with.");
      }
    } finally {
      setLoading(false);
    }
  };

  const currentPlan = PLANS.find(p => p.id === selectedPlan) || PLANS[0];

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-emerald-500 selection:text-white flex flex-col">
      
      {/* Simple Header */}
      <div className="bg-white border-b border-slate-200 py-4 px-6 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/dashboard" className="flex items-center gap-2 font-bold text-xl text-slate-900 hover:opacity-80 transition">
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
            <p className="text-slate-500 text-sm mt-1">Upgrade your business today. Cancel anytime.</p>
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
                <div className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                   selectedPlan === plan.id ? 'border-emerald-500' : 'border-slate-300'
                }`}>
                   {selectedPlan === plan.id && <div className="w-3 h-3 bg-emerald-500 rounded-full" />}
                </div>

                <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className={`font-bold text-lg ${selectedPlan === plan.id ? 'text-emerald-900' : 'text-slate-700'}`}>
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
                            ? "Perfect for solo shop owners managing sales." 
                            : "For growing businesses needing staff accounts and branding."}
                    </p>
                    <div className="text-2xl font-bold text-slate-900">
                        ₦{plan.price.toLocaleString()} <span className="text-sm font-medium text-slate-400">/ month</span>
                    </div>
                </div>
              </div>
            ))}
          </div>

          {/* Features List for Selected Plan */}
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
                
                <form onSubmit={handlePayment} className="space-y-6">
                    
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
                        <p className="text-xs text-slate-400">Must match your login email.</p>
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
                            <span className="text-xl font-bold text-emerald-600">₦{currentPlan.price.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button 
                        type="submit" 
                        disabled={loading || !email}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                Connecting...
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