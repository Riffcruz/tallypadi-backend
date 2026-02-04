'use client';

import React, { useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import Image from 'next/image';

interface MarketingNavbarProps {
  whatsappLink?: string;
}

export default function MarketingNavbar({ whatsappLink = 'https://wa.me/2349035664420?text=Hello%20Tallypadi' }: MarketingNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed w-full z-50 transition-all duration-300 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          {/* Logo */}
          <a href="/" className="cursor-pointer group">
            <div className="relative w-[180px] h-[44px] sm:w-[220px] sm:h-[54px] lg:w-[250px] lg:h-[60px] group-hover:scale-[1.02] transition-transform duration-300">
              <Image
                src="/tallypadi-logo.png"
                alt="TallyPadi logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </a>

          {/* Desktop Links */}
          <div className="hidden md:flex space-x-8 items-center">
            <a
              href="/"
              className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
            >
              Home
            </a>
            <a
              href="/#features"
              className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
            >
              Features
            </a>
            <a
              href="/free-invoice-generator"
              className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition"
            >
              Free Invoice
            </a>
            <a
              href="/#pricing"
              className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
            >
              Pricing
            </a>
            <a
              href="/#faq"
              className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
            >
              FAQ
            </a>
            <a
              href="/help"
              className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
            >
              Docs
            </a>
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <a href="/login" className="text-sm font-semibold text-white hover:text-emerald-400 transition">
              Login
            </a>
            <a
              href="/register"
              className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-2.5 rounded-full font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] text-sm flex items-center gap-2 group hover:-translate-y-0.5"
            >
              Signup <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </a>
          </div>

          {/* Mobile Toggle */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-white hover:bg-slate-800 rounded-lg transition"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-t border-slate-800 p-4 flex flex-col gap-4 shadow-2xl absolute w-full animate-fade-in">
          <a
            href="/#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
          >
            How it Works
          </a>
          <a
            href="/#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
          >
            Features
          </a>
          <a
            href="/free-invoice-generator"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
          >
            Free Invoice Generator
          </a>
          <a
            href="/help"
            className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
          >
            Docs
          </a>
          <a
            href="/#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
          >
            Pricing
          </a>
          <a
            href="/#gallery"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
          >
            Showcase
          </a>
          <a
            href="/#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
          >
            FAQ
          </a>
          <a href="/login" className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded">
            Login
          </a>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noreferrer"
            className="block text-center bg-emerald-500 text-white py-3 rounded-lg font-bold shadow-lg"
          >
            Register on WhatsApp
          </a>
        </div>
      )}
    </nav>
  );
}
