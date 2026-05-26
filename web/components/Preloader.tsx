import React from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';

export default function Preloader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/90 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative flex flex-col items-center justify-center">
        {/* Glow behind the logo */}
        <div className="absolute -inset-8 rounded-full bg-emerald-500/10 blur-3xl animate-pulse"></div>
        
        {/* Logo Container */}
        <div className="relative mb-6 flex h-16 w-52 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 shadow-xl shadow-slate-900/10">
          <Image
            src="/tallypadi-logo.png"
            alt="TallyPadi logo"
            fill
            priority
            sizes="208px"
            className="object-contain p-3"
          />
        </div>

        {/* Loading Text & Spinner */}
        <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-full shadow-lg border border-slate-100">
          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
          <span className="text-sm font-bold text-slate-700 tracking-wide uppercase">Loading TallyPadi</span>
        </div>

      </div>
    </div>
  );
}
