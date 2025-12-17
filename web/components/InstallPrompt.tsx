"use client";
import { useEffect, useState } from "react";
import { Smartphone, X, Share, PlusSquare } from "lucide-react";
import { usePathname } from "next/navigation";

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isChromeIOS, setIsChromeIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Check if already installed (Standalone mode)
    const matches = window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(matches);
    if (matches) return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    
    // 2. Detect iOS (iPhone/iPad)
    const ios = /iphone|ipad|ipod/.test(userAgent);
    
    // 3. Detect Chrome specifically on iOS (CriOS)
    const chromeIOS = /crios/.test(userAgent);

    if (ios) {
      setIsIOS(true);
      if (chromeIOS) {
        setIsChromeIOS(true);
      }
      setIsVisible(true); // Force the popup to show on iOS
    }

    // 4. Android/Desktop: Listen for standard install event
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  // Logic: Hide if installed, OR invisible, OR on Landing Page ("/")
  // Remove "pathname === '/'" if you want it to show on the landing page too.
  if (isStandalone || !isVisible || pathname === "/") return null;

  // --- iOS UI (Custom Instructions) ---
  if (isIOS) {
    return (
      <div 
        className={`fixed z-50 animate-in fade-in slide-in-from-bottom-4 ${
          isChromeIOS ? "top-4 right-4" : "bottom-6 right-6"
        }`}
      >
        <div className="bg-white p-4 rounded-2xl shadow-2xl border border-gray-200 max-w-xs relative">
            <button 
                onClick={handleDismiss} 
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
                <X size={16} />
            </button>
            
            <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Smartphone size={16} className="text-emerald-600" />
              Install TallyPadi
            </p>
            
            <div className="text-xs text-gray-600 space-y-2">
              <div className="flex items-center gap-2">
                1. Tap the <Share size={14} className="inline mx-1" /> 
                {isChromeIOS ? "Share icon (top right)" : "Share icon (bottom)"}
              </div>
              <div className="flex items-center gap-2">
                2. Scroll down & tap <span className="font-bold whitespace-nowrap">"Add to Home Screen"</span>
                <PlusSquare size={14} className="inline mx-1" />
              </div>
            </div>

            {/* Pointer Arrow */}
            <div 
              className={`absolute w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45 ${
                isChromeIOS 
                  ? "-top-2 right-6 border-b-0 border-r-0" // Pointing UP for Chrome
                  : "-bottom-2 right-6 border-l-0 border-t-0 border-r border-b" // Pointing DOWN for Safari
              }`}
            ></div>
        </div>
      </div>
    );
  }

  // --- Android / Desktop UI (Install Button) ---
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
      <div className="relative group">
        <button 
          onClick={handleDismiss}
          className="absolute -top-2 -right-1 bg-white text-gray-400 hover:text-gray-600 rounded-full p-1 shadow-sm border border-gray-200 z-10"
        >
          <X className="w-3 h-3" />
        </button>

        <button 
          onClick={handleInstallClick}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-full shadow-xl shadow-emerald-600/20 transition-all hover:scale-105"
        >
          <Smartphone className="w-5 h-5" />
          <span>Install App</span>
        </button>
      </div>
    </div>
  );
}