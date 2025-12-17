"use client";
import { useEffect, useState, useRef } from "react";
import { Smartphone, X } from "lucide-react";
import { usePathname } from "next/navigation";

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(isStandalone);
    if (isStandalone) return;

    // Check if user dismissed
    const dismissed = localStorage.getItem('installPromptDismissed');
    if (dismissed === 'true') return;

    // Detect iOS/Android mobile
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|ipod|android/i.test(userAgent);
    
    // Show prompt on mobile after delay
    if (isMobile) {
      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, 5000); // Wait 5 seconds before showing
    }

    // Handle PWA install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
    } else {
      // For iOS, show simple instructions
      const userAgent = navigator.userAgent.toLowerCase();
      let message = "To install: ";
      
      if (/crios/.test(userAgent)) {
        message += "Tap the menu (•••) then 'Add to Home Screen'";
      } else if (/iphone|ipad|ipod/.test(userAgent)) {
        message += "Tap the share button, then 'Add to Home Screen'";
      } else if (/android/.test(userAgent)) {
        message += "Tap the menu (⋮) then 'Install app'";
      }
      
      alert(message);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('installPromptDismissed', 'true');
  };

  // Don't show on landing page or if installed
  if (isStandalone || !isVisible || pathname === "/") return null;

  // Simple floating button
  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-2 bg-white rounded-full shadow-xl border border-gray-200 p-1">
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1.5"
        >
          <X size={14} />
        </button>

        <button
          onClick={handleInstallClick}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          <Smartphone size={14} />
          <span className="text-sm font-medium">Install</span>
        </button>
      </div>
    </div>
  );
}