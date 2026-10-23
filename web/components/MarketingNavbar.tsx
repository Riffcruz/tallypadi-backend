"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, MessageCircle, Store, X } from "lucide-react";

interface MarketingNavbarProps { whatsappLink?: string }

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];
const mobileLinks = [
  { href: "/", label: "Return to home" },
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export default function MarketingNavbar({ whatsappLink = "https://wa.me/2349035664420?text=Hello%20Tallypadi" }: MarketingNavbarProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeOnDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [open]);

  const close = () => dialog.current?.close();
  const linkClass = "text-sm font-semibold text-stone-700 transition hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900";

  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-stone-900/10 bg-[#f7f0df]">
      <div className="mx-auto flex h-full max-w-[1480px] items-center justify-between gap-6 px-5 sm:px-10 2xl:px-20">
        <Link href="/" className="relative block h-11 w-[158px] shrink-0" aria-label="TallyPadi home">
          <Image src="/tallypadi-logo.png" alt="TallyPadi" fill priority sizes="158px" className="object-contain brightness-0 opacity-90" />
        </Link>
        <div className="hidden items-center gap-5 xl:flex">
          {navLinks.map(item => <Link key={item.href} href={item.href} className={linkClass}>{item.label}</Link>)}
        </div>
        <div className="hidden items-center gap-5 xl:flex">
          <Link href="/marketplace" className="inline-flex items-center gap-2 rounded-lg border border-stone-900/20 px-3 py-2.5 text-sm font-semibold text-stone-800 hover:bg-white/50"><Store size={16} />Marketplace</Link>
          <Link href="/login" className={linkClass}>Log in</Link>
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-amber-300 px-4 py-3 text-sm font-bold text-stone-950 hover:bg-amber-200"><MessageCircle size={17} />Start on WhatsApp</a>
        </div>
        <button ref={trigger} type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 px-1 text-sm font-semibold text-stone-800 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900 xl:hidden" aria-label="Open navigation menu" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded={open}>
          <Menu size={21} />Menu
        </button>
      </div>
      <dialog ref={dialog} id="mobile-navigation" aria-labelledby="mobile-navigation-title" onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[calc(100%_-_24px)] max-w-[340px] flex-col overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-0 bg-[#f7f0df] p-0 text-stone-950 shadow-2xl backdrop:bg-stone-950/50 [&[open]]:flex">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-stone-900/10 px-5 py-3">
          <h2 id="mobile-navigation-title" className="sr-only">Navigation</h2>
          <Link href="/" onClick={close} className="relative block h-9 w-[140px]" aria-label="TallyPadi home">
            <Image src="/tallypadi-logo.png" alt="TallyPadi" fill sizes="140px" className="object-contain brightness-0" />
          </Link>
          <button type="button" onClick={close} autoFocus aria-label="Close navigation menu" className="flex h-11 w-11 shrink-0 items-center justify-center text-stone-700 hover:text-black focus-visible:outline-2 focus-visible:outline-stone-900"><X size={22} /></button>
        </div>
        <div className="shrink-0 px-5 py-3">
          {mobileLinks.map(item => <Link key={item.href} href={item.href} onClick={close} className="flex min-h-11 items-center px-1 text-base font-medium hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-stone-900">{item.label}</Link>)}
        </div>
        <div className="mt-auto shrink-0 border-t border-stone-900/10 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-2 flex items-center gap-5 text-sm text-stone-600">
            <Link href="/help" onClick={close} className="inline-flex min-h-10 items-center hover:underline">Help center</Link>
            <Link href="/blog" onClick={close} className="inline-flex min-h-10 items-center hover:underline">Blog</Link>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Link href="/register" onClick={close} className="flex min-h-11 items-center justify-center bg-[#181816] text-sm font-semibold text-white hover:bg-stone-700">Register</Link>
            <Link href="/login" onClick={close} className="flex min-h-11 items-center justify-center border border-stone-900/25 text-sm font-semibold hover:bg-white/50">Log in</Link>
          </div>
          <a href={whatsappLink} onClick={close} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 bg-amber-300 px-4 text-sm font-semibold text-stone-950 hover:bg-amber-200"><MessageCircle size={17} />Start on WhatsApp</a>
        </div>
      </dialog>
    </nav>
  );
}
