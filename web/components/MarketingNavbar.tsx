"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, MessageCircle, X } from "lucide-react";

interface MarketingNavbarProps {
  whatsappLink?: string;
}

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "How it Works" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

const mobileExtraLinks = [
  { href: "/help", label: "Help Center" },
  { href: "/blog", label: "Blog" },
  { href: "/partners", label: "Partnership" },
];

export default function MarketingNavbar({
  whatsappLink = "https://wa.me/2349035664420?text=Hello%20Tallypadi",
}: MarketingNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-white/10 bg-[#101914]/95 shadow-sm shadow-stone-950/20 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1480px] items-center justify-between px-5 sm:px-10 lg:px-20">
        <Link href="/" className="relative block h-11 w-[158px] sm:w-[190px]" aria-label="TallyPadi home">
          <Image src="/tallypadi-logo.png" alt="TallyPadi logo" fill priority sizes="(max-width: 640px) 158px, 190px" className="object-contain" />
        </Link>

        <div className="hidden items-center gap-5 lg:flex xl:gap-7">
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href} className="text-xs font-black text-white transition hover:text-emerald-200 xl:text-sm">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-5 lg:flex xl:gap-7">
          <Link href="/login" className="text-xs font-black text-white transition hover:text-emerald-200 xl:text-sm">
            Login
          </Link>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm shadow-emerald-950/30 transition hover:bg-emerald-500"
          >
            <MessageCircle size={17} />
            Start on WhatsApp
          </a>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-black text-white lg:hidden"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          Menu
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="absolute left-4 right-4 top-[82px] overflow-hidden rounded-2xl border border-stone-200 bg-[#f7f0df] p-4 text-stone-950 shadow-2xl shadow-black/35 lg:hidden">
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{
            backgroundImage: "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 1px, transparent 1px), linear-gradient(45deg, rgba(245, 158, 11, 0.10) 1px, transparent 1px)",
            backgroundSize: "24px 24px, 36px 36px",
          }} />
          <div className="relative">
            <div className="mb-4 flex items-center justify-between border-b border-stone-300 pb-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-800">Menu</p>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-black text-stone-900">
                Login
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl border border-stone-200 bg-white/85 px-4 py-3 text-sm font-black text-stone-950 shadow-sm transition hover:border-emerald-400"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {mobileExtraLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl bg-emerald-950/5 px-3 py-3 text-center text-xs font-black text-emerald-900"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-900/20"
              onClick={() => setMobileMenuOpen(false)}
            >
              <MessageCircle size={17} />
              Start on WhatsApp
            </a>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
