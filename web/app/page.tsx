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
  Gift, // Added for Trial
  Shield, // Added for Oga Boss
  Crown // Added for Tycoon
} from 'lucide-react';

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
}


// --- CONFIGURATION ---
const DEFAULT_WHATSAPP_LINK = "https://wa.me/234XXXXXXXXXX?text=Hello%20Tallypadi"; 

// --- Hero Background Images ---
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1578575437130-527eed3abbec?q=80&w=2070&auto=format&fit=crop", 
];

// --- Custom Hook for Scroll Animations ---
// Use explicit generics and returns correct RefObject type
const useScrollAnimation = () => {
  const [isVisible, setIsVisible] = useState(false);
  // Specify type for the ref
  const domRef = useRef<HTMLDivElement>(null); 

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => setIsVisible(entry.isIntersecting));
    });
    const currentElement = domRef.current;
    if (currentElement) observer.observe(currentElement);
    return () => {
        if(currentElement) observer.unobserve(currentElement);
    };
  }, []);

  // Ensure the ref object is returned directly
  return [domRef, isVisible] as const;
};

const AnimatedSection = ({ children, className, animation = "fade-up" }: AnimatedSectionProps) => {
    // Use tuple destructuring for clean type inference
    const [ref, isVisible] = useScrollAnimation();
    const baseClass = `transition-all duration-1000 ease-out transform`;
    
    let activeClass = "";
    if (animation === "fade-up") {
        activeClass = isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-20";
    } else if (animation === "zoom-in") {
        activeClass = isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95";
    } else if (animation === "slide-right") {
        activeClass = isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-20";
    }

    return (
        // Pass the ref directly to the DOM element
        <div ref={ref} className={`${baseClass} ${activeClass} ${className}`}>
            {children}
        </div>
    );
};

export default function LandingPage() {
  const [currentBg, setCurrentBg] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState(DEFAULT_WHATSAPP_LINK);

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
        console.error("Failed to fetch settings, using default");
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
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="w-10 h-10 bg-gradient-to-tr from-emerald-500 to-green-400 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 group-hover:rotate-12 transition-transform duration-300">
                <Phone fill="currentColor" size={20} />
              </div>
              <span className="font-bold text-2xl tracking-tight text-white">Tallypadi</span>
            </div>
            
            {/* Desktop Links */}
            <div className="hidden md:flex space-x-8 items-center">
              <a href="#how-it-works" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition">How it Works</a>
              <a href="#features" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition">Features</a>
              <a href="#pricing" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition">Pricing</a>
              <a href="#gallery" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition">Showcase</a>
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <a href="/login" className="text-sm font-semibold text-white hover:text-emerald-400 transition">Login</a>
              <a href={whatsappLink} target="_blank" rel="noreferrer" className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-2.5 rounded-full font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] text-sm flex items-center gap-2 group hover:-translate-y-0.5">
                Register Now <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </a>
            </div>

            {/* Mobile Toggle */}
            <div className="md:hidden">
                <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-white hover:bg-slate-800 rounded-lg transition">
                    {mobileMenuOpen ? <X size={24}/> : <Menu size={24} />}
                </button>
            </div>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
            <div className="md:hidden bg-slate-900 border-t border-slate-800 p-4 flex flex-col gap-4 shadow-2xl absolute w-full animate-fade-in">
                 <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded">How it Works</a>
                 <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded">Features</a>
                 <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded">Pricing</a>
                 <a href="/login" className="block text-slate-300 hover:text-white font-medium p-2 hover:bg-slate-800 rounded">Login</a>
                 <a href={whatsappLink} target="_blank" rel="noreferrer" className="block text-center bg-emerald-500 text-white py-3 rounded-lg font-bold shadow-lg">Register on WhatsApp</a>
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
              More Profit. <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-green-300 to-teal-200 animate-gradient-x">Less Stress.</span>
            </h1>
            
            <p className="text-lg text-slate-300 mb-10 leading-relaxed max-w-lg font-light drop-shadow-md">
              Stop writing in notebooks. Manage your entire inventory, staff, and sales directly inside WhatsApp. It's as easy as chatting with a friend.
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
              <a href="#how-it-works" className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-full text-white bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1">
                How it Works
              </a>
            </div>
            
            <div className="mt-12 flex items-center gap-4 p-4 rounded-2xl bg-slate-900/50 border border-slate-800 backdrop-blur-sm w-fit">
               <div className="flex -space-x-3">
                   {[1,2,3,4].map(i => (
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
          <div className="hidden lg:block relative perspective-1000">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[100px] animate-pulse"></div>
             
             {/* Phone Body */}
             <div className="relative mx-auto border-gray-900 bg-gray-900 border-[10px] rounded-[3rem] h-[680px] w-[340px] shadow-2xl animate-[float_6s_ease-in-out_infinite] z-10 overflow-hidden ring-1 ring-white/20">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-b-xl z-20"></div>
                
                {/* Screen Content */}
                <div className="w-full h-full bg-[#efeae2] relative flex flex-col font-sans">
                    {/* Header */}
                    <div className="bg-[#075E54] h-24 pt-8 flex items-center px-4 text-white gap-3 shrink-0 shadow-md z-10">
                        <ArrowRight size={20} className="rotate-180 opacity-80"/>
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1">
                            <div className="w-full h-full bg-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold">TP</div>
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-base">Tallypadi Bot</h4>
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
                             <span className="block text-[10px] text-slate-400 text-right mt-1 flex justify-end items-center gap-1">10:00 AM <CheckCircle2 size={12} className="text-blue-500"/></span>
                        </div>

                        <div className="animate-[fade-in-up_0.5s_ease-out_0.5s_forwards] opacity-0 self-start bg-white p-3 rounded-xl rounded-tl-none shadow-sm max-w-[90%] text-sm text-slate-800 border border-slate-100">
                             <p className="font-bold text-emerald-700 mb-1 text-xs">Tallypadi</p>
                             ✅ <strong>Stock Added!</strong><br/>
                             Item: Rice<br/>
                             Qty: 50 Bags<br/>
                             Price: ₦40,000/bag
                             <span className="block text-[10px] text-slate-400 text-right mt-1">10:00 AM</span>
                        </div>

                        <div className="animate-[fade-in-up_0.5s_ease-out_2.5s_forwards] opacity-0 self-end bg-[#d9fdd3] p-3 rounded-xl rounded-tr-none shadow-sm max-w-[85%] text-sm text-slate-800 mt-2">
                             Sold 2 Rice
                             <span className="block text-[10px] text-slate-400 text-right mt-1 flex justify-end items-center gap-1">12:30 PM <CheckCircle2 size={12} className="text-blue-500"/></span>
                        </div>

                        <div className="animate-[fade-in-up_0.5s_ease-out_3.5s_forwards] opacity-0 self-start bg-white p-3 rounded-xl rounded-tl-none shadow-sm max-w-[90%] text-sm text-slate-800 border border-slate-100">
                             <p className="font-bold text-emerald-700 mb-1 text-xs">Tallypadi</p>
                             💰 <strong>Sale Recorded!</strong><br/>
                             You made: ₦80,000<br/>
                             Warning: Stock is low!
                             <span className="block text-[10px] text-slate-400 text-right mt-1">12:30 PM</span>
                        </div>
                    </div>
                    {/* Input Area */}
                    <div className="h-14 bg-white px-2 flex items-center gap-2">
                         <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">+</div>
                         <div className="flex-1 h-9 bg-slate-100 rounded-full px-4 flex items-center text-slate-400 text-sm">Type a message...</div>
                         <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white"><ArrowRight size={18}/></div>
                    </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* --- How It Works (Dark Theme for Contrast) --- */}
      <section id="how-it-works" className="py-24 bg-slate-900 relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="text-center mb-16">
            <span className="text-emerald-400 font-bold tracking-wider uppercase text-xs bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-900">Simple Process</span>
            <h2 className="text-3xl md:text-5xl font-bold mt-4">Automate your shop in <span className="text-emerald-400">3 minutes</span>.</h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <AnimatedSection animation="fade-up" className="relative group">
              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 hover:border-emerald-500/50 transition-all duration-500 hover:bg-slate-800 relative z-10 h-full">
                <div className="w-16 h-16 bg-slate-950 text-emerald-400 border border-slate-700 rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg group-hover:scale-110 transition-transform">1</div>
                <h3 className="text-xl font-bold text-white mb-3">Add Tallypadi</h3>
                <p className="text-slate-400 leading-relaxed">
                  Click the button to open WhatsApp. Save the number. No complex app downloads or installations.
                </p>
              </div>
            </AnimatedSection>

            {/* Step 2 */}
            <AnimatedSection animation="fade-up" className="relative group delay-100">
              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 hover:border-emerald-500/50 transition-all duration-500 hover:bg-slate-800 relative z-10 h-full">
                <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg shadow-emerald-600/20 group-hover:scale-110 transition-transform">2</div>
                <h3 className="text-xl font-bold text-white mb-3">Add Your Stock</h3>
                <p className="text-slate-400 leading-relaxed">
                  Tell the bot what you sell. E.g., <span className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-xs">"Add 50 bags of Rice at 40k"</span>. It remembers everything instantly.
                </p>
              </div>
            </AnimatedSection>

            {/* Step 3 */}
            <AnimatedSection animation="fade-up" className="relative group delay-200">
              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 hover:border-emerald-500/50 transition-all duration-500 hover:bg-slate-800 relative z-10 h-full">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-2xl font-bold mb-6 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">3</div>
                <h3 className="text-xl font-bold text-white mb-3">Chat to Manage</h3>
                <p className="text-slate-400 leading-relaxed">
                  Record sales as they happen. <span className="bg-slate-900 px-1.5 py-0.5 rounded text-blue-300 font-mono text-xs">"Sold 2 Rice"</span>. We calculate your profit and track inventory.
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
                    <span className="text-purple-600 font-bold tracking-wider uppercase text-xs bg-purple-50 px-3 py-1 rounded-full">Business Showcase</span>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-4">Manage your product photos & receipts.</h2>
                    <p className="text-slate-500 mt-4 text-lg">Keep your business organized. Upload product images, save payment receipts, and maintain a visual gallery of your inventory.</p>
                </div>
                <button className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-200 transition flex items-center gap-2">
                    <Camera size={18} /> View Full Gallery
                </button>
            </AnimatedSection>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-[500px]">
                <AnimatedSection animation="zoom-in" className="col-span-2 row-span-2 relative rounded-3xl overflow-hidden group shadow-lg">
                    <img src="https://images.unsplash.com/photo-1525904097878-94fb15817433?q=80&w=2070&auto=format&fit=crop" alt="Inventory" className="w-full h-full object-cover transition duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-6">
                        <span className="text-white font-bold text-xl">Organized Inventory</span>
                        <span className="text-slate-300 text-sm">Visual tracking</span>
                    </div>
                </AnimatedSection>
                <AnimatedSection animation="zoom-in" className="relative rounded-3xl overflow-hidden group shadow-lg delay-100">
                    <img src="https://images.unsplash.com/photo-1556740738-b6a63e27c4df?q=80&w=2070&auto=format&fit=crop" alt="Receipts" className="w-full h-full object-cover transition duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                        <span className="text-white font-semibold border border-white/30 px-4 py-2 rounded-full backdrop-blur-md">Receipts</span>
                    </div>
                </AnimatedSection>
                <AnimatedSection animation="zoom-in" className="relative rounded-3xl overflow-hidden group shadow-lg delay-200">
                    <img src="https://images.unsplash.com/photo-1580519542054-3a227237ce72?q=80&w=2074&auto=format&fit=crop" alt="Payment" className="w-full h-full object-cover transition duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                        <span className="text-white font-semibold border border-white/30 px-4 py-2 rounded-full backdrop-blur-md">Payments</span>
                    </div>
                </AnimatedSection>
                <AnimatedSection animation="zoom-in" className="col-span-2 md:col-span-2 relative rounded-3xl overflow-hidden group shadow-lg delay-300">
                     <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center p-6">
                        <Camera className="text-slate-600 mb-4" size={48} />
                        <h3 className="text-white font-bold text-xl mb-2">Upload Your Own</h3>
                        <p className="text-slate-400 text-sm mb-6 max-w-xs">Attach photos to your sales directly in WhatsApp to keep proof of every transaction.</p>
                        <a href={whatsappLink} className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1">Try it now <ArrowRight size={16}/></a>
                     </div>
                </AnimatedSection>
            </div>
         </div>
      </section>

      {/* --- Pricing Section (UPDATED) --- */}
      <section id="pricing" className="py-24 bg-slate-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection className="text-center mb-16">
                <span className="text-emerald-600 font-bold tracking-wider uppercase text-xs">Pricing Plans</span>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mt-2">Scale your business, your way.</h2>
                <p className="text-slate-500 mt-4 max-w-2xl mx-auto">Start with a free trial, then choose the perfect plan for your level of operation.</p>
            </AnimatedSection>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* 1. Free Trial */}
                <AnimatedSection animation="fade-up" className="bg-white p-6 rounded-3xl border-4 border-dashed border-green-200 flex flex-col shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]">
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
                        <PricingItem text="WhatsApp Bot Support" />
                        <PricingItem text="No credit card required" />
                    </ul>
                    <a href={whatsappLink} className="w-full block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-green-600/20 active:scale-95">
                        Start 7-Day Free Trial
                    </a>
                </AnimatedSection>

                {/* 2. Oga Boss - Highlighted */}
                <AnimatedSection animation="fade-up" className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col border-4 border-blue-400 transform md:-translate-y-6 transition-all hover:scale-[1.05] hover:shadow-blue-500/40">
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
                        <p className="text-slate-500 mt-2 text-sm">The essential plan for serious owners focused on maximizing solo profit.</p>
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
                    <a href="/payment?plan=OGA_BOSS" className="w-full block text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-600/20 active:scale-95">
                        Choose Oga Boss Plan
                    </a>
                </AnimatedSection>

                {/* 3. Tycoon */}
                <AnimatedSection animation="fade-up" className="bg-slate-900 p-6 rounded-3xl border border-slate-700 flex flex-col shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]">
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
                    <a href="/payment?plan=TYCOON" className="w-full block text-center  bg-blue-600 hover:bg-blue-700 text-slate-900 font-bold py-3.5 rounded-xl transition shadow-lg shadow-amber-500/20 active:scale-95">
                        Choose Tycoon Plan
                    </a>
                </AnimatedSection>
            </div>
        </div>
      </section>

      {/* --- CTA --- */}
      <section className="py-24 bg-slate-950 text-white relative overflow-hidden">
        {/* Abstract Shapes */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]"></div>

        <AnimatedSection animation="zoom-in" className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">Stop guessing your profit.</h2>
          <p className="text-slate-400 mb-10 text-lg md:text-xl font-light max-w-2xl mx-auto">
              Join 500+ Oga Bosses and Tycoons taking control of their business today. It takes less than 3 minutes to setup.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href={whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center px-10 py-5 text-xl font-bold rounded-full text-white bg-emerald-600 hover:bg-emerald-500 transition duration-300 shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)] hover:scale-105">
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
            <div className="flex items-center gap-2">
               <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <Phone className="text-emerald-500" size={20} />
               </div>
               <span className="font-bold text-xl text-slate-200">Tallypadi</span>
            </div>
            
            <div className="flex gap-8 text-sm font-medium">
                <a href="/policy" className="hover:text-emerald-400 transition">Privacy Policy</a>
                <a href="/terms" className="hover:text-emerald-400 transition">Terms of Service</a>
                <a href={whatsappLink} className="hover:text-emerald-400 transition">Contact Support</a>
            </div>
          </div>
          <div className="mt-12 text-center text-xs text-slate-600 border-t border-slate-900 pt-8">
            &copy; {new Date().getFullYear()} Tallypadi. Built with ❤️ for Nigerian SMEs.
          </div>
        </div>
      </footer>
      
      {/* Global Animation Styles */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-gradient-x {
            background-size: 200% 200%;
            animation: gradient-move 5s ease infinite;
        }
        @keyframes gradient-move {
            0% { background-position: 0% 50% }
            50% { background-position: 100% 50% }
            100% { background-position: 0% 50% }
        }
      `}</style>
    </div>
  );
}

// --- Sub-components ---

// FIX: Added explicit React.FC type assertion for components that rely on generics
const FeatureCard: React.FC<FeatureCardProps> = ({ icon, color, title, desc, badge = null }) => {
    const colorClasses: Record<string, string> = {
        emerald: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100",
        purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-100",
        red: "bg-red-50 text-red-600 group-hover:bg-red-100",
        blue: "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
        orange: "bg-orange-50 text-orange-600 group-hover:bg-orange-100",
        teal: "bg-teal-50 text-teal-600 group-hover:bg-teal-100",
    };

    return (
        <AnimatedSection animation="fade-up" className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-slate-200 hover:shadow-xl transition-all duration-300 group relative hover:-translate-y-1">
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
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
            unavailable 
                ? (light ? 'bg-slate-700 text-slate-500' : 'bg-gray-200 text-gray-400')
                : (light ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600')
        }`}>
            <CheckCircle2 size={12} strokeWidth={3} />
        </div>
        <span className={`text-sm ${unavailable ? 'line-through' : ''} ${light ? 'text-slate-300' : 'text-slate-600'}`}>{text}</span>
    </li>
);