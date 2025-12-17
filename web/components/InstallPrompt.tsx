"use client";
import { useEffect, useState } from "react";
import { Smartphone, X, Share, PlusSquare, ArrowUp } from "lucide-react";
import { usePathname } from "next/navigation";

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  
  // Triggers the "Install App" button to appear
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    // 1. Check if app is already installed (Standalone mode)
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;

      setIsStandalone(isStandaloneMode);
      return isStandaloneMode;
    };

    if (checkStandalone()) return;

    // 2. Detect Platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform;
    
    // Broad iOS detection (iPhone/iPad/iPod) - covers Safari, Chrome, Firefox
    const ios = /iphone|ipad|ipod/.test(userAgent) || 
                (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (ios) {
      setIsIOS(true);
      setShowInstallButton(true); // Always show button on iOS if not installed
    }

    // 3. Handle Android/Desktop Native Install Prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault(); // Prevent default mini-infobar
      setDeferredPrompt(e);
      setShowInstallButton(true); // Show button when browser says it's installable
    };

    // 4. Listen for successful install to hide button permanently
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setShowInstallButton(false);
      setShowInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleClick = async () => {
    // ANDROID / DESKTOP: Trigger native prompt
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setShowInstallButton(false);
      }
    } 
    // iOS: Open the instruction modal
    else if (isIOS) {
      setShowInstructions(true);
    }
  };

  // LOGIC: 
  // 1. If installed (isStandalone) -> Hide
  // 2. If browser doesn't support install AND isn't iOS (!showInstallButton) -> Hide
  // 3. If we are on the Home Page (pathname === "/") -> Hide
  if (isStandalone || !showInstallButton || pathname === "/" || pathname === "/sales") return null;

  return (
    <>
      {/* --- PERSISTENT TRIGGER BUTTON (Bottom Left) --- */}
      <div className="fixed bottom-6 left-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button 
          onClick={handleClick}
          className="group flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white pl-3 pr-4 py-3 rounded-full shadow-lg shadow-emerald-900/20 transition-all hover:scale-105 active:scale-95"
        >
          <div className="bg-white/20 p-1.5 rounded-full">
            <Smartphone size={18} className="text-white" />
          </div>
          <span className="font-semibold text-sm">Install App</span>
        </button>
      </div>

      {/* --- iOS INSTRUCTION MODAL (Small, Bottom Left) --- */}
      {showInstructions && (
        <>
          {/* Transparent Backdrop to close on click outside */}
          <div 
            className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[1px]" 
            onClick={() => setShowInstructions(false)}
          />

          {/* Small Instruction Card */}
          <div className="fixed bottom-20 left-6 z-[70] w-72 bg-white rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-200 border border-gray-100 overflow-hidden">
            
            {/* Header */}
            <div className="bg-emerald-50 px-4 py-3 flex justify-between items-center border-b border-emerald-100">
              <h3 className="font-bold text-emerald-800 text-sm">Install for iOS</h3>
              <button 
                onClick={() => setShowInstructions(false)}
                className="text-emerald-600 hover:bg-emerald-100 p-1 rounded-full transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Steps */}
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">1</div>
                <p className="text-xs text-gray-600 leading-tight">
                  Tap the <Share size={12} className="inline mx-0.5" /> <strong>Share</strong> button in your browser menu.
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">2</div>
                <p className="text-xs text-gray-600 leading-tight">
                  Scroll down & select <br/>
                  <span className="font-semibold text-gray-800 inline-flex items-center gap-1 mt-1">
                    <PlusSquare size={12} /> Add to Home Screen
                  </span>
                </p>
              </div>

              {/* Visual Pointer */}
              <div className="pt-2 text-center">
                 <div className="text-[10px] text-gray-400 mb-1">Menu is usually at the bottom or top right</div>
                 <div className="animate-bounce inline-block">
                    <ArrowUp size={16} className="text-emerald-500" />
                 </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}