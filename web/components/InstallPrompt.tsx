"use client";
import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Check if already installed (Standalone mode)
    const matches = window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(matches);
    if (matches) return; // Stop here if already installed

    // 2. Check for iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent);
    
    if (ios) {
      setIsIOS(true);
      setIsVisible(true); // <--- FIX: Force visible for iOS
    }

    // 3. Listen for the 'beforeinstallprompt' event (Android/Desktop)
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault(); // Prevent default mini-infobar
      setDeferredPrompt(e);
      setIsVisible(true); // Show our custom button
      console.log("Install Prompt Fired"); // Debugging log
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

  // Don't render if app is installed or user dismissed it (technically)
  // Logic: If it's standalone, don't show. If it's NOT standalone, verify isVisible.
  if (isStandalone || !isVisible) return null;

  // iOS Instructions
  if (isIOS) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-white p-4 rounded-2xl shadow-xl border border-gray-100 max-w-xs relative">
            <button 
                onClick={handleDismiss} 
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
                <X size={16} />
            </button>
            <p className="text-sm font-semibold text-gray-800 mb-2">Install App on iOS:</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Tap Share</span>
                <span className="font-bold text-lg">⎋</span>
                <span>and "Add to Home Screen"</span>
                <span className="font-bold text-lg">+</span>
            </div>
        </div>
      </div>
    );
  }

  // Android / Desktop Button
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative group">
        <button 
          onClick={handleDismiss}
          className="absolute -top-2 -right-1 bg-white text-gray-400 hover:text-gray-600 rounded-full p-1 shadow-sm border border-gray-200 z-10 transition-colors"
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>

        <button 
          onClick={handleInstallClick}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-full shadow-xl shadow-indigo-600/20 transition-all transform hover:scale-105"
        >
          <Smartphone className="w-5 h-5" />
          <span>Install App</span>
        </button>
      </div>
    </div>
  );
}