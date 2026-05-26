import React from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';

export default function Preloader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#07120d] text-white animate-in fade-in duration-300">
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />

      <div className="relative flex w-full max-w-sm flex-col items-center px-6">
        <div className="relative mb-7 flex h-20 w-64 max-w-full items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.06] px-6 shadow-2xl shadow-emerald-950/60 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.10] to-transparent" />
          <Image
            src="/tallypadi-logo.png"
            alt="TallyPadi logo"
            fill
            priority
            sizes="256px"
            className="object-contain p-5"
          />
        </div>

        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/25 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-black uppercase tracking-[0.24em] text-emerald-50">Preparing workspace</span>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-200" />
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-emerald-300 via-lime-200 to-teal-300 animate-[preloader-slide_1.45s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes preloader-slide {
          0% {
            transform: translateX(-120%);
          }
          55% {
            transform: translateX(75%);
          }
          100% {
            transform: translateX(230%);
          }
        }
      `}</style>
    </div>
  );
}
