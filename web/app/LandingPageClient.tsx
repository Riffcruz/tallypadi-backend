'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  ArrowRight,
  Wand2,
  Users,
  FileText,
  BarChart3,
  PackageOpen,
  Lock,
  Menu,
  X,
  CheckCircle2,
  Star,
  Zap,
  Camera,
  TrendingUp,
  ShieldCheck,
  Gift,
  Shield,
  Crown,
  Quote,
  ChevronDown,
  HelpCircle,
} from 'lucide-react';
import Image from 'next/image';

// --- TYPES & INTERFACES ---

interface FeatureCardProps {
  icon: React.ReactNode;
  color: 'emerald' | 'purple' | 'red' | 'blue' | 'orange' | 'teal';
  title: string;
  desc: string;
  badge?: string | null;
}

interface PricingItemProps {
  text: string;
  light?: boolean;
  unavailable?: boolean;
}

interface AnimatedSectionProps {
  children: React.ReactNode;
  className?: string;
  animation?: 'fade-up' | 'zoom-in' | 'slide-right';
  style?: React.CSSProperties;
}

type Testimonial = {
  name: string;
  role: string;
  text: string;
  highlight?: string;
};

type Faq = {
  q: string;
  a: string;
};

// --- CONFIGURATION ---
const DEFAULT_WHATSAPP_LINK = 'https://wa.me/234XXXXXXXXXX?text=Hello%20Tallypadi';

// --- Hero Background Images ---
const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=2070&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=2070&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1578575437130-527eed3abbec?q=80&w=2070&auto=format&fit=crop',
];

// --- NEW: Testimonials + FAQ Data ---
const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Chioma',
    role: 'Mini-mart Owner (Lagos)',
    text: "Before Tallypadi, I was always guessing profit. Now I just chat 'Sold 2 rice' and it updates everything. My stress reduced.",
    highlight: 'Less stress, clearer profit',
  },
  {
    name: 'Tunde',
    role: 'Phone Accessories Vendor',
    text: 'The low stock alerts saved me multiple times. I used to run out of fast-moving items without knowing.',
    highlight: 'Low stock alerts',
  },
  {
    name: 'Aisha',
    role: 'Fashion & Beauty Store',
    text: 'I like that my staff can record sales and I can still see everything on the dashboard. It feels like proper business.',
    highlight: 'Staff + dashboard control',
  },
];

const FAQS: Faq[] = [
  {
  q: 'Do I need to download any app?',
  a: 'No. You can use TallyPadi directly inside WhatsApp—no app required. If you want an app-like experience, you can also install TallyPadi as a PWA (Add to Home Screen) and use it like a normal mobile app.',
},
{
    q: 'What is a PWA and how do I install it?',
    a: 'A PWA is a “website that behaves like an app.” Open TallyPadi in your browser, then tap “Add to Home Screen” (Android/Chrome) or “Share” → “Add to Home Screen” (iPhone/Safari). It will appear on your phone like a normal app.',
  },
  {
    q: 'Can I use TallyPadi on Android and iPhone?',
    a: 'Yes. TallyPadi works on Android, iPhone, and desktop. You can run it in WhatsApp, and you can also use the PWA on any phone.',
  },
  {
    q: 'How does it work inside WhatsApp?',
    a: 'You simply chat with TallyPadi like a person. Send messages like “Sold 2 bags of rice for 100k” or “Stock remaining” and it records your sales, stock, and profit automatically.',
  },
  {
    q: 'Can I record sales in Nigerian formats like 50k, 120k, 1.5m?',
    a: 'Yes. TallyPadi understands common formats like “50k”, “120k”, “1.5m”, and normal figures too.',
  },
  {
    q: 'Does it track stock automatically?',
    a: 'Yes. When you record a sale, stock reduces automatically. When you restock, it updates your quantity instantly.',
  },
  {
    q: 'Can I see my sales report anytime?',
    a: 'Yes. You can request daily/weekly/monthly reports inside WhatsApp or view your dashboard for a full breakdown.',
  },
  {
    q: 'Can I download receipts and PDFs?',
    a: 'Yes. You can download receipts for single transactions, and you can also download PDF reports when you need them.',
  },
  {
    q: 'Can multiple staff use the same shop account?',
    a: 'Yes. You can add staff and control what they can do, while everything still records into the same business account.',
  },
  {
    q: 'Is my data safe?',
    a: 'Yes. Your data is tied to your account and protected with secure authentication. Only you (and the staff you approve) can access it.',
  },
  {
    q: 'Do I need internet to use it?',
    a: 'Yes. Since it works through WhatsApp and the web dashboard, you’ll need an internet connection.',
  },
  {
    q: 'Can I use it for any kind of business?',
    a: 'Yes. It works for mini marts, provision shops, cosmetics, phone accessories, POS agents, pharmacies, fashion stores, and more.',
  },
  {
    q: 'How long does setup take?',
    a: 'Usually 2–5 minutes. Once you register, you can start recording immediately.',
  },
  {
    q: 'Can I change my currency?',
    a: 'Yes. You can set your currency (NGN, USD, GBP, etc.) in settings and all reports/receipts will follow it.',
  },
  {
    q: 'What if I make a mistake in a sale entry?',
    a: 'You can correct it by editing the transaction (or marking it undone if enabled). Your reports will stay accurate.',
  },
  {
    q: 'Can I record sales in Pidgin?',
    a: 'Yes. You can chat naturally (English / Pidgin or any Language) and the bot understands common sales and restock phrasing.',
  },
  {
    q: 'What happens after my 7-day trial?',
    a: 'You can choose a plan (Oga Boss or Tycoon). Your data remains safe and you continue from where you stopped.',
  },
  {
    q: 'Is my business data safe?',
    a: 'Your records are stored securely and only accessible to your account. You control who has access (especially on Tycoon).',
  },
];

// --- Custom Hook for Scroll Animations ---
const useScrollAnimation = () => {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => setIsVisible(entry.isIntersecting));
    });

    const currentElement = domRef.current;
    if (currentElement) observer.observe(currentElement);

    return () => {
      if (currentElement) observer.unobserve(currentElement);
    };
  }, []);

  return [domRef, isVisible] as const;
};

const AnimatedSection = ({
  children,
  className,
  animation = 'fade-up',
  style,
}: AnimatedSectionProps) => {
  const [ref, isVisible] = useScrollAnimation();
  const baseClass = `transition-all duration-1000 ease-out transform`;

  let activeClass = '';
  if (animation === 'fade-up') {
    activeClass = isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20';
  } else if (animation === 'zoom-in') {
    activeClass = isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95';
  } else if (animation === 'slide-right') {
    activeClass = isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-20';
  }

  return (
    <div ref={ref} style={style} className={`${baseClass} ${activeClass} ${className || ''}`}>
      {children}
    </div>
  );
};

// --- NEW: UI Components ---
const GlowStat = ({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) => {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl transition-all duration-500 hover:-translate-y-1 hover:border-emerald-500/40">
      <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-slate-300/90 uppercase">{label}</p>
          <p className="mt-2 text-4xl font-extrabold text-white tracking-tight">{value}</p>
          {sub ? <p className="mt-2 text-sm text-slate-300/80">{sub}</p> : null}
        </div>
        <div className="rounded-2xl border border-slate-700/60 bg-slate-950/40 p-3 text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.12)]">
          {icon}
        </div>
      </div>
    </div>
  );
};

const TestimonialCard = ({ t }: { t: Testimonial }) => {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/35 backdrop-blur-md p-7 shadow-xl transition-all duration-500 hover:-translate-y-1 hover:border-blue-400/40">
      <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-400/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-yellow-300">
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
          </div>

          <p className="mt-4 text-slate-200 leading-relaxed">“{t.text}”</p>

          {t.highlight ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">
              <Zap size={14} />
              {t.highlight}
            </div>
          ) : null}

          <div className="mt-6">
            <p className="font-bold text-white">{t.name}</p>
            <p className="text-sm text-slate-300/80">{t.role}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-slate-950/40 p-3 text-slate-200/80">
          <Quote size={20} />
        </div>
      </div>
    </div>
  );
};

const FaqItem = ({
  item,
  isOpen,
  onToggle,
}: {
  item: Faq;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  return (

    
    <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/35 backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-950/40 text-emerald-300">
            <HelpCircle size={18} />
          </span>
          <span className="font-bold text-white">{item.q}</span>
        </div>

        <ChevronDown
          size={18}
          className={`text-slate-300 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`grid transition-all duration-400 ease-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 text-slate-300/90 leading-relaxed">{item.a}</div>
        </div>
      </div>
    </div>
  );
};





export default function LandingPage() {
  const [currentBg, setCurrentBg] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState(DEFAULT_WHATSAPP_LINK);
  const [openFaq, setOpenFaq] = useState<number>(0);


  // Auto-rotate background
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBg((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Whatsapp Link
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
        const res = await fetch(`${API_URL}/admin/settings`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.whatsappUrl) {
            setWhatsappLink(data.whatsappUrl);
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings, using default');
      }
    };
    fetchSettings();
  }, []);

  return (
     
    <div className="bg-slate-50 text-slate-600 overflow-x-hidden font-sans selection:bg-emerald-500 selection:text-white">
      {/* --- Navbar --- */}
      <nav className="fixed w-full z-50 transition-all duration-300 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            {/* Logo */}


<div className="cursor-pointer group">
  <div className="relative w-[180px] h-[44px] sm:w-[220px] sm:h-[54px] lg:w-[250px] lg:h-[60px] group-hover:scale-[1.02] transition-transform duration-300">
    <Image
      src="/tallypadi-logo.png"
      alt="TallyPadi logo"
      fill
      className="object-contain"
      priority
    />
  </div>
</div>


            {/* Desktop Links */}
            <div className="hidden md:flex space-x-8 items-center">
              <a
                href="#how-it-works"
                className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
              >
                How it Works
              </a>
              <a
                href="#features"
                className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
              >
                Pricing
              </a>
              <a
                href="#gallery"
                className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
              >
                Showcase
              </a>
              <a
                href="#faq"
                className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
              >
                FAQ
              </a>
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <a href="/login" className="text-sm font-semibold text-white hover:text-emerald-400 transition">
                Login
              </a>
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-2.5 rounded-full font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] text-sm flex items-center gap-2 group hover:-translate-y-0.5"
              >
                Register Now <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
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
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
            >
              How it Works
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
            >
              Features
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
            >
              Pricing
            </a>
            <a
              href="#gallery"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded"
            >
              Showcase
            </a>
            <a
              href="#faq"
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

      {/* --- Hero Section (Full Screen) --- */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden bg-slate-950">
        {/* Background Image Slider */}
        {HERO_IMAGES.map((img, index) => (
          <div
            key={index}
            className={`absolute inset-0 bg-cover bg-center transition-all duration-[2000ms] ease-in-out ${
              index === currentBg ? 'opacity-40 scale-105' : 'opacity-0 scale-100'
            }`}
            style={{ backgroundImage: `url(${img})` }}
          />
        ))}

        {/* Heavy Cinematic Gradient Overlay for Contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-slate-950 z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950/40 to-slate-950 z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20 w-full grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Text Content */}
          <div className="text-white pt-10 lg:pt-0">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-bold mb-8 backdrop-blur-md animate-pulse">
              <span className="w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)]"></span>
              The #1 AI Accountant in Nigeria
            </div>

            <h1 className="text-5xl lg:text-7xl font-extrabold leading-[1.1] mb-6 tracking-tight drop-shadow-2xl">
              More Profit. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-green-300 to-teal-200 animate-gradient-x">
                Less Stress.
              </span>
            </h1>

            <p className="text-lg text-slate-300 mb-10 leading-relaxed max-w-lg font-light drop-shadow-md">
              Stop writing in notebooks. Manage your entire inventory, staff, and sales directly inside WhatsApp. It&apos;s as easy as chatting
              with a friend.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-full text-slate-900 bg-emerald-400 hover:bg-emerald-300 transition-all duration-300 shadow-[0_0_30px_-5px_rgba(52,211,153,0.6)] hover:-translate-y-1 hover:scale-105"
              >
                <Phone className="mr-2" size={20} fill="currentColor" /> Chat on WhatsApp
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-full text-white bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1"
              >
                How it Works
              </a>
            </div>

            <div className="mt-12 flex items-center gap-4 p-4 rounded-2xl bg-slate-900/50 border border-slate-800 backdrop-blur-sm w-fit">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-700 overflow-hidden">
                    <img src={`https://i.pravatar.cc/100?img=${i + 15}`} alt="User" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="flex flex-col">
                <span className="text-slate-200 font-semibold text-sm">Trusted by 500+ Vendors</span>
                <div className="flex text-yellow-400 text-xs gap-0.5">
                  <Star size={12} fill="currentColor" />
                  <Star size={12} fill="currentColor" />
                  <Star size={12} fill="currentColor" />
                  <Star size={12} fill="currentColor" />
                  <Star size={12} fill="currentColor" />
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Phone Mockup with 3D Float */}
          <div className="hidden lg:block relative" style={{ perspective: 1000 }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[100px] animate-pulse"></div>

            {/* Phone Body */}
            <div className="relative mx-auto border-gray-900 bg-gray-900 border-[10px] rounded-[3rem] h-[680px] w-[340px] shadow-2xl animate-[float_6s_ease-in-out_infinite] z-10 overflow-hidden ring-1 ring-white/20">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-b-xl z-20"></div>

              {/* Screen Content */}
              <div className="w-full h-full bg-[#efeae2] relative flex flex-col font-sans">
                {/* Header */}
                <div className="bg-[#075E54] h-24 pt-8 flex items-center px-4 text-white gap-3 shrink-0 shadow-md z-10">
                  <ArrowRight size={20} className="rotate-180 opacity-80" />
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1">
                    <div className="w-full h-full bg-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                      TP
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-base">TallyPadi</h4>
                    <p className="text-[10px] text-green-100 opacity-90">Online</p>
                  </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-opacity-10">
                  <div className="self-center bg-[#e1f3fb] text-slate-500 text-[10px] px-3 py-1 rounded-lg shadow-sm font-medium uppercase tracking-wide my-2 opacity-80">
                    Today
                  </div>

                  {/* Animated Messages */}
                  <div className="animate-[fade-in-up_0.5s_ease-out_forwards] self-end bg-[#d9fdd3] p-3 rounded-xl rounded-tr-none shadow-sm max-w-[85%] text-sm text-slate-800">
                    Add 50 bags of Rice at 40k
                    <span className="block text-[10px] text-slate-400 text-right mt-1 flex justify-end items-center gap-1">
                      10:00 AM <CheckCircle2 size={12} className="text-blue-500" />
                    </span>
                  </div>

                  <div className="animate-[fade-in-up_0.5s_ease-out_0.5s_forwards] opacity-0 self-start bg-white p-3 rounded-xl rounded-tl-none shadow-sm max-w-[90%] text-sm text-slate-800 border border-slate-100">
                    <p className="font-bold text-emerald-700 mb-1 text-xs">Tallypadi</p>
                    ✅ <strong>Stock Added!</strong>
                    <br />
                    Item: Rice
                    <br />
                    Qty: 50 Bags
                    <br />
                    Price: ₦40,000/bag
                    <span className="block text-[10px] text-slate-400 text-right mt-1">10:00 AM</span>
                  </div>

                  <div className="animate-[fade-in-up_0.5s_ease-out_2.5s_forwards] opacity-0 self-end bg-[#d9fdd3] p-3 rounded-xl rounded-tr-none shadow-sm max-w-[85%] text-sm text-slate-800 mt-2">
                    Sold 2 Rice
                    <span className="block text-[10px] text-slate-400 text-right mt-1 flex justify-end items-center gap-1">
                      12:30 PM <CheckCircle2 size={12} className="text-blue-500" />
                    </span>
                  </div>

                  <div className="animate-[fade-in-up_0.5s_ease-out_3.5s_forwards] opacity-0 self-start bg-white p-3 rounded-xl rounded-tl-none shadow-sm max-w-[90%] text-sm text-slate-800 border border-slate-100">
                    <p className="font-bold text-emerald-700 mb-1 text-xs">Tallypadi</p>
                    💰 <strong>Sale Recorded!</strong>
                    <br />
                    You made: ₦80,000
                    <br />
                    Warning: Stock is low!
                    <span className="block text-[10px] text-slate-400 text-right mt-1">12:30 PM</span>
                  </div>
                </div>

                {/* Input Area */}
                <div className="h-14 bg-white px-2 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">+</div>
                  <div className="flex-1 h-9 bg-slate-100 rounded-full px-4 flex items-center text-slate-400 text-sm">
                    Type a message...
                  </div>
                  <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white">
                    <ArrowRight size={18} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* /phone */}
        </div>
      </section>

      {/* --- How It Works (Dark Theme for Contrast) --- */}
      <section id="how-it-works" className="py-24 bg-slate-900 relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="text-center mb-16">
            <span className="text-emerald-400 font-bold tracking-wider uppercase text-xs bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-900">
              Simple Process
            </span>
            <h2 className="text-3xl md:text-5xl font-bold mt-4">
              Automate your shop in <span className="text-emerald-400">3 minutes</span>.
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <AnimatedSection animation="fade-up" className="relative group">
              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 hover:border-emerald-500/50 transition-all duration-500 hover:bg-slate-800 relative z-10 h-full">
                <div className="w-16 h-16 bg-slate-950 text-emerald-400 border border-slate-700 rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg group-hover:scale-110 transition-transform">
                  1
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Add Tallypadi</h3>
                <p className="text-slate-400 leading-relaxed">
                  Click the button to open WhatsApp. Save the number. No complex app downloads or installations.
                </p>
              </div>
            </AnimatedSection>

            {/* Step 2 */}
            <AnimatedSection animation="fade-up" className="relative group">
              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 hover:border-emerald-500/50 transition-all duration-500 hover:bg-slate-800 relative z-10 h-full">
                <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg shadow-emerald-600/20 group-hover:scale-110 transition-transform">
                  2
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Add Your Stock</h3>
                <p className="text-slate-400 leading-relaxed">
                  Tell the bot what you sell. E.g.,{' '}
                  <span className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-xs">
                    &quot;Add 50 bags of Rice at 40k&quot;
                  </span>
                  . It remembers everything instantly.
                </p>
              </div>
            </AnimatedSection>

            {/* Step 3 */}
            <AnimatedSection animation="fade-up" className="relative group">
              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 hover:border-emerald-500/50 transition-all duration-500 hover:bg-slate-800 relative z-10 h-full">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">
                  3
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Chat to Manage</h3>
                <p className="text-slate-400 leading-relaxed">
                  Record sales as they happen.{' '}
                  <span className="bg-slate-900 px-1.5 py-0.5 rounded text-blue-300 font-mono text-xs">
                    &quot;Sold 2 Rice&quot;
                  </span>
                  . We calculate your profit and track inventory.
                </p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* --- Features Grid --- */}
      <section id="features" className="py-24 bg-slate-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="text-center mb-16">
            <span className="text-emerald-600 font-bold tracking-wider uppercase text-xs">Powerful Features</span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mt-2">Everything a modern business needs.</h2>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Wand2 size={24} />}
              color="emerald"
              title="AI Powered Assistant"
              desc="Talk naturally in English or Pidgin. Say 'I sold bread' or 'How much profit today?' and our AI understands instantly."
            />
            <FeatureCard
              icon={<Users size={24} />}
              color="purple"
              title="Staff Management"
              badge="TYCOON PLAN"
              desc="Add your sales staff. They record sales on their own WhatsApp, and you see everything on your Master Dashboard."
            />
            <FeatureCard
              icon={<FileText size={24} />}
              color="red"
              title="Instant PDF Invoices"
              desc="Need a receipt? Tallypadi generates professional PDF invoices instantly that you can share with customers."
            />
            <FeatureCard
              icon={<BarChart3 size={24} />}
              color="blue"
              title="Advanced Analytics"
              desc="Login to our website for deep insights. Visual charts, best-selling items, and exportable Excel reports."
            />
            <FeatureCard
              icon={<PackageOpen size={24} />}
              color="orange"
              title="Low Stock Alerts"
              desc="Get notified before you run out of stock. Never miss a sale because you forgot to restock."
            />
            <FeatureCard
              icon={<Lock size={24} />}
              color="teal"
              title="Secure & Private"
              desc="Your business data is yours. We use bank-level encryption to ensure your sales records are 100% safe."
            />
          </div>
        </div>
      </section>

      {/* --- Gallery / Photo Edits Section --- */}
      <section id="gallery" className="py-24 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div className="max-w-2xl">
              <span className="text-purple-600 font-bold tracking-wider uppercase text-xs bg-purple-50 px-3 py-1 rounded-full">
                Business Showcase
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-4">Manage your product photos & receipts.</h2>
              <p className="text-slate-500 mt-4 text-lg">
                Keep your business organized. Upload product images, save payment receipts, and maintain a visual gallery of your inventory.
              </p>
            </div>
            <button className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-200 transition flex items-center gap-2">
              <Camera size={18} /> View Full Gallery
            </button>
          </AnimatedSection>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-[500px]">
            <AnimatedSection animation="zoom-in" className="col-span-2 row-span-2 relative rounded-3xl overflow-hidden group shadow-lg">
              <img
                src="https://images.unsplash.com/photo-1525904097878-94fb15817433?q=80&w=2070&auto=format&fit=crop"
                alt="Inventory"
                className="w-full h-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-6">
                <span className="text-white font-bold text-xl">Organized Inventory</span>
                <span className="text-slate-300 text-sm">Visual tracking</span>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="zoom-in" className="relative rounded-3xl overflow-hidden group shadow-lg">
              <img
                src="https://images.unsplash.com/photo-1556740738-b6a63e27c4df?q=80&w=2070&auto=format&fit=crop"
                alt="Receipts"
                className="w-full h-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                <span className="text-white font-semibold border border-white/30 px-4 py-2 rounded-full backdrop-blur-md">Receipts</span>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="zoom-in" className="relative rounded-3xl overflow-hidden group shadow-lg">
              <img
                src="https://images.unsplash.com/photo-1580519542054-3a227237ce72?q=80&w=2074&auto=format&fit=crop"
                alt="Payment"
                className="w-full h-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                <span className="text-white font-semibold border border-white/30 px-4 py-2 rounded-full backdrop-blur-md">Payments</span>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="zoom-in" className="col-span-2 md:col-span-2 relative rounded-3xl overflow-hidden group shadow-lg">
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center p-6">
                <Camera className="text-slate-600 mb-4" size={48} />
                <h3 className="text-white font-bold text-xl mb-2">Upload Your Own</h3>
                <p className="text-slate-400 text-sm mb-6 max-w-xs">
                  Attach photos to your sales directly in WhatsApp to keep proof of every transaction.
                </p>
                <a href={whatsappLink} className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1">
                  Try it now <ArrowRight size={16} />
                </a>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* --- Pricing Section --- */}
      <section id="pricing" className="py-24 bg-slate-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <span className="text-emerald-600 font-bold tracking-wider uppercase text-xs">Pricing Plans</span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mt-2">Scale your business, your way.</h2>
            <p className="text-slate-500 mt-4 max-w-2xl mx-auto">
              Start with a free trial, then choose the perfect plan for your level of operation.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 1. Free Trial */}
            <AnimatedSection
              animation="fade-up"
              className="bg-white p-6 rounded-3xl border-4 border-dashed border-green-200 flex flex-col shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-xl bg-green-50 text-green-600">
                  <Gift size={24} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">7-Day Trial</h3>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-extrabold text-green-600">₦0</span>
                <span className="text-slate-500 text-sm"> / 7 Days</span>
                <p className="text-slate-500 mt-2 text-sm">Experience the full power of Tallypadi with zero commitment.</p>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                <PricingItem text="Full Access to all features" />
                <PricingItem text="Single User Account" />
                <PricingItem text="Basic Web Dashboard" />
                <PricingItem text="WhatsApp Support" />
                <PricingItem text="No credit card required" />
              </ul>
              <a
                href={whatsappLink}
                className="w-full block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-green-600/20 active:scale-95"
              >
                Start 7-Day Free Trial
              </a>
            </AnimatedSection>

            {/* 2. Oga Boss - Highlighted */}
            <AnimatedSection
              animation="fade-up"
              className="relative bg-white p-6 rounded-3xl shadow-2xl flex flex-col border-4 border-blue-400 transform md:-translate-y-6 transition-all hover:scale-[1.05] hover:shadow-blue-500/40"
            >
              <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl shadow-md">
                BEST VALUE
              </div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-xl bg-blue-100 text-blue-600 shadow-xl">
                  <Shield size={24} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Oga Boss</h3>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-extrabold text-blue-600">₦2,500</span>
                <span className="text-slate-500 text-sm"> / month</span>
                <p className="text-slate-500 mt-2 text-sm">
                  The essential plan for serious owners focused on maximizing solo profit.
                </p>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                <PricingItem text="Unlimited Sales & Inventory" />
                <PricingItem text="Detailed Profit Calculation" />
                <PricingItem text="Advanced Dashboard Access" />
                <PricingItem text="1 User Account" />
                <PricingItem text="Email & WhatsApp Support" />
                <PricingItem text="Staff Management" unavailable />
                <PricingItem text="Automated PDF Reports" unavailable />
              </ul>
              <a
                href="/payment?plan=OGA_BOSS"
                className="w-full block text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-600/20 active:scale-95"
              >
                Choose Oga Boss Plan
              </a>
            </AnimatedSection>

            {/* 3. Tycoon */}
            <AnimatedSection
              animation="fade-up"
              className="bg-slate-900 p-6 rounded-3xl border border-slate-700 flex flex-col shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-xl bg-white text-amber-500 shadow-xl">
                  <Crown size={24} />
                </div>
                <h3 className="text-2xl font-bold text-white">Tycoon</h3>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-extrabold text-amber-400">₦5,000</span>
                <span className="text-slate-400 text-sm"> / month</span>
                <p className="text-slate-400 mt-2 text-sm">Full power plan designed for management teams and scaling operations.</p>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                <PricingItem text="Everything in Oga Boss" light />
                <PricingItem text="Multi-Staff Login (Up to 5)" light />
                <PricingItem text="Branded PDF Invoices & Export" light />
                <PricingItem text="Advanced Analytics Suite" light />
                <PricingItem text="Priority VIP Support" light />
              </ul>
              <a
                href="/payment?plan=TYCOON"
                className="w-full block text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-amber-500/20 active:scale-95"
              >
                Choose Tycoon Plan
              </a>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* --- Trust / Social Proof (Light-Dark, Lively) --- */}
      <section id="trust" className="py-24 relative overflow-hidden bg-slate-800 text-white">
        {/* Glow blobs */}
        <div className="absolute -top-24 right-0 w-[520px] h-[520px] bg-emerald-400/15 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 left-0 w-[520px] h-[520px] bg-blue-400/15 rounded-full blur-[120px]" />

        {/* Subtle texture */}
        <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_1px_1px,_rgba(255,255,255,0.8)_1px,_transparent_0)] [background-size:22px_22px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="grid lg:grid-cols-2 gap-10 items-start">
            <div>
              <span className="inline-flex items-center gap-2 text-emerald-200 font-bold tracking-wider uppercase text-xs bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-400/20">
                <TrendingUp size={14} />
                Trust & Results
              </span>

              <h2 className="text-3xl md:text-5xl font-extrabold mt-5 leading-tight">
                Built for speed, clarity, and{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-green-200 to-teal-100 animate-gradient-x">
                  daily profit tracking
                </span>
                .
              </h2>

              <p className="mt-5 text-slate-200/80 text-lg leading-relaxed max-w-xl">
                Tallypadi is designed for busy vendors. No spreadsheets. No stress. Just simple WhatsApp commands that keep your records accurate.
              </p>

              <div className="mt-7 space-y-3">
                {['Record sales/restock in seconds', 'See your stock balance anytime', 'Get clean reports for smarter decisions', 'Control staff access (Tycoon plan)'].map(
                  (t, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/20">
                        <CheckCircle2 size={14} />
                      </span>
                      <span className="text-slate-200/85">{t}</span>
                    </div>
                  )
                )}
              </div>

              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-emerald-400 text-slate-900 font-extrabold hover:bg-emerald-300 transition shadow-[0_0_30px_rgba(52,211,153,0.25)] hover:-translate-y-0.5"
                >
                  Start on WhatsApp <ArrowRight size={16} className="ml-2" />
                </a>

                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-white/5 border border-white/10 font-bold text-white hover:bg-white/10 transition hover:-translate-y-0.5"
                >
                  See Plans
                </a>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <AnimatedSection animation="zoom-in">
                <GlowStat label="Setup Time" value="~3 mins" sub="Add the bot + start chatting" icon={<Zap size={20} />} />
              </AnimatedSection>

              <AnimatedSection animation="zoom-in" className="delay-100">
                <GlowStat label="Access" value="24/7" sub="Your records on WhatsApp" icon={<ShieldCheck size={20} />} />
              </AnimatedSection>

              <AnimatedSection animation="zoom-in" className="delay-200">
                <GlowStat label="Trial" value="7 days" sub="No card required" icon={<Gift size={20} />} />
              </AnimatedSection>

              <AnimatedSection animation="zoom-in" className="delay-300">
                <GlowStat label="Owner Control" value="100%" sub="You decide who records sales" icon={<Lock size={20} />} />
              </AnimatedSection>
            </div>
          </AnimatedSection>

          {/* Testimonials */}
          <div className="mt-16">
            <AnimatedSection className="flex flex-col md:flex-row justify-between items-end gap-6 mb-10">
              <div className="max-w-2xl">
                <span className="text-blue-200 font-bold tracking-wider uppercase text-xs bg-blue-500/10 px-3 py-1 rounded-full border border-blue-400/20">
                  Vendor Stories
                </span>
                <h3 className="text-2xl md:text-4xl font-extrabold mt-4">Real feedback from busy shop owners</h3>
                <p className="text-slate-200/70 mt-3">
                  The goal is simple: help you track profit clearly and run your shop like a proper business.
                </p>
              </div>
            </AnimatedSection>

            <div className="grid lg:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t, idx) => (
                <AnimatedSection
                  key={idx}
                  animation="fade-up"
                  style={{ transitionDelay: `${idx * 90}ms` }}
                >
                  <TestimonialCard t={t} />
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- FAQ (Animated Accordion) --- */}
      <section id="faq" className="py-24 relative overflow-hidden bg-slate-900 text-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-emerald-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[140px]" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="text-center mb-12">
            <span className="text-emerald-300 font-bold tracking-wider uppercase text-xs bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-400/20">
              FAQ
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mt-4">Questions people ask before they start</h2>
            <p className="text-slate-300/80 mt-4">If you’re unsure about anything, this will clear it up fast.</p>
          </AnimatedSection>

          <div className="space-y-4">
            {FAQS.map((item, i) => (
              <AnimatedSection key={i} animation="fade-up" style={{ transitionDelay: `${i * 70}ms` }}>
                <FaqItem
                  item={item}
                  isOpen={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
                />
              </AnimatedSection>
            ))}
          </div>

          <div className="mt-10 text-center">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-emerald-500 hover:bg-emerald-400 transition font-extrabold shadow-[0_0_35px_rgba(16,185,129,0.25)] hover:-translate-y-0.5"
            >
              Ask on WhatsApp <ArrowRight size={16} className="ml-2" />
            </a>
            <p className="text-slate-400 text-sm mt-3">Quick replies — we’ll guide you through setup.</p>
          </div>
        </div>
      </section>

      {/* --- CTA --- */}
      <section className="py-24 bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]"></div>

        <AnimatedSection animation="zoom-in" className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">Stop guessing your profit.</h2>
          <p className="text-slate-400 mb-10 text-lg md:text-xl font-light max-w-2xl mx-auto">
            Join 500+ Oga Bosses and Tycoons taking control of their business today. It takes less than 3 minutes to setup.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-10 py-5 text-xl font-bold rounded-full text-white bg-emerald-600 hover:bg-emerald-500 transition duration-300 shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)] hover:scale-105"
            >
              Start Free Trial
            </a>
          </div>
          <p className="mt-6 text-slate-500 text-sm">No credit card required. Cancel anytime.</p>
        </AnimatedSection>
      </section>

      {/* --- Footer --- */}
      <footer className="bg-slate-950 text-slate-400 py-12 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
           <div className="cursor-pointer">
  <div className="relative w-[180px] h-[44px] sm:w-[220px] sm:h-[54px] lg:w-[250px] lg:h-[60px]">
    <Image
      src="/tallypadi-logo.png"
      alt="TallyPadi logo"
      fill
      className="object-contain"
      priority
    />
  </div>
</div>

            <div className="flex gap-8 text-sm font-medium">
              <a href="/policy" className="hover:text-emerald-400 transition">
                Privacy Policy
              </a>
              <a href="/policy#terms" className="hover:text-emerald-400 transition">
                Terms of Service
              </a>
              <a href={whatsappLink} className="hover:text-emerald-400 transition">
                Contact Support
              </a>
            </div>
          </div>
          <div className="mt-12 text-center text-xs text-slate-600 border-t border-slate-900 pt-8">
            &copy; {new Date().getFullYear()} Tallypadi. Built for SMEs.
          </div>
        </div>
      </footer>

      {/* Global Animation Styles */}
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes gradient-move {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-move 5s ease infinite;
        }

        .animate-fade-in {
          animation: fade-in 220ms ease-out both;
        }
      `}</style>
    </div>
  );
}

// --- Sub-components ---

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, color, title, desc, badge = null }) => {
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100',
    purple: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100',
    red: 'bg-red-50 text-red-600 group-hover:bg-red-100',
    blue: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
    orange: 'bg-orange-50 text-orange-600 group-hover:bg-orange-100',
    teal: 'bg-teal-50 text-teal-600 group-hover:bg-teal-100',
  };

  return (
    <AnimatedSection
      animation="fade-up"
      className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-slate-200 hover:shadow-xl transition-all duration-300 group relative hover:-translate-y-1"
    >
      {badge && (
        <div className="absolute top-4 right-4 bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded-full">
          {badge}
        </div>
      )}
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-colors ${colorClasses[color]}`}>
        {icon}
      </div>
      <h4 className="text-xl font-bold text-slate-900 mb-3">{title}</h4>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </AnimatedSection>
  );
};

const PricingItem: React.FC<PricingItemProps> = ({ text, light = false, unavailable = false }) => (
  <li className={`flex items-start gap-3 transition-opacity ${unavailable ? 'opacity-50' : ''}`}>
    <div
      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        unavailable
          ? light
            ? 'bg-slate-700 text-slate-500'
            : 'bg-gray-200 text-gray-400'
          : light
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-emerald-100 text-emerald-600'
      }`}
    >
      <CheckCircle2 size={12} strokeWidth={3} />
    </div>
    <span className={`text-sm ${unavailable ? 'line-through' : ''} ${light ? 'text-slate-300' : 'text-slate-600'}`}>
      {text}
    </span>
  </li>
);
