import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Preloader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/90 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative flex flex-col items-center justify-center">
        {/* Glow behind the logo */}
        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl animate-pulse"></div>
        
        {/* Logo Container */}
        <div className="relative w-20 h-20 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-600/30 overflow-hidden mb-6">
           {/* Shimmer Effect */}
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]"></div>
          
          <span className="text-white font-black text-4xl tracking-tighter relative z-10">T</span>
        </div>

        {/* Loading Text & Spinner */}
        <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-full shadow-lg border border-slate-100">
          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
          <span className="text-sm font-bold text-slate-700 tracking-wide uppercase">Loading TallyPadi</span>
        </div>

        {/* Floating Particles (CSS handled in global if needed, or simple spans) */}
        <div className="absolute top-10 -left-10 w-2 h-2 bg-emerald-400 rounded-full animate-ping opacity-75"></div>
        <div className="absolute bottom-10 -right-10 w-3 h-3 bg-teal-400 rounded-full animate-ping opacity-50" style={{ animationDelay: '0.5s' }}></div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
