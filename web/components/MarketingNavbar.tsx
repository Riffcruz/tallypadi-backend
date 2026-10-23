"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Menu, MessageCircle, Store, X } from "lucide-react";

interface MarketingNavbarProps { whatsappLink?: string }

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];
const groups = [
  { title: "Explore TallyPadi", links: navLinks.slice(0, 3) },
  { title: "For your business", links: [
    { href: "/marketplace", label: "Marketplace" },
    { href: "/ai-bookkeeping-nigeria", label: "AI bookkeeping" },
    { href: "/help", label: "Help center" },
    { href: "/blog", label: "Business guides" },
  ] },
  { title: "Get to know us", links: navLinks.slice(3) },
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
  const linkClass = "rounded-lg text-sm font-semibold text-white/85 transition hover:text-amber-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300";

  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-white/10 bg-[#181816]/95 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1480px] items-center justify-between gap-6 px-5 sm:px-10 2xl:px-20">
        <Link href="/" className="relative block h-11 w-[158px] shrink-0" aria-label="TallyPadi home">
          <Image src="/tallypadi-logo.png" alt="TallyPadi" fill priority sizes="158px" className="object-contain" />
        </Link>
        <div className="hidden items-center gap-5 xl:flex">
          {navLinks.map(item => <Link key={item.href} href={item.href} className={linkClass}>{item.label}</Link>)}
        </div>
        <div className="hidden items-center gap-5 xl:flex">
          <Link href="/marketplace" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/10"><Store size={16} />Marketplace</Link>
          <Link href="/login" className={linkClass}>Log in</Link>
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-amber-300 px-4 py-3 text-sm font-bold text-stone-950 hover:bg-amber-200"><MessageCircle size={17} />Start on WhatsApp</a>
        </div>
        <button ref={trigger} type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-amber-300 xl:hidden" aria-label="Open navigation menu" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded={open}>
          <Menu size={21} />Menu
        </button>
      </div>
      <dialog ref={dialog} id="mobile-navigation" aria-labelledby="mobile-navigation-title" onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-sm flex-col overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-0 bg-[#f7f0df] p-0 text-stone-950 shadow-2xl backdrop:bg-stone-950/60 backdrop:backdrop-blur-sm [&[open]]:flex">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 id="mobile-navigation-title" className="text-lg font-bold tracking-tight">Explore TallyPadi</h2>
          <button type="button" onClick={close} autoFocus aria-label="Close navigation menu" className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-900"><X size={21} /></button>
        </div>
        <div className="shrink-0 px-6 py-2">
          {groups.map(group => <div key={group.title} className="border-b border-stone-200 py-4 last:border-0">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">{group.title}</p>
            {group.links.map(item => <Link key={item.href} href={item.href} onClick={close} className="flex min-h-11 items-center justify-between gap-4 rounded-lg px-2 text-base font-semibold hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-stone-900">{item.label}<ArrowRight size={16} className="text-stone-400" /></Link>)}
          </div>)}
        </div>
        <div className="shrink-0 space-y-3 border-t border-stone-200 bg-white px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <a href={whatsappLink} onClick={close} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#181816] px-4 font-bold text-white hover:bg-stone-700"><MessageCircle size={18} />Start on WhatsApp</a>
          <Link href="/login" onClick={close} className="flex min-h-11 items-center justify-center rounded-xl border border-stone-300 font-semibold hover:bg-stone-50">Already have an account? Log in</Link>
        </div>
      </dialog>
    </nav>
  );
}
