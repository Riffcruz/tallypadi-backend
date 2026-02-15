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
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Store,
  Smartphone,
  LayoutDashboard
} from 'lucide-react';
import Image from 'next/image';
import StepShotWhatsAppLight from "../components/StepShot";
import MarketingNavbar from '../components/MarketingNavbar';
import MarketingFooter from '../components/MarketingFooter';


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
  animation?: 'fade-up' | 'zoom-in' | 'slide-right' | 'slide-left' | 'pop-in';
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
const DEFAULT_WHATSAPP_LINK = 'https://wa.me/2349035664420?text=Hello%20Tallypadi';

// --- Hero Background Images ---
const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1578575437130-527eed3abbec?q=80&w=2070&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?q=80&w=2070&auto=format&fit=crop',
  'https://static.dw.com/image/69290180_803.webp',
];


// --- NEW: Testimonials + FAQ Data ---
const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Mrs. Chioma Okeke',
    role: 'Owner, Chioma’s Provisions (Lagos)',
    text: "My brother, this thing has saved me. I used to write everything in a notebook and lose it. Now I just type 'Sold 2 rice' on WhatsApp and I see my profit immediately. No more headache.",
    highlight: 'No more notebooks',
  },
  {
    name: 'Mr. Tunde',
    role: 'Gadget World, Ikeja',
    text: 'I run my shop from home sometimes. I can see when my boy sells a phone charger instantly. The low stock alert is the best feature—it tells me before I run out.',
    highlight: 'Remote monitoring',
  },
  {
    name: 'Alhaji Musa',
    role: 'Musa & Sons Wholesalers',
    text: 'We have 3 branches. Before, balancing the books was a headache. Now TallyPadi combines everything. The POS feature helps my staff sell faster too.',
    highlight: 'Multi-branch control',
  },
];

const FAQS: Faq[] = [
  {
    q: 'Do I need to download any app?',
    a: 'No. You can use TallyPadi directly inside WhatsApp—no app required. It works on any device that has WhatsApp installed.',
  },
  {
    q: 'Does it generate receipts and invoices?',
    a: 'Yes. TallyPadi is a powerful WhatsApp receipt generator. You can generate professional receipts and invoices instantly and share them with your customers via WhatsApp.',
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
    q: 'Can I record sales in different currencies?',
    a: 'Yes. You can set your currency (NGN, USD, GBP, etc.) in settings and all reports/receipts will follow it.',
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
    q: 'Can multiple staff use the same shop account?',
    a: 'Yes. You can add staff and control what they can do, while everything still records into the same business account. Perfect for multi-branch businesses.',
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
    a: 'Yes. It works for retail shops, wholesalers, service businesses, restaurants, pharmacies, and enterprise teams.',
  },
  {
    q: 'How long does setup take?',
    a: 'Usually 2–5 minutes. Once you register, you can start recording immediately.',
  },
  {
    q: 'What if I make a mistake in a sale entry?',
    a: 'You can correct it by editing the transaction (or marking it undone if enabled). Your reports will stay accurate.',
  },
  {
    q: 'What happens after my 7-day trial?',
    a: 'You can choose a plan (Oga Boss or Tycoon). Your data remains safe and you continue from where you stopped.',
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
  } else if (animation === 'slide-left') {
    activeClass = isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20';
  } else if (animation === 'pop-in') {
    activeClass = isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-50';
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
    <div className="group relative overflow-hidden rounded-3xl border border-stone-700/60 bg-stone-900/40 backdrop-blur-md p-6 shadow-xl transition-all duration-500 hover:-translate-y-1 hover:border-emerald-500/40">
      <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-stone-300/90 uppercase">{label}</p>
          <p className="mt-2 text-4xl font-extrabold text-white tracking-tight">{value}</p>
          {sub ? <p className="mt-2 text-sm text-stone-300/80">{sub}</p> : null}
        </div>
        <div className="rounded-2xl border border-stone-700/60 bg-stone-950/40 p-3 text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.12)]">
          {icon}
        </div>
      </div>
    </div>
  );
};

const TestimonialCard = ({ t }: { t: Testimonial }) => {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-stone-700/60 bg-stone-900/50 backdrop-blur-md p-8 shadow-xl transition-all duration-500 hover:-translate-y-1 hover:border-emerald-500/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-1 text-yellow-400">
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
          </div>

          <p className="mt-6 text-stone-200 text-lg font-light leading-relaxed italic">“{t.text}”</p>

          <div className="mt-6 flex items-center gap-3">
             <div className="h-10 w-10 rounded-full bg-emerald-700/20 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/20">
               {t.name.charAt(0)}
             </div>
             <div>
                <p className="font-bold text-white">{t.name}</p>
                <p className="text-sm text-emerald-400/90">{t.role}</p>
             </div>
          </div>
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
    <div className="overflow-hidden rounded-2xl border border-stone-700/60 bg-stone-900/35 backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-700/60 bg-stone-950/40 text-emerald-300">
            <HelpCircle size={18} />
          </span>
          <span className="font-bold text-white">{item.q}</span>
        </div>

        <ChevronDown
          size={18}
          className={`text-stone-300 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`grid transition-all duration-400 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 text-stone-300/90 leading-relaxed">{item.a}</div>
        </div>
      </div>
    </div>
  );
};


const TestimonialSlider = ({ testimonials }: { testimonials: Testimonial[] }) => {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const length = testimonials.length;

  const nextSlide = () => {
    setCurrent(current === length - 1 ? 0 : current + 1);
  };

  const prevSlide = () => {
    setCurrent(current === 0 ? length - 1 : current - 1);
  };

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 6000);
    return () => clearInterval(interval);
  }, [current, isPaused, length]);

  return (
    <div 
      className="relative w-full max-w-4xl mx-auto px-4 sm:px-12"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="overflow-hidden relative min-h-[300px]">
        <div 
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {testimonials.map((t, idx) => (
            <div key={idx} className="w-full flex-shrink-0 px-2 sm:px-4">
               <TestimonialCard t={t} />
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={prevSlide}
        className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-full bg-stone-800/80 text-white hover:bg-emerald-500 transition-all border border-stone-700 hover:scale-110 z-10"
        aria-label="Previous testimonial"
      >
        <ChevronLeft size={24} />
      </button>

      <button 
        onClick={nextSlide}
        className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-full bg-stone-800/80 text-white hover:bg-emerald-500 transition-all border border-stone-700 hover:scale-110 z-10"
        aria-label="Next testimonial"
      >
        <ChevronRight size={24} />
      </button>

      <div className="flex justify-center mt-6 gap-2">
        {testimonials.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`transition-all duration-300 rounded-full ${current === idx 
                ? 'w-8 h-2 bg-emerald-500' 
                : 'w-2 h-2 bg-stone-700 hover:bg-stone-600'}
            `}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default function LandingPage() {
  const [currentBg, setCurrentBg] = useState(0);
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState(DEFAULT_WHATSAPP_LINK);
  const [openFaq, setOpenFaq] = useState<number>(0);

  const nextHeroSlide = () => {
    setCurrentBg((prev) => (prev + 1) % HERO_IMAGES.length);
  };

  const prevHeroSlide = () => {
    setCurrentBg((prev) => (prev === 0 ? HERO_IMAGES.length - 1 : prev - 1));
  };


  // Auto-rotate background
  useEffect(() => {
    if (isHeroPaused) return;
    const timer = setInterval(() => {
      setCurrentBg((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isHeroPaused]);

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
    <div className="bg-stone-50 text-stone-700 overflow-x-hidden font-sans selection:bg-emerald-500 selection:text-white">
      {/* --- Navbar --- */}
      <MarketingNavbar whatsappLink={whatsappLink} />

      {/* --- Hero Section (Full Screen) --- */}
      <section 
        className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden bg-stone-950"
        onMouseEnter={() => setIsHeroPaused(true)}
        onMouseLeave={() => setIsHeroPaused(false)}
      >
        {/* Background Image Slider */}
        {HERO_IMAGES.map((img, index) => (
          <div
            key={index}
            className={`absolute inset-0 bg-cover bg-center transition-all duration-[1500ms] ease-in-out ${index === currentBg ? 'opacity-40 scale-105' : 'opacity-0 scale-100'}`}
            style={{ backgroundImage: `url(${img})` }}
          />
        ))}

        {/* Cinematic Gradient Overlay - Warm & Deep */}
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950/90 via-stone-950/70 to-stone-950 z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-900/10 via-stone-950/40 to-stone-950 z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20 w-full grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Text Content */}
          <div className="text-white pt-10 lg:pt-0">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-900/30 border border-emerald-500/20 text-emerald-200 text-sm font-semibold mb-8 backdrop-blur-md">
              <span className="w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)]"></span>
              The All-in-One WhatsApp + Dashboard Business Manager
            </div>

            <h1 className="text-5xl lg:text-7xl font-extrabold leading-[1.1] mb-6 tracking-tight drop-shadow-2xl">
              Chat for Speed. <br />
              <span className="text-emerald-400">
                POS for Control.
              </span>
            </h1>

            <p className="text-lg text-stone-300 mb-10 leading-relaxed max-w-xl font-light drop-shadow-lg shadow-black">
              The only tool that combines <strong>WhatsApp simplicity</strong> with a powerful <strong>Point of Sale (POS) Terminal</strong>. From solo shops to multi-branch retail chains — record sales via chat or scan barcodes at the counter.
            </p>

            <ul className="mb-10 space-y-3 text-stone-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <span><strong className="text-white">Solo Vendors:</strong> Simple chat tracking in WhatsApp.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <span><strong className="text-white">Retail Chains:</strong> Full POS Terminal with barcode scanning.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <span><strong className="text-white">Everyone:</strong> No extra hardware lock-in. Works on any device.</span>
              </li>
            </ul>

            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-full text-white bg-emerald-600 hover:bg-emerald-500 transition-all duration-300 shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:-translate-y-1 hover:scale-105"
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
          </div>

          {/* Dynamic Phone Mockup with 3D Float */}
          <div className="hidden lg:block relative" style={{ perspective: 1000 }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[100px] animate-pulse"></div>

            {/* Phone Body */}
            <div className="relative mx-auto border-stone-900 bg-stone-900 border-[10px] rounded-[3rem] h-[680px] w-[340px] shadow-2xl animate-[float_6s_ease-in-out_infinite] z-10 overflow-hidden ring-1 ring-white/10">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-stone-900 rounded-b-xl z-20"></div>

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

        {/* --- Hero Slider Controls --- */}
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center items-center gap-6">
            <button 
              onClick={prevHeroSlide} 
              className="p-3 rounded-full bg-stone-900/40 hover:bg-emerald-500/80 text-white backdrop-blur-md transition-all border border-white/10 hover:border-emerald-500 group"
              aria-label="Previous slide"
            >
                <ChevronLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
            
            <div className="flex gap-3 bg-stone-900/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                {HERO_IMAGES.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentBg(idx)}
                    className={`h-2 rounded-full transition-all duration-500 ${idx === currentBg 
                        ? 'w-8 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' 
                        : 'w-2 bg-white/30 hover:bg-white/60'}
                    `}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
            </div>

            <button 
              onClick={nextHeroSlide} 
              className="p-3 rounded-full bg-stone-900/40 hover:bg-emerald-500/80 text-white backdrop-blur-md transition-all border border-white/10 hover:border-emerald-500 group"
              aria-label="Next slide"
            >
                <ChevronRight size={20} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
        </div>
      </section>

      {/* --- How It Works (Dark Theme for Contrast) --- */}
    <section id="how-it-works" className="py-24 bg-stone-900 relative overflow-hidden text-white">
  <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px]"></div>
  <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>

  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
    <AnimatedSection className="text-center mb-16">
      <span className="text-emerald-400 font-bold tracking-wider uppercase text-xs bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-900">
        Simple Setup
      </span>
      <h2 className="text-3xl md:text-5xl font-bold mt-4">
        Get your shop running in <span className="text-emerald-400">3 minutes</span>.
      </h2>
    </AnimatedSection>

    <div className="grid md:grid-cols-3 gap-8">
      {/* Step 1 */}
      <AnimatedSection animation="slide-right" className="relative group delay-100">
        <div className="bg-stone-800/50 p-8 rounded-3xl border border-stone-700 hover:border-emerald-500/30 transition-all duration-500 hover:bg-stone-800 relative z-10 h-full hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-500/5">
              <StepShotWhatsAppLight
        badge="STEP 1"
        bubbles={[
          { side: "bot", cardTitle: "Tallypadi", text: "👋 Welcome! I'm TallyPadi. Let's create your account.\nWhat is your email?", time: "09:58 AM" },
          { side: "user", text: "snow@email.com", time: "09:59 AM" },
          { side: "bot", cardTitle: "Tallypadi", text: "✅ Account created!\nWhat is your shop name?", time: "09:59 AM" },
        ]}
      />

          <div className="w-16 h-16 bg-stone-950 text-emerald-400 border border-stone-700 rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg group-hover:scale-110 transition-transform group-hover:rotate-3">
            1
          </div>

          <h3 className="text-xl font-bold text-white mb-3 group-hover:text-emerald-300 transition-colors">Start Chatting</h3>
          <p className="text-stone-400 leading-relaxed group-hover:text-stone-300 transition-colors">
            Just say "Hello" on WhatsApp. Our AI will guide you through a quick signup. No forms to fill.
          </p>
        </div>
      </AnimatedSection>

      {/* Step 2 */}
      <AnimatedSection animation="pop-in" className="relative group delay-200">
        <div className="bg-stone-800/50 p-8 rounded-3xl border border-stone-700 hover:border-emerald-500/30 transition-all duration-500 hover:bg-stone-800 relative z-10 h-full hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-500/5">
              <StepShotWhatsAppLight
        badge="STEP 2"
        bubbles={[
          { side: "user", text: "My shop name is Wilson Furniture", time: "10:05 AM" },
          { side: "bot", cardTitle: "Tallypadi", text: "🏠 Shop Saved: Wilson Furniture\nCurrency: NGN\n\nYou are ready to sell! 🚀", time: "10:05 AM" },
        ]}
        />

          <div className="w-16 h-16 bg-emerald-700 text-white rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg shadow-emerald-600/20 group-hover:scale-110 transition-transform group-hover:-rotate-3">
            2
          </div>

          <h3 className="text-xl font-bold text-white mb-3 group-hover:text-emerald-300 transition-colors">Set Shop Details</h3>
          <p className="text-stone-400 leading-relaxed group-hover:text-stone-300 transition-colors">
            Tell the bot your shop name and preferences. It configures your currency and settings instantly.
          </p>
        </div>
      </AnimatedSection>

      {/* Step 3 */}
      <AnimatedSection animation="slide-left" className="relative group delay-300">
        <div className="bg-stone-800/50 p-8 rounded-3xl border border-stone-700 hover:border-emerald-500/30 transition-all duration-500 hover:bg-stone-800 relative z-10 h-full hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-500/5">
         <StepShotWhatsAppLight
  badge="STEP 3"
  bubbles={[
    { side: "user", text: "Add 20 cartons of Malt at 2500", time: "10:10 AM" },
    { side: "bot", cardTitle: "Tallypadi", text: "✅ Stock Added: Malt (20 ctns)", time: "10:10 AM" },
    { side: "user", text: "Sold 3 Malt", time: "10:15 AM" },
    { side: "bot", cardTitle: "Tallypadi", text: "💰 Sale Recorded!", time: "10:15 AM" },
  ]}
/>

          <div className="w-16 h-16 bg-blue-700 text-white rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform group-hover:rotate-6">
            3
          </div>

          <h3 className="text-xl font-bold text-white mb-3 group-hover:text-blue-300 transition-colors">Sell & Track</h3>
          <p className="text-stone-400 leading-relaxed group-hover:text-stone-300 transition-colors">
            Start recording sales in plain English or Pidgin. TallyPadi tracks your inventory and calculates profit automatically.
          </p>
        </div>
      </AnimatedSection>
    </div>
  </div>
</section>

      {/* --- Pricing Section (Moved Up) --- */}
      <section id="pricing" className="py-24 bg-stone-100 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <span className="text-emerald-600 font-bold tracking-wider uppercase text-xs">Pricing Plans</span>
            <h2 className="text-3xl md:text-5xl font-bold text-stone-900 mt-2">Scale your business, your way.</h2>
                      <p className="text-stone-500 mt-4 max-w-2xl mx-auto">
                        Start with a free trial, then choose the perfect plan. From solo vendors to multi-branch empires, we have you covered.
                      </p>          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 1. Free Trial */}
            <AnimatedSection
              animation="fade-up"
              className="bg-white p-6 rounded-3xl border border-stone-200 flex flex-col shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                  <Gift size={24} />
                </div>
                <h3 className="text-2xl font-bold text-stone-900">7-Day Trial</h3>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-extrabold text-emerald-600">Free</span>
                <span className="text-stone-500 text-sm"> / 7 Days</span>
                <p className="text-stone-500 mt-2 text-sm">Experience the full power of Tallypadi with zero commitment.</p>
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
                className="w-full block text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-emerald-600/20 active:scale-95"
              >
                Start 7-Day Free Trial
              </a>
            </AnimatedSection>

            {/* 2. Oga Boss - Highlighted */}
            <AnimatedSection
              animation="fade-up"
              className="relative bg-white p-6 rounded-3xl shadow-2xl flex flex-col border-4 border-blue-500 transform md:-translate-y-6 transition-all hover:scale-[1.05] hover:shadow-blue-500/20"
            >
              <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl shadow-md">
                BEST VALUE
              </div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-xl bg-blue-50 text-blue-600 shadow-sm">
                  <Shield size={24} />
                </div>
                <h3 className="text-2xl font-bold text-stone-900">Oga Boss</h3>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-extrabold text-blue-600">₦3,000</span>
                <span className="text-stone-500 text-sm"> / month</span>
                <p className="text-stone-500 mt-2 text-sm">
                  The essential plan for serious owners focused on maximizing solo profit.
                </p>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                <PricingItem text="Unlimited Sales & Inventory" />
                <PricingItem text="Detailed Profit Calculation" />
                <PricingItem text="Web Dashboard Access" />
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
              className="bg-stone-900 p-6 rounded-3xl border border-stone-700 flex flex-col shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-xl bg-stone-800 text-amber-500 shadow-xl border border-stone-700">
                  <Crown size={24} />
                </div>
                <h3 className="text-2xl font-bold text-white">Tycoon</h3>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-extrabold text-amber-400">₦5,000</span>
                <span className="text-stone-400 text-sm"> / month</span>
                <p className="text-stone-400 mt-2 text-sm">Full power plan designed for management teams and scaling operations.</p>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                <PricingItem text="Everything in Oga Boss" light />
                <PricingItem text="Full POS Terminal Mode" light />
                <PricingItem text="Staff Login (Up to 10)" light />
                <PricingItem text="Online Shop Link" light />
                <PricingItem text="Branded PDF Invoices & Export" light />
                <PricingItem text="Advanced Analytics Suite" light />
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

      {/* --- Features Grid --- */}
      <section id="features" className="py-24 bg-stone-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="text-center mb-16">
            <span className="text-emerald-600 font-bold tracking-wider uppercase text-xs">Powerful Features</span>
            <h2 className="text-3xl md:text-5xl font-bold text-stone-900 mt-2">Everything a modern business needs.</h2>
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
              title="Dashboard & POS Terminal"
              desc="Login to the web for a full Point of Sale. Scan barcodes, fast checkout, visual analytics, and export to Excel."
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
              title="No Hardware Lock-in"
              desc="Use your existing phone, tablet, or laptop. No need to buy expensive POS machines. Works with standard barcode scanners."
            />
          </div>
        </div>
      </section>

      {/* --- Gallery / Photo Edits Section --- */}
      <section id="gallery" className="py-24 bg-white border-t border-stone-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div className="max-w-2xl">
              <span className="text-purple-600 font-bold tracking-wider uppercase text-xs bg-purple-50 px-3 py-1 rounded-full">
                Business Showcase
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-stone-900 mt-4">Manage your product photos & receipts.</h2>
              <p className="text-stone-500 mt-4 text-lg">
                Keep your business organized. Upload product images, save payment receipts, and maintain a visual gallery of your inventory.
              </p>
            </div>
            <button className="bg-stone-100 text-stone-700 px-6 py-3 rounded-xl font-semibold hover:bg-stone-200 transition flex items-center gap-2">
              <Camera size={18} /> View Full Gallery
            </button>
          </AnimatedSection>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-[500px]">
            <AnimatedSection animation="zoom-in" className="col-span-2 row-span-2 relative rounded-3xl overflow-hidden group shadow-lg">
              <img
                src="/TTALLYYPAADI BRAND IDENTITYArtboard 9-100.jpg"
                alt="Inventory"
                className="w-full h-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-6">
                <span className="text-white font-bold text-xl">Organized Inventory</span>
                <span className="text-stone-300 text-sm">Visual tracking</span>
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
                src="/banner.jpeg"
                alt="Payment"
                className="w-full h-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                <span className="text-white font-semibold border border-white/30 px-4 py-2 rounded-full backdrop-blur-md">Payments</span>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="zoom-in" className="col-span-2 md:col-span-2 relative rounded-3xl overflow-hidden group shadow-lg">
              <div className="absolute inset-0 bg-stone-900 flex flex-col items-center justify-center text-center p-6">
                <Camera className="text-stone-600 mb-4" size={48} />
                <h3 className="text-white font-bold text-xl mb-2">Upload Your Own</h3>
                <p className="text-stone-400 text-sm mb-6 max-w-xs">
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


      {/* --- Trust / Social Proof (Light-Dark, Lively) --- */}
      <section id="trust" className="py-24 relative overflow-hidden bg-stone-900 text-white">
        {/* Glow blobs */}
        <div className="absolute -top-24 right-0 w-[520px] h-[520px] bg-emerald-400/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 left-0 w-[520px] h-[520px] bg-blue-400/10 rounded-full blur-[120px]" />

        {/* Subtle texture */}
        <div className="absolute inset-0 opacity-[0.05] bg-[radial-gradient(circle_at_1px_1px,_rgba(255,255,255,0.8)_1px,_transparent_0)] [background-size:24px_24px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="grid lg:grid-cols-2 gap-10 items-start">
            <div>
              <span className="inline-flex items-center gap-2 text-emerald-200 font-bold tracking-wider uppercase text-xs bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-400/20">
                <TrendingUp size={14} />
                Trust & Results
              </span>

              <h2 className="text-3xl md:text-5xl font-extrabold mt-5 leading-tight">
                Built for speed, clarity, and{' '}
                <span className="text-emerald-400">
                  daily profit tracking
                </span>
                .
              </h2>

              <p className="mt-5 text-stone-300 text-lg leading-relaxed max-w-xl">
                Tallypadi is designed for busy vendors. No spreadsheets. No stress. Just simple WhatsApp commands that keep your records accurate.
              </p>

              <div className="mt-7 space-y-3">
                {['Record sales/restock in seconds', 'See your stock balance anytime', 'Get clean reports for smarter decisions', 'Control staff access (Tycoon plan)'].map(
                  (t, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                        <CheckCircle2 size={14} />
                      </span>
                      <span className="text-stone-200">{t}</span>
                    </div>
                  )
                )}
              </div>

              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition shadow-[0_0_30px_rgba(52,211,153,0.25)] hover:-translate-y-0.5"
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
                <p className="text-stone-300/80 mt-3">
                  The goal is simple: help you track profit clearly and run your shop like a proper business.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection className="mt-8" animation="fade-up">
               <TestimonialSlider testimonials={TESTIMONIALS} />
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* --- FAQ (Animated Accordion) --- */}
      <section id="faq" className="py-24 relative overflow-hidden bg-stone-900 text-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-emerald-500/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[140px]" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="text-center mb-12">
            <span className="text-emerald-300 font-bold tracking-wider uppercase text-xs bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-400/20">
              FAQ
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mt-4">Questions people ask before they start</h2>
            <p className="text-stone-300/80 mt-4">If you’re unsure about anything, this will clear it up fast.</p>
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
              className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-emerald-600 hover:bg-emerald-500 transition font-extrabold shadow-[0_0_35px_rgba(16,185,129,0.25)] hover:-translate-y-0.5"
            >
              Ask on WhatsApp <ArrowRight size={16} className="ml-2" />
            </a>
            <p className="text-stone-400 text-sm mt-3">Quick replies — we’ll guide you through setup.</p>
          </div>
        </div>
      </section>

      {/* --- CTA --- */}
      <section className="py-24 bg-stone-950 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]"></div>

        <AnimatedSection animation="zoom-in" className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">Know your profit down to the last Naira.</h2>
          <p className="text-stone-400 mb-10 text-lg md:text-xl font-light max-w-2xl mx-auto">
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
          <p className="mt-6 text-stone-500 text-sm">No credit card required. Cancel anytime.</p>
        </AnimatedSection>
      </section>

      {/* --- Footer --- */}
      <MarketingFooter />

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
    emerald: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100',
    purple: 'bg-purple-50 text-purple-700 group-hover:bg-purple-100',
    red: 'bg-red-50 text-red-700 group-hover:bg-red-100',
    blue: 'bg-blue-50 text-blue-700 group-hover:bg-blue-100',
    orange: 'bg-orange-50 text-orange-700 group-hover:bg-orange-100',
    teal: 'bg-teal-50 text-teal-700 group-hover:bg-teal-100',
  };

  return (
    <AnimatedSection
      animation="fade-up"
      className="bg-white p-6 rounded-3xl border border-stone-100 hover:border-stone-200 hover:shadow-xl transition-all duration-300 group relative hover:-translate-y-1"
    >
      {badge && (
        <div className="absolute top-4 right-4 bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded-full">
          {badge}
        </div>
      )}
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-colors ${colorClasses[color]}`}>
        {icon}
      </div>
      <h4 className="text-xl font-bold text-stone-900 mb-3">{title}</h4>
      <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
    </AnimatedSection>
  );
};

const PricingItem: React.FC<PricingItemProps> = ({ text, light = false, unavailable = false }) => (
  <li className={`flex items-start gap-3 transition-opacity ${unavailable ? 'opacity-50' : ''}`}>
    <div
      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${unavailable
          ? light
            ? 'bg-stone-700 text-stone-500'
            : 'bg-stone-200 text-stone-400'
          : light
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-emerald-100 text-emerald-700'
      }`}
    >
      <CheckCircle2 size={12} strokeWidth={3} />
    </div>
    <span className={`text-sm ${unavailable ? 'line-through' : ''} ${light ? 'text-stone-300' : 'text-stone-600'}`}>
      {text}
    </span>
  </li>
);