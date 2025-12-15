'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  MessageSquare,
  Check
} from 'lucide-react';

// --- CONFIGURATION ---
// 🟢 PLACEHOLDER FOR ADMIN: Change this URL in your Admin Settings or .env file
// If you have an API, you can fetch this value in the useEffect below.
const DEFAULT_WHATSAPP_LINK = "https://wa.me/234XXXXXXXXXX?text=Hello%20Tallypadi"; 

// --- Hero Background Images ---
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=2070&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1578575437130-527eed3abbec?q=80&w=2070&auto=format&fit=crop", 
];

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

  // 🟢 OPTIONAL: Fetch real WhatsApp link from backend
  useEffect(() => {
    // Example: fetch('/api/public/settings').then(res => res.json()).then(data => setWhatsappLink(data.whatsappUrl));
  }, []);

  return (
    <div className="bg-white text-slate-600 overflow-x-hidden selection:bg-green-100 selection:text-green-900 font-sans">
      
      {/* --- Navbar --- */}
      <nav className="fixed w-full z-50 transition-all duration-300 bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="w-10 h-10 bg-gradient-to-tr from-green-600 to-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-green-600/20 group-hover:scale-105 transition-transform duration-300">
                <Phone fill="currentColor" size={20} />
              </div>
              <span className="font-heading font-bold text-2xl tracking-tight text-slate-900">Tallypadi</span>
            </div>
            
            {/* Desktop Links */}
            <div className="hidden md:flex space-x-8 items-center">
              <Link href="#features" className="text-sm font-medium text-slate-600 hover:text-green-600 transition">Features</Link>
              <Link href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-green-600 transition">How it Works</Link>
              <Link href="/policy" className="text-sm font-medium text-slate-600 hover:text-green-600 transition">Privacy</Link>
              <Link href="/faq" className="text-sm font-medium text-slate-600 hover:text-green-600 transition">FAQ</Link>
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <Link href="/login" className="text-sm font-semibold text-slate-900 hover:text-green-600">Login</Link>
              <Link href={whatsappLink} target="_blank" className="bg-slate-900 hover:bg-black text-white px-6 py-2.5 rounded-full font-medium transition shadow-lg hover:shadow-xl text-sm flex items-center gap-2 group">
                Get Started <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {/* Mobile Toggle */}
            <div className="md:hidden">
                <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                    {mobileMenuOpen ? <X size={24}/> : <Menu size={24} />}
                </button>
            </div>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
            <div className="md:hidden bg-white border-t p-4 flex flex-col gap-4 shadow-xl animate-fade-in absolute w-full">
                 <Link href="#features" className="block text-sm font-medium p-2 hover:bg-slate-50 rounded">Features</Link>
                 <Link href="#how-it-works" className="block text-sm font-medium p-2 hover:bg-slate-50 rounded">How it Works</Link>
                 <Link href="/login" className="block text-sm font-medium p-2 hover:bg-slate-50 rounded">Login</Link>
                 <Link href={whatsappLink} target="_blank" className="block text-center bg-green-600 text-white py-3 rounded-lg font-bold">Chat to Start</Link>
            </div>
        )}
      </nav>

      {/* --- Hero Section --- */}
      <section className="relative min-h-[85vh] flex items-center justify-center pt-20 overflow-hidden bg-slate-900">
        
        {/* Background Image Slider with Better Overlay */}
        {HERO_IMAGES.map((img, index) => (
          <div 
            key={index}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-[2000ms] ease-in-out ${
              index === currentBg ? 'opacity-40' : 'opacity-0'
            }`}
            style={{ backgroundImage: `url(${img})` }}
          />
        ))}

        {/* Cinematic Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/40 to-transparent z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20 w-full grid lg:grid-cols-2 gap-16 items-center">
          
          {/* Text Content */}
          <div className="text-white pt-10 lg:pt-0">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-emerald-300 text-sm font-semibold mb-8 backdrop-blur-md shadow-inner animate-fade-in">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]"></span>
              The #1 AI Accountant in Nigeria
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-heading font-extrabold leading-[1.1] mb-6 tracking-tight">
              More Profit. <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-300">Less Stress.</span>
            </h1>
            
            <p className="text-lg text-slate-300 mb-10 leading-relaxed max-w-lg font-light">
              Stop writing in notebooks. Manage your entire inventory, staff, and sales directly inside WhatsApp. It's as easy as chatting with a friend.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link 
                href={whatsappLink} 
                target="_blank"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-bold rounded-full text-white bg-green-600 hover:bg-green-500 transition-all duration-300 shadow-[0_10px_30px_-10px_rgba(22,163,74,0.5)] hover:-translate-y-1 hover:shadow-[0_20px_40px_-10px_rgba(22,163,74,0.6)]"
              >
                <Phone className="mr-2" size={20} fill="currentColor" /> Chat on WhatsApp
              </Link>
              <Link href="/dashboard" className="inline-flex items-center justify-center px-8 py-4 text-base font-bold rounded-full text-white bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all duration-300 hover:-translate-y-1">
                View Dashboard
              </Link>
            </div>
            
            <div className="mt-10 flex items-center gap-6 text-sm text-slate-400 font-medium">
               <div className="flex -space-x-3">
                   {[1,2,3,4].map(i => (
                       <div key={i} className="w-9 h-9 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-xs overflow-hidden">
                          <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" />
                       </div>
                   ))}
               </div>
               <div className="flex flex-col">
                  <span className="text-white">Trusted by 500+ Vendors</span>
                  <span className="text-emerald-400 text-xs">★★★★★ 4.9/5 Rating</span>
               </div>
            </div>
          </div>

          {/* Dynamic Phone Mockup */}
          <div className="hidden lg:block relative perspective-1000" data-aos="fade-left">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/20 rounded-full blur-[120px] animate-pulse"></div>
             
             {/* Phone Container with Tilt Effect */}
             <div className="relative mx-auto border-gray-900 bg-gray-900 border-[12px] rounded-[3rem] h-[640px] w-[320px] shadow-2xl animate-float z-10 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-6 bg-gray-900 rounded-b-xl z-20"></div>
                
                {/* Screen */}
                <div className="w-full h-full bg-[#efeae2] relative flex flex-col font-sans">
                    
                    {/* WhatsApp Header */}
                    <div className="bg-[#075E54] h-20 pt-6 flex items-center px-4 text-white gap-3 shrink-0 shadow-md z-10">
                        <ArrowRight size={20} className="rotate-180 opacity-80"/>
                        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                            <img src="https://cdn-icons-png.flaticon.com/512/4712/4712109.png" className="w-6 h-6" alt="Bot" />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-base">Tallypadi Bot</h4>
                            <p className="text-[10px] text-green-100 opacity-90">Business Account</p>
                        </div>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-opacity-5">
                        
                        {/* Date Separator */}
                        <div className="self-center bg-[#e1f3fb] text-slate-500 text-[10px] px-3 py-1 rounded-lg shadow-sm font-medium uppercase tracking-wide my-2">
                            Today
                        </div>

                        {/* User Msg */}
                        <div className="self-end bg-[#d9fdd3] p-3 rounded-xl rounded-tr-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-sm text-slate-800 relative group">
                             I sold 5 bags of rice
                             <span className="block text-[10px] text-slate-400 text-right mt-1 flex justify-end items-center gap-1">10:02 AM <Check size={12} className="text-blue-500"/></span>
                             <div className="absolute -right-2 top-0 w-3 h-3 bg-[#d9fdd3] [clip-path:polygon(0_0,0%_100%,100%_0)]"></div>
                        </div>

                        {/* Bot Msg */}
                        <div className="self-start bg-white p-3 rounded-xl rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[90%] text-sm text-slate-800 relative">
                             <p className="font-bold text-green-700 mb-1 text-xs">Tallypadi</p>
                             ✅ <strong>Sale Recorded!</strong><br/>
                             <div className="my-2 border-l-2 border-green-500 pl-2 bg-slate-50 py-1 text-xs text-slate-600">
                                Item: Rice (5 Bags)<br/>
                                Revenue: ₦125,000
                             </div>
                             📉 Stock Left: <strong>12 Bags</strong><br/>
                             <span className="block text-[10px] text-slate-400 text-right mt-1">10:02 AM</span>
                             <div className="absolute -left-2 top-0 w-3 h-3 bg-white [clip-path:polygon(100%_0,100%_100%,0_0)]"></div>
                        </div>

                        {/* User Msg 2 */}
                        <div className="self-end bg-[#d9fdd3] p-3 rounded-xl rounded-tr-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-sm text-slate-800 relative mt-2">
                             How much profit today?
                             <span className="block text-[10px] text-slate-400 text-right mt-1 flex justify-end items-center gap-1">10:05 AM <Check size={12} className="text-blue-500"/></span>
                             <div className="absolute -right-2 top-0 w-3 h-3 bg-[#d9fdd3] [clip-path:polygon(0_0,0%_100%,100%_0)]"></div>
                        </div>

                         {/* Bot Msg 2 */}
                         <div className="self-start bg-white p-3 rounded-xl rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[90%] text-sm text-slate-800 relative">
                             <p className="font-bold text-green-700 mb-1 text-xs">Tallypadi</p>
                             📊 <strong>Daily Summary</strong><br/>
                             Sales: ₦240,000<br/>
                             Profit: ₦45,000<br/>
                             <div className="mt-2 flex gap-2">
                                <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-1 rounded border">View Full Report</span>
                             </div>
                             <span className="block text-[10px] text-slate-400 text-right mt-1">10:05 AM</span>
                             <div className="absolute -left-2 top-0 w-3 h-3 bg-white [clip-path:polygon(100%_0,100%_100%,0_0)]"></div>
                        </div>
                    </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* --- How It Works (New Section) --- */}
      <section id="how-it-works" className="py-24 bg-white relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-20 left-0 w-64 h-64 bg-green-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
        <div className="absolute bottom-20 right-0 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <span className="text-green-600 font-bold tracking-wider uppercase text-xs bg-green-50 px-3 py-1 rounded-full border border-green-100">Simple Process</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-slate-900 mt-4">Start managing in 3 minutes.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative group">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 relative z-10 h-full">
                <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xl font-bold mb-6 shadow-lg shadow-slate-900/20 group-hover:scale-110 transition-transform">1</div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Add Tallypadi</h3>
                <p className="text-slate-500 leading-relaxed">
                  Click the chat button to save our number. No app download required. Just say "Hello" on WhatsApp.
                </p>
              </div>
              {/* Connector Line (Desktop) */}
              <div className="hidden md:block absolute top-1/2 left-full w-full h-0.5 bg-gradient-to-r from-slate-200 to-transparent -translate-y-1/2 z-0"></div>
            </div>

            {/* Step 2 */}
            <div className="relative group">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 relative z-10 h-full">
                <div className="w-14 h-14 bg-green-600 text-white rounded-2xl flex items-center justify-center text-xl font-bold mb-6 shadow-lg shadow-green-600/20 group-hover:scale-110 transition-transform">2</div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Add Your Stock</h3>
                <p className="text-slate-500 leading-relaxed">
                  Tell the bot what you sell. E.g., <span className="bg-slate-100 px-1 rounded font-mono text-xs text-slate-700">"Add 50 bags of Rice at 40k"</span>. It remembers everything.
                </p>
              </div>
              {/* Connector Line (Desktop) */}
              <div className="hidden md:block absolute top-1/2 left-full w-full h-0.5 bg-gradient-to-r from-slate-200 to-transparent -translate-y-1/2 z-0"></div>
            </div>

            {/* Step 3 */}
            <div className="relative group">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 relative z-10 h-full">
                <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xl font-bold mb-6 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">3</div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Chat to Manage</h3>
                <p className="text-slate-500 leading-relaxed">
                  Record sales as they happen. <span className="bg-slate-100 px-1 rounded font-mono text-xs text-slate-700">"Sold 2 Rice"</span>. We calculate your profit automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Features Grid --- */}
      <section id="features" className="py-24 bg-slate-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <span className="text-green-600 font-bold tracking-wider uppercase text-xs">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-slate-900 mt-2">More than just a chat bot.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <FeatureCard 
              icon={<Wand2 size={24} />} 
              color="green"
              title="AI Powered Assistant"
              desc="Talk naturally. Say 'I sold bread' or 'How much did I make yesterday?' and our AI understands you instantly."
            />
            
            <FeatureCard 
              icon={<Users size={24} />} 
              color="purple"
              title="Staff Management"
              badge="TYCOON PLAN"
              desc="Add your sales boys and girls. They record sales on their own WhatsApp, and you see everything on your Master Dashboard."
            />

            <FeatureCard 
              icon={<FileText size={24} />} 
              color="red"
              title="Instant PDF Invoices"
              desc="Need to send a receipt? Tallypadi generates professional PDF invoices instantly that you can forward to customers."
            />

            <FeatureCard 
              icon={<BarChart3 size={24} />} 
              color="blue"
              title="Web Dashboard"
              desc="WhatsApp is great for entry, but login to our website for deep analytics, charts, and Excel exports."
            />

            <FeatureCard 
              icon={<PackageOpen size={24} />} 
              color="orange"
              title="Stock Alerts"
              desc="Get notified before you run out of stock. Tallypadi keeps an eye on your inventory so you never miss a sale."
            />

            <FeatureCard 
              icon={<Lock size={24} />} 
              color="teal"
              title="Secure & Private"
              desc="Your business data is yours. We use bank-level encryption to ensure your sales records are safe."
            />

          </div>
        </div>
      </section>

      {/* --- Pricing / CTA --- */}
      <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
        {/* Abstract Shapes */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-green-600/10 rounded-full blur-[100px] animate-blob"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>

        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl md:text-5xl font-heading font-bold mb-6">Stop guessing your profit.</h2>
          <p className="text-slate-400 mb-10 text-lg md:text-xl font-light">Join the Oga Bosses and Tycoons taking control of their business today.</p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href={whatsappLink} target="_blank" className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-full text-slate-900 bg-green-500 hover:bg-white transition duration-300 shadow-[0_0_40px_-10px_rgba(34,197,94,0.6)]">
              Start Free Trial
            </Link>
            <Link href="/policy" className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-full text-white border border-slate-700 hover:bg-slate-800 transition duration-300">
              Read Policy
            </Link>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="bg-slate-950 text-slate-400 py-12 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
               <div className="bg-slate-800 p-2 rounded-lg">
                  <Phone className="text-green-500" size={20} />
               </div>
               <span className="font-heading font-bold text-xl text-slate-200">Tallypadi</span>
            </div>
            
            <div className="flex gap-8 text-sm">
                <Link href="/policy" className="hover:text-white transition">Privacy</Link>
                <Link href="/policy#terms" className="hover:text-white transition">Terms</Link>
                <Link href="#" className="hover:text-white transition">Support</Link>
            </div>
          </div>
          <div className="mt-8 text-center text-xs text-slate-600 border-t border-slate-900 pt-8">
            &copy; 2025 Tallypadi. Built with ❤️ for Nigerian SMEs.
          </div>
        </div>
      </footer>

    </div>
  );
}

// Helper Component for Feature Cards
const FeatureCard = ({ icon, color, title, desc, badge }: any) => {
    const colorClasses: any = {
        green: "bg-green-50 text-green-600 group-hover:bg-green-100",
        purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-100",
        red: "bg-red-50 text-red-600 group-hover:bg-red-100",
        blue: "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
        orange: "bg-orange-50 text-orange-600 group-hover:bg-orange-100",
        teal: "bg-teal-50 text-teal-600 group-hover:bg-teal-100",
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 hover:border-green-500/30 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)] transition-all duration-300 group relative">
            {badge && (
                <div className="absolute top-4 right-4 bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded">
                    {badge}
                </div>
            )}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${colorClasses[color]}`}>
                {icon}
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-2">{title}</h4>
            <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
        </div>
    );
};