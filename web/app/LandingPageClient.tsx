"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  MapPin,
  Megaphone,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  Smartphone,
  Store,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import MarketingFooter from "../components/MarketingFooter";
import MarketingNavbar from "../components/MarketingNavbar";

const DEFAULT_WHATSAPP_LINK = "https://wa.me/2349035664420?text=Hello%20Tallypadi";

const handStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Trebuchet MS", cursive',
} satisfies React.CSSProperties;

type Feature = {
  title: string;
  text: string;
  icon: LucideIcon;
};

type Story = {
  name: string;
  business: string;
  image: string;
  quote: string;
};

type Plan = {
  name: string;
  price: string;
  note: string;
  cta: string;
  href: string;
  tone: "green" | "gold" | "dark";
  features: string[];
};

type SeoLink = {
  label: string;
  href: string;
};

type PublicSettingsResponse = {
  whatsappUrl?: unknown;
};

const heroFeatures: Feature[] = [
  {
    title: "Chat to record sales",
    text: "Just type like “Sold 2 bags of rice” and we log it.",
    icon: MessageCircle,
  },
  {
    title: "Instant PDF receipts",
    text: "Branded receipts for your customers. Professional.",
    icon: ReceiptText,
  },
  {
    title: "Smart inventory",
    text: "We track your stock automatically.",
    icon: PackageCheck,
  },
  {
    title: "POS machine ready",
    text: "Use it on phones, tablets, or compatible POS terminals.",
    icon: Smartphone,
  },
];

const trustItems = [
  { title: "Minimart", place: "Ibadan", icon: Building2 },
  { title: "POS Corner", place: "Lagos", icon: ReceiptText },
  { title: "Grace Stores", place: "Onitsha", icon: PackageCheck },
  { title: "Al-Mustapha", place: "Kano", icon: TrendingUp },
];

const stories: Story[] = [
  {
    name: "Mrs Chioma Okeke",
    business: "Chioma Ventures, Onitsha",
    image: "/merchant-story-chioma.svg",
    quote: "TallyPadi don change my life. I no dey write body for book again. Everything dey my WhatsApp!",
  },
  {
    name: "Mr Tunde",
    business: "Tunde Stores, Surulere",
    image: "/merchant-story-tunde.svg",
    quote: "The receipt feature worry me o! My customers love it. Looks very professional.",
  },
  {
    name: "Alhaji Musa",
    business: "Musa Global Store, Kano",
    image: "/merchant-story-musa.svg",
    quote: "Inventory tracking na the best. I always know wetin dey my shop.",
  },
];

const plans: Plan[] = [
  {
    name: "Free Trial",
    price: "₦0",
    note: "First 7 days",
    cta: "Try Free",
    href: DEFAULT_WHATSAPP_LINK,
    tone: "green",
    features: ["WhatsApp sales assistant", "Instant PDF receipts", "Smart inventory tracking", "1 user", "Up to 50 products"],
  },
  {
    name: "Oga Boss",
    price: "₦3,000",
    note: "/month",
    cta: "Choose Oga Boss",
    href: "/payment?plan=OGA_BOSS",
    tone: "gold",
    features: ["Everything in Free +", "Multi-branch", "Up to 5 staff", "Debtors reminders", "Full web dashboard"],
  },
  {
    name: "Tycoon",
    price: "₦5,000",
    note: "/month",
    cta: "Choose Tycoon",
    href: "/payment?plan=TYCOON",
    tone: "dark",
    features: ["Everything in Oga Boss +", "Unlimited staff", "Advanced reports", "Priority support", "Marketplace boosts"],
  },
];

const seoHighlights: Feature[] = [
  {
    title: "WhatsApp POS for Growing SMEs",
    text: "Record sales from chat, serve customers faster, and keep your daily business records in one simple flow.",
    icon: MessageCircle,
  },
  {
    title: "Inventory management made simple",
    text: "Track stock, prices, low-stock items, product movement, and shop inventory without carrying paper books around.",
    icon: PackageCheck,
  },
  {
    title: "Receipts, sales ledger and debtors",
    text: "Send PDF receipts, follow who paid, see who is owing, and understand cash flow across your business.",
    icon: ReceiptText,
  },
  {
    title: "Storefront and ads traffic",
    text: "Publish a shop front, then boost products so buyers land on your storefront or product page.",
    icon: Megaphone,
  },
];

const seoLinks: SeoLink[] = [
  { label: "WhatsApp receipt generator", href: "/whatsapp-receipt-generator" },
  { label: "Inventory stock management", href: "/inventory-stock-management" },
  { label: "Sales tracking ledger", href: "/sales-tracking-ledger" },
  { label: "Debtors tracking", href: "/accounts-receivable-debtors-tracking" },
  { label: "Product catalog shop link", href: "/product-catalog-shop-link-generator" },
  { label: "TallyPadi Marketplace", href: "/marketplace" },
];

type StepMessage = {
  from: "bot" | "user";
  text: string;
  time: string;
};

type SetupStep = {
  number: string;
  badge: string;
  title: string;
  text: string;
  icon: LucideIcon;
  messages: StepMessage[];
  cardClass: string;
  numberClass: string;
  titleClass: string;
};

const setupSteps: SetupStep[] = [
  {
    number: "1",
    badge: "STEP 1",
    title: "Start chatting",
    text: "Say Hello on WhatsApp. TallyPadi guides you through quick signup without long forms.",
    icon: MessageCircle,
    cardClass: "border-emerald-400/20",
    numberClass: "bg-orange-500 shadow-orange-500/30",
    titleClass: "text-white",
    messages: [
      { from: "bot", text: "Welcome! I'm TallyPadi. What is your email?", time: "09:58 AM" },
      { from: "user", text: "snow@email.com", time: "09:59 AM" },
      { from: "bot", text: "Account created! What is your shop name?", time: "09:59 AM" },
    ],
  },
  {
    number: "2",
    badge: "STEP 2",
    title: "Set shop details",
    text: "Add your shop name, currency, location, staff settings and storefront details so your public shop can go live.",
    icon: Store,
    cardClass: "border-white/10",
    numberClass: "bg-orange-500 shadow-orange-500/30",
    titleClass: "text-white",
    messages: [
      { from: "user", text: "My shop name is Wilson Furniture", time: "10:05 AM" },
      { from: "bot", text: "Shop saved: Wilson Furniture. Currency: NGN. You are ready to sell!", time: "10:05 AM" },
    ],
  },
  {
    number: "3",
    badge: "STEP 3",
    title: "Sell and track",
    text: "Add stock, record sales in plain English or Pidgin, send receipts, and let TallyPadi update inventory.",
    icon: PackageCheck,
    cardClass: "border-emerald-400/30",
    numberClass: "bg-orange-500 shadow-orange-500/30 rotate-[-5deg]",
    titleClass: "text-sky-300",
    messages: [
      { from: "user", text: "Add 20 cartons of Malt at 2500", time: "10:10 AM" },
      { from: "bot", text: "Stock added: Malt (20 ctns)", time: "10:10 AM" },
      { from: "user", text: "Sold 3 Malt", time: "10:15 AM" },
      { from: "bot", text: "Sale recorded. Stock updated.", time: "10:15 AM" },
    ],
  },
  {
    number: "4",
    badge: "STEP 4",
    title: "Run ads to your storefront",
    text: "Boost a product and TallyPadi can route ads to your shop front, marketplace listing, or product page for buyers to inspect and contact you.",
    icon: Megaphone,
    cardClass: "border-amber-400/30",
    numberClass: "bg-emerald-600 shadow-emerald-500/30 rotate-[4deg]",
    titleClass: "text-amber-300",
    messages: [
      { from: "user", text: "Boost my sofa set in Lagos", time: "10:25 AM" },
      { from: "bot", text: "Campaign request saved. Ads will send buyers to your shop front.", time: "10:25 AM" },
      { from: "bot", text: "Marketplace boost ready for admin review.", time: "10:26 AM" },
    ],
  },
];

function HeroImageSlot() {
  return (
    <div className="relative min-h-[440px] overflow-hidden bg-[#2a2119] md:min-h-[560px] lg:min-h-[620px]">
      <div className="absolute inset-0">
        <Image
          src="/TTALLYYPAADI%20BRAND%20IDENTITYArtboard%209-100.jpg"
          alt="Shop owner using TallyPadi WhatsApp POS and inventory management"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 58vw"
          className="object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(247,240,223,0.96)_0%,rgba(247,240,223,0.72)_20%,rgba(247,240,223,0)_48%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_35%,rgba(255,255,255,0.18),transparent_34%)]" />
      </div>

      <div className="absolute left-[14%] top-[38%] hidden max-w-[180px] rounded-md border border-emerald-800/25 bg-[#d8f3c7] p-3 text-xs text-stone-900 shadow-xl md:block">
        <p className="font-bold">You</p>
        <p className="mt-1 leading-5">Sold 2 bags of rice to Mr Tunde</p>
        <p className="mt-1 text-right text-[10px] text-stone-500">10:45 AM</p>
      </div>

      <div className="absolute bottom-[16%] left-[7%] w-[220px] rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-900 shadow-2xl">
        <p className="font-black">TallyPadi</p>
        <p className="mt-2 leading-6">
          <span className="text-emerald-700">✓</span> Sale recorded!
          <br />
          Total: ₦24,000
          <br />
          Stock updated.
        </p>
        <p className="mt-1 text-right text-[10px] text-stone-500">10:45 AM</p>
      </div>

      <div className="absolute bottom-[9%] right-[9%] hidden w-[230px] rounded-xl bg-white p-6 text-center text-xs text-stone-900 shadow-2xl lg:block">
        <p>Receipt</p>
        <p className="mt-4 font-black">TUNDE STORES</p>
        <div className="mt-6 space-y-3 text-left">
          <div className="flex justify-between gap-4">
            <span>2 Bags of Rice</span>
            <span>₦24,000</span>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-3 font-bold">
            <span>Total</span>
            <span>₦24,000</span>
          </div>
          <p>Date: 24 May 2025</p>
        </div>
        <p className="mt-5 text-[10px] text-stone-500">Powered by TallyPadi</p>
      </div>

      <div className="absolute right-5 top-5 rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase text-stone-600">
        Shop owner preview
      </div>
    </div>
  );
}

function HeroSection({ whatsappLink }: { whatsappLink: string }) {
  return (
    <section id="features" className="relative overflow-hidden bg-[#f7f0df]">
      <div
        className="pointer-events-none absolute inset-0 lg:hidden"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(16, 185, 129, 0.16) 1px, transparent 1px), linear-gradient(45deg, rgba(245, 158, 11, 0.11) 1px, transparent 1px), radial-gradient(circle at 85% 12%, rgba(16, 185, 129, 0.18), transparent 26%)",
          backgroundSize: "22px 22px, 34px 34px, 100% 100%",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
        }}
      />
      <div className="relative z-10 mx-auto grid max-w-[1480px] lg:grid-cols-[48%_52%]">
        <div className="relative px-5 pb-10 pt-8 sm:px-10 lg:px-20 lg:pb-8 lg:pt-14">
          <div className="pointer-events-none absolute -left-28 top-12 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl lg:hidden" />
          <div className="inline-flex items-center gap-2 border border-emerald-800/20 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-900">
            The Complete Shop on WhatsApp
          </div>

          <h1
            className="mt-5 max-w-[680px] text-[46px] font-black leading-[0.98] text-stone-950 sm:text-[64px] lg:text-[76px]"
            style={handStyle}
          >
            Run your shop,
            <br />
            right inside <span className="relative inline-block text-emerald-700">WhatsApp.<span className="absolute -bottom-1 left-0 h-2 w-full bg-emerald-600/35" /></span>
          </h1>

          <p className="mt-6 max-w-[540px] text-base font-semibold leading-7 text-stone-800">
            Record sales, send receipts, track stock and manage your business. All on WhatsApp. No stress.
          </p>

          <div className="mt-7 grid max-w-[680px] gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {heroFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="grid grid-cols-[32px_1fr] gap-3">
                  <Icon size={28} className="mt-1 text-emerald-800" />
                  <div>
                    <p className="text-xs font-black text-stone-950">{feature.title}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-5 text-stone-700">{feature.text}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-9 flex flex-col gap-4 sm:flex-row">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-7 py-4 text-sm font-black text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-800"
            >
              <MessageCircle size={18} />
              Start on WhatsApp
            </a>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-500 bg-white/40 px-7 py-4 text-sm font-black text-stone-950 transition hover:border-emerald-700 hover:text-emerald-800"
            >
              Try the Dashboard
              <Smartphone size={18} />
            </Link>
          </div>

          <div className="mt-8 flex max-w-[430px] items-start gap-4">
            <div className="h-12 w-12 rounded-bl-[28px] border-b-2 border-l-2 border-emerald-700" />
            <p className="text-xl font-black leading-7 text-stone-900" style={handStyle}>
              No POS machine required.
              <br />
              Works on phones and POS terminals too.
            </p>
          </div>
        </div>

        <HeroImageSlot />
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <section className="bg-[#101914] text-white">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6 px-5 py-7 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:px-20">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm font-bold">Trusted by 1,000+ shop owners globally</p>
          <div className="flex -space-x-2">
            {stories.map((story) => (
              <Image
                key={story.name}
                src={story.image}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full border-2 border-[#101914] bg-white object-cover"
              />
            ))}
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#101914] bg-amber-300 text-xs font-black text-stone-950">
              +9
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {trustItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-center gap-3">
                <Icon size={25} className="text-stone-100" />
                <div>
                  <p className="text-sm font-black">{item.title}</p>
                  <p className="text-xs text-stone-300">{item.place}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TeamPlaceholder() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ isDragging: false, startX: 0, currentRotation: 0, lastTime: 0, velocity: 0.1 });

  useEffect(() => {
    let animationFrame: number;
    const updateRotation = (time: number) => {
      const state = dragRef.current;
      if (!state.lastTime) state.lastTime = time;
      
      if (!state.isDragging) {
        state.currentRotation += state.velocity;
      }
      
      if (ringRef.current) {
        ringRef.current.style.transform = `rotate(${state.currentRotation}deg)`;
      }

      const items = ringRef.current?.querySelectorAll('.orbit-item');
      items?.forEach((item) => {
        (item as HTMLElement).style.transform = `rotate(${-state.currentRotation}deg)`;
      });

      animationFrame = requestAnimationFrame(updateRotation);
    };
    animationFrame = requestAnimationFrame(updateRotation);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current.isDragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.velocity = 0;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const deltaX = e.clientX - dragRef.current.startX;
    dragRef.current.currentRotation += deltaX * 0.4;
    dragRef.current.startX = e.clientX;
    dragRef.current.velocity = deltaX * 0.08; 
  };

  const handlePointerUp = () => {
    dragRef.current.isDragging = false;
    if (Math.abs(dragRef.current.velocity) < 0.1) {
      dragRef.current.velocity = dragRef.current.velocity >= 0 ? 0.1 : -0.1;
    }
  };

  const mixedItems = [
    { type: 'story', data: stories[0] },
    { type: 'feature', label: "WhatsApp POS", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 backdrop-blur-sm" },
    { type: 'story', data: stories[1] },
    { type: 'feature', label: "Inventory Sync", color: "bg-amber-500/10 text-amber-300 border-amber-500/30 backdrop-blur-sm" },
    { type: 'story', data: stories[2] },
    { type: 'feature', label: "PDF Receipts", color: "bg-sky-500/10 text-sky-300 border-sky-500/30 backdrop-blur-sm" },
  ];

  return (
    <div 
      className="relative min-h-[480px] overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-[#1b241e] to-[#0d120f] shadow-2xl touch-none flex items-center justify-center cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.15),transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
      
      {/* Central Core */}
      <div className="absolute z-10 flex h-[80px] w-[80px] items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-800 border-4 border-[#161c18] shadow-[0_0_50px_rgba(16,185,129,0.4)] pointer-events-none">
        <span className="text-[14px] font-black text-white uppercase tracking-widest drop-shadow-md">Padi</span>
      </div>

      {/* Orbit Ring */}
      <div ref={ringRef} className="absolute left-1/2 top-1/2 -ml-[160px] -mt-[160px] h-[320px] w-[320px] rounded-full border border-white/10 border-dashed">
        {mixedItems.map((item, i) => {
          const angle = (i / mixedItems.length) * 360;
          const radius = 160; 
          const x = Math.cos((angle * Math.PI) / 180) * radius;
          const y = Math.sin((angle * Math.PI) / 180) * radius;
          
          return (
            <div 
              key={i}
              className="absolute left-1/2 top-1/2 h-16 w-16 -ml-8 -mt-8"
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              <div className="orbit-item h-full w-full flex items-center justify-center">
                {item.type === 'story' && item.data ? (
                  <div className="relative flex flex-col items-center">
                    <Image
                      src={item.data.image}
                      alt=""
                      width={64}
                      height={64}
                      className="h-[64px] w-[64px] rounded-full border-4 border-[#1b241e] bg-emerald-100 object-cover shadow-2xl relative z-10"
                      draggable={false}
                    />
                    <div className="absolute top-[72px] w-[150px] rounded-2xl bg-white/95 backdrop-blur-xl p-3 shadow-2xl border border-white/50 pointer-events-none">
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 border-x-8 border-x-transparent border-b-8 border-b-white/95" />
                      <p className="text-[10px] font-bold leading-relaxed text-stone-800 line-clamp-3 text-center">
                        "{item.data.quote}"
                      </p>
                      <p className="mt-2 text-[8px] font-black text-emerald-700 uppercase tracking-widest text-center">
                        {item.data.name}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={`flex whitespace-nowrap px-4 py-2.5 items-center justify-center rounded-2xl border shadow-xl ${item.color}`}>
                    <span className="text-[11px] font-black uppercase tracking-wider">{item.label}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute left-5 top-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-300 pointer-events-none backdrop-blur-md">
       Tallypadi the problem solver
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <section id="about" className="bg-[#f7f0df] py-16">
      <div className="mx-auto grid max-w-[1480px] gap-10 px-5 sm:px-10 lg:grid-cols-[0.9fr_1.2fr_0.8fr] lg:px-20">
        <div>
          <h2 className="text-4xl font-black leading-tight text-stone-950 sm:text-5xl" style={handStyle}>
            We built TallyPadi
            <br />
            because we get you.
          </h2>
          <div className="mt-3 h-2 w-64 rounded-full bg-emerald-700" />
          <p className="mt-7 text-sm font-semibold leading-7 text-stone-800">
            We are a team of builders who have worked in retail and tech. We saw how difficult it was for small businesses to manage sales and stock using books or expensive POS machines.
          </p>
          <p className="mt-5 text-sm font-semibold leading-7 text-stone-800">
            So we built <strong>TallyPadi</strong> simple, affordable and built for the way you do business.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              "Made for growing businesses",
              "Works on phones and POS machines",
              "No hidden charges",
            ].map((item) => (
              <div key={item} className="flex min-h-16 items-center gap-3 rounded-md border border-emerald-900/20 bg-white/60 p-3">
                <Check size={18} className="text-emerald-800" />
                <p className="text-xs font-black leading-4 text-stone-800">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <TeamPlaceholder />

        <div className="relative rounded-md bg-[#fff8ec] p-7 shadow-xl ring-1 ring-stone-200">
          <div className="absolute -right-4 -top-3 h-9 w-20 rotate-12 bg-amber-100/80" />
          <div className="absolute right-5 top-2 h-10 w-5 rounded-full border-2 border-amber-700/60" />
          <h3 className="text-2xl font-black text-amber-700" style={handStyle}>Our Offices</h3>
          <div className="mt-6 space-y-5 text-sm leading-6 text-stone-800">
            <div>
              <p className="font-black">Global</p>
              <p>Available everywhere</p>
              <p>Serving shop owners across supported markets.</p>
            </div>
            <div>
              <p className="font-black">Support</p>
              <a className="font-bold text-emerald-800 hover:text-emerald-900" href="mailto:support@tallypadi.com">
                support@tallypadi.com
              </a>
            </div>
            <div>
              <p className="font-black">WhatsApp</p>
              <p>+234 903 566 4420</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialsStrip() {
  const [current, setCurrent] = useState(0);
  const active = stories[current];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrent((value) => (value + 1) % stories.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section id="testimonials" className="bg-[#1f1f1c] py-10 text-white">
      <div className="mx-auto grid max-w-[1480px] gap-8 px-5 sm:px-10 lg:grid-cols-[220px_1fr] lg:px-20">
        <div>
          <h2 className="text-3xl font-black leading-tight" style={handStyle}>
            From real
            <br />
            shop owners.
          </h2>
          <div className="mt-4 h-1.5 w-28 rounded-full bg-amber-400" />
          <p className="mt-4 text-xs font-semibold text-stone-400">Sample merchant stories until approved customer testimonials are added.</p>
        </div>

        <div className="hidden grid-cols-3 divide-x divide-white/15 lg:grid">
          {stories.map((story) => (
            <article key={story.name} className="grid grid-cols-[72px_1fr] gap-5 px-8">
              <Image src={story.image} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-full bg-white object-cover" />
              <div>
                <p className="text-4xl leading-4 text-white/40">“</p>
                <p className="text-sm font-semibold leading-6 text-stone-100">{story.quote}</p>
                <p className="mt-4 text-xs font-black">{story.name}</p>
                <p className="text-xs text-stone-400">{story.business}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.04] p-5 lg:hidden">
          <div className="flex items-start gap-4">
            <Image src={active.image} alt="" width={70} height={70} className="h-[70px] w-[70px] rounded-full bg-white object-cover" />
            <div>
              <p className="text-sm font-semibold leading-6">{active.quote}</p>
              <p className="mt-4 text-xs font-black">{active.name}</p>
              <p className="text-xs text-stone-400">{active.business}</p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
              onClick={() => setCurrent((current - 1 + stories.length) % stories.length)}
              aria-label="Previous story"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
              onClick={() => setCurrent((current + 1) % stories.length)}
              aria-label="Next story"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: (typeof plans)[number] }) {
  const planHref = plan.href || "/";
  const isExternal = planHref.startsWith("http");
  const isDark = plan.tone === "dark";
  const buttonClass = isDark
    ? "bg-stone-950 text-white hover:bg-stone-800"
    : "bg-emerald-700 text-white hover:bg-emerald-800";
  const titleClass = plan.tone === "gold" ? "text-amber-700" : "text-emerald-700";

  const card = (
    <div className="flex h-full min-h-[280px] flex-col rounded-lg border border-stone-300 bg-white p-6 shadow-lg shadow-stone-900/10">
      <p className={`text-sm font-black uppercase ${titleClass}`}>{plan.name}</p>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-4xl font-black text-stone-950">{plan.price}</span>
        <span className="pb-1 text-sm font-semibold text-stone-600">{plan.note}</span>
      </div>
      <ul className="mt-5 flex-1 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-xs font-semibold leading-5 text-stone-700">
            <Check size={14} className="mt-0.5 shrink-0 text-emerald-700" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {isExternal ? (
        <a href={planHref} target="_blank" rel="noreferrer" className={`mt-5 rounded-md px-4 py-3 text-center text-sm font-black transition ${buttonClass}`}>
          {plan.cta}
        </a>
      ) : (
        <Link href={planHref} className={`mt-5 rounded-md px-4 py-3 text-center text-sm font-black transition ${buttonClass}`}>
          {plan.cta}
        </Link>
      )}
    </div>
  );

  return card;
}

function PricingBand({ whatsappLink }: { whatsappLink: string }) {
  const livePlans = plans.map((plan) => (plan.name === "Free Trial" ? { ...plan, href: whatsappLink } : plan));

  return (
    <section id="pricing" className="bg-[#f7f0df] py-14">
      <div className="mx-auto grid max-w-[1480px] gap-8 px-5 sm:px-10 lg:grid-cols-[260px_1fr_160px] lg:items-center lg:px-20">
        <div>
          <h2 className="text-4xl font-black leading-tight text-stone-950 sm:text-5xl" style={handStyle}>
            Simple pricing.
            <br />
            No wahala.
          </h2>
          <div className="mt-5 h-1.5 w-44 rounded-full bg-emerald-700" />
          <CircleDollarSign className="mt-8 text-stone-800" size={58} />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {livePlans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

        <p className="hidden text-2xl font-black leading-8 text-stone-950 lg:block" style={handStyle}>
          Cancel
          <br />
          anytime.
          <br />
          No long
          <br />
          story.
        </p>
      </div>
    </section>
  );
}

function StepPhoneMockup({ step, index }: { step: SetupStep; index: number }) {
  return (
    <div
      className="tally-step-phone relative mx-auto h-[390px] w-full max-w-[270px] overflow-hidden rounded-[36px] border-[8px] border-[#1a1c1e] bg-[#efeae2] shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
      style={{ "--float-delay": `${index * 180}ms` } as React.CSSProperties}
    >
      <div className="absolute left-1/2 top-0 z-30 h-7 w-32 -translate-x-1/2 rounded-b-3xl bg-[#1a1c1e]" />
      
      <div className="relative z-20 flex h-[80px] items-end pb-3 gap-3 bg-gradient-to-r from-[#075e54] to-[#128c7e] px-4 text-white shadow-md">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-black backdrop-blur-sm">
          TP
        </span>
        <div className="min-w-0 pb-0.5">
          <p className="text-[13px] font-black leading-tight">TallyPadi</p>
          <p className="text-[10px] text-emerald-100">Online</p>
        </div>
        <span className="ml-auto mb-1 rounded-full bg-black/20 px-2 py-0.5 text-[9px] font-black tracking-wider text-emerald-50 backdrop-blur-sm">
          {step.badge}
        </span>
      </div>

      <div className="absolute inset-x-0 top-0 h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] pointer-events-none" />

      <div className="relative z-10 flex h-[calc(100%-140px)] flex-col space-y-4 overflow-hidden p-4 pt-4">
        <div className="mx-auto w-fit rounded-lg bg-[#e1f3fb] px-3 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
          TODAY
        </div>

        {step.messages.map((message, messageIndex) => {
          const isUser = message.from === "user";
          return (
            <div
              key={`${step.number}-${messageIndex}`}
              className={`tally-chat-bubble relative max-w-[85%] px-3 py-2 text-[13px] leading-[1.4] shadow-sm ${
                isUser
                  ? "ml-auto rounded-2xl rounded-tr-sm bg-[#d9fdd3] text-slate-900"
                  : "mr-auto rounded-2xl rounded-tl-sm bg-white text-slate-900"
              }`}
              style={{ "--bubble-delay": `${index * 220 + messageIndex * 210 + 220}ms` } as React.CSSProperties}
            >
              {!isUser && <p className="mb-0.5 text-[10px] font-black text-[#075e54]">TallyPadi</p>}
              <p>{message.text}</p>
              <p className="mt-1 text-right text-[9px] text-slate-500 font-medium">
                {message.time} {isUser && <span className="text-blue-500">✓✓</span>}
              </p>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-2 bottom-2 z-20 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
           <span className="text-slate-400">☺</span>
           <span className="flex-1 truncate text-[13px] text-slate-400">Message</span>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm">
           <span className="text-lg">🎤</span>
        </span>
      </div>
    </div>
  );
}

function HowItWorksBand() {
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-[#0d120f] py-24 text-white">
      <style>{`
        @keyframes tally-step-card-in {
          from { opacity: 0; transform: translateY(34px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tally-chat-pop {
          from { opacity: 0; transform: translateY(14px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tally-phone-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .tally-step-card {
          opacity: 0;
          animation: tally-step-card-in 720ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          animation-delay: var(--delay);
        }
        .tally-step-phone {
          animation: tally-phone-float 5s ease-in-out infinite;
          animation-delay: var(--float-delay);
        }
        .tally-chat-bubble {
          opacity: 0;
          animation: tally-chat-pop 520ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          animation-delay: var(--bubble-delay);
        }
        @media (prefers-reduced-motion: reduce) {
          .tally-step-card,
          .tally-step-phone,
          .tally-chat-bubble {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.15),transparent_40%),radial-gradient(circle_at_100%_100%,rgba(245,158,11,0.1),transparent_40%)]" />
      <div 
        className="absolute inset-0 opacity-[0.15]" 
        style={{ 
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)', 
          backgroundSize: '32px 32px' 
        }} 
      />

      <div className="relative z-10 mx-auto max-w-[1480px] px-5 sm:px-10 lg:px-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-400 backdrop-blur-md">
            How it works
          </div>
          <h2 className="mt-6 text-4xl font-black leading-tight sm:text-6xl" style={handStyle}>
            Get your shop running in <span className="text-emerald-400">5 minutes.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base font-semibold leading-relaxed text-stone-300">
            Start with WhatsApp, publish a storefront, add products, then boost them. TallyPadi can send buyers from Marketplace, Meta, TikTok and Google ads straight to your shop front or product page.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-4">
          {setupSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article
                key={step.title}
                className={`tally-step-card group relative rounded-[32px] border bg-white/[0.02] p-6 shadow-2xl backdrop-blur-xl transition-all hover:-translate-y-2 hover:bg-white/[0.04] hover:shadow-emerald-900/20 ${step.cardClass}`}
                style={{ "--delay": `${index * 160}ms` } as React.CSSProperties}
              >
                <div className="absolute inset-0 rounded-[32px] bg-gradient-to-b from-white/[0.08] to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none" />
                
                <StepPhoneMockup step={step} index={index} />
                
                <div className="relative z-10 mt-10">
                  <div className="flex items-center gap-4">
                    <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-lg ${step.numberClass}`}>
                      {step.number}
                    </span>
                    <Icon size={32} className="text-emerald-300" />
                  </div>
                  <h3 className={`mt-6 text-2xl font-black tracking-tight ${step.titleClass}`}>{step.title}</h3>
                  <p className="mt-4 text-[15px] font-medium leading-relaxed text-stone-400">{step.text}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BusinessManagementSeoBand() {
  return (
    <section className="bg-[#f7f0df] py-14">
      <div className="mx-auto grid max-w-[1480px] gap-9 px-5 sm:px-10 lg:grid-cols-[0.85fr_1.15fr] lg:px-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/20 bg-white/70 px-3 py-1 text-xs font-black text-emerald-900">
            <MapPin size={14} />
            Global Reach
          </div>
          <h2 className="mt-4 text-4xl font-black leading-tight text-stone-950 sm:text-5xl" style={handStyle}>
            Business management
            <br />
            for real shops.
          </h2>
          <div className="mt-4 h-1.5 w-52 rounded-full bg-emerald-700" />
          <p className="mt-6 max-w-[560px] text-sm font-semibold leading-7 text-stone-800">
            TallyPadi is built for business owners globally who need a simple way to manage sales, inventory, receipts, debtors, staff, storefronts and reports. Start from WhatsApp, use the web dashboard when you need more control, or run it on compatible POS machines in your shop.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["WhatsApp POS", "Inventory management", "Sales tracking", "Debtor management", "Business reports"].map((keyword) => (
              <span key={keyword} className="rounded-full border border-stone-300 bg-white/70 px-3 py-1 text-xs font-black text-stone-800">
                {keyword}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            {seoHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-md border border-stone-300 bg-white/75 p-5 shadow-sm">
                  <Icon size={26} className="text-emerald-800" />
                  <h3 className="mt-4 text-base font-black text-stone-950">{item.title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-stone-700">{item.text}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-6 rounded-md border border-emerald-900/20 bg-[#fff8ec] p-5">
            <p className="text-sm font-black text-stone-950">Explore business tools</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {seoLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href || "/"}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-black text-stone-800 transition hover:border-emerald-700 hover:text-emerald-800"
                >
                  {link.label}
                  <ArrowRight size={13} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [whatsappLink, setWhatsappLink] = useState(DEFAULT_WHATSAPP_LINK);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://tallypadi.com/api";
        const response = await fetch(`${apiUrl}/admin/settings`);
        if (!response.ok) return;

        const data = (await response.json()) as PublicSettingsResponse;
        const nextWhatsappLink = typeof data.whatsappUrl === "string" ? data.whatsappUrl.trim() : "";
        if (nextWhatsappLink) setWhatsappLink(nextWhatsappLink);
      } catch {
        setWhatsappLink(DEFAULT_WHATSAPP_LINK);
      }
    };

    fetchSettings();
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f0df] text-stone-950 selection:bg-emerald-700 selection:text-white">
      <MarketingNavbar whatsappLink={whatsappLink} />
      <main className="pt-[72px]">
        <HeroSection whatsappLink={whatsappLink} />
        <TrustStrip />
        <AboutSection />
        <TestimonialsStrip />
        <PricingBand whatsappLink={whatsappLink} />
        <HowItWorksBand />
        <BusinessManagementSeoBand />
      </main>
      <MarketingFooter />
    </div>
  );
}
