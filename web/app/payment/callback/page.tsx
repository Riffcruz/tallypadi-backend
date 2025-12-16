'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';

export default function PaymentCallbackPage() {
  // Using standard state instead of Next.js specific hooks for preview compatibility
  // In a real Next.js app, you can use: import { useRouter, useSearchParams } from 'next/navigation';
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('Verifying your transaction...');

  useEffect(() => {
    // Using window.location to be framework-agnostic for this preview
    // In Next.js, use: const searchParams = useSearchParams(); const reference = searchParams.get('reference');
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');

    if (!reference) {
      setStatus('failed');
      setMessage('No transaction reference found.');
      return;
    }

    verifyTransaction(reference);
  }, []);

  const verifyTransaction = async (reference: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
      
      const res = await fetch(`${API_URL}/payment/verify/${reference}`);
      const data = await res.json();

      if (res.ok && data.status === 'success') {
        setStatus('success');
        setMessage('Payment successful! Your subscription is active.');
        
        // Auto-redirect after 3 seconds
        setTimeout(() => {
           window.location.href = '/dashboard'; 
        }, 3000);
      } else {
        setStatus('failed');
        setMessage(data.message || 'Transaction could not be verified.');
      }
    } catch (error) {
      setStatus('failed');
      setMessage('Server error during verification. Please contact support.');
    }
  };

  const handleNavigation = (path: string) => {
      window.location.href = path;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-600">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
        
        {/* LOADING STATE */}
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <Loader2 size={32} className="text-slate-500 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Verifying Payment</h2>
            <p className="text-slate-500 text-sm">Please wait while we confirm your transaction...</p>
          </div>
        )}

        {/* SUCCESS STATE */}
        {status === 'success' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h2>
            <p className="text-slate-500 text-sm mb-6">{message}</p>
            <button 
              onClick={() => handleNavigation('/dashboard')}
              className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-500 transition w-full flex items-center justify-center gap-2"
            >
              Go to Dashboard <ArrowRight size={18}/>
            </button>
          </div>
        )}

        {/* FAILED STATE */}
        {status === 'failed' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <XCircle size={32} className="text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Verification Failed</h2>
            <p className="text-slate-500 text-sm mb-6">{message}</p>
            <div className="flex flex-col gap-3 w-full">
                <button 
                onClick={() => handleNavigation('/payment')}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition w-full"
                >
                Try Again
                </button>
                <a href="#" className="text-slate-500 text-sm hover:text-slate-700">Contact Support</a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}