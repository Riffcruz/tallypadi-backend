"use client";
import { useEffect, useState } from "react";
import { Smartphone, X, Share, PlusSquare, ArrowDown, ChevronRight, ChevronLeft } from "lucide-react";
import { usePathname } from "next/navigation";

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  
  // State for collapsible UI
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // 1. Check if installed
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
    const ios = /iphone|ipad|ipod/.test(userAgent) || 
                (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (ios) {
      setIsIOS(true);
      setShowInstallButton(true);
    }

    // 3. Android/Desktop Event
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

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

  const handleMainButtonClick = async () => {
    // If it is collapsed, clicking just expands it
    if (isCollapsed) {
      setIsCollapsed(false);
      return;
    }

    // ANDROID / DESKTOP
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setShowInstallButton(false);
      }
    } 
    // iOS
    else if (isIOS) {
      setShowInstructions(!showInstructions);
    }
  };

  if (isStandalone || !showInstallButton || pathname === "/") return null;

  return (
    <>
      {/* --- FLOATING WIDGET (Bottom Right) --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* iOS Instructions Bubble (Appears above button) */}
        {showInstructions && !isCollapsed && (
          <div className="mb-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-2 duration-200 origin-bottom-right">
             <div className="bg-emerald-50 px-4 py-3 flex justify-between items-center border-b border-emerald-100">
              <h3 className="font-bold text-emerald-800 text-sm">Install for iOS</h3>
              <button onClick={() => setShowInstructions(false)} className="text-emerald-600 p-1 hover:bg-emerald-100 rounded-full"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">1</div>
                <p className="text-xs text-gray-600">Tap <Share size={12} className="inline mx-0.5" /> <strong>Share</strong> in menu</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">2</div>
                <p className="text-xs text-gray-600">Select <PlusSquare size={12} className="inline mx-0.5" /> <strong>Add to Home Screen</strong></p>
              </div>
              <div className="text-center pt-2">
                 <ArrowDown size={16} className="text-emerald-500 animate-bounce mx-auto" />
                 <p className="text-[10px] text-gray-400">Menu is usually at the bottom</p>
              </div>
            </div>
          </div>
        )}

        {/* The Collapsible Button */}
        <div className="flex items-center shadow-lg shadow-emerald-900/20 rounded-full bg-emerald-600 transition-all duration-300 ease-in-out">
          
          {/* Main Action Area */}
          <button 
            onClick={handleMainButtonClick}
            className={`flex items-center gap-2 text-white py-3 transition-all duration-300 ${isCollapsed ? 'pl-3 pr-1' : 'pl-4 pr-2'}`}
          >
            <div className="bg-white/20 p-1.5 rounded-full shrink-0">
              <Smartphone size={18} className="text-white" />
            </div>
            
            <span className={`font-semibold text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[100px] opacity-100'}`}>
              Install App
            </span>
          </button>

          {/* Vertical Separator (only visible when expanded) */}
          <div className={`h-6 w-[1px] bg-emerald-500 transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`} />

          {/* Toggle Collapse Button */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
              // Close instructions if minimizing
              if (!isCollapsed) setShowInstructions(false);
            }}
            className="p-2 pr-3 text-emerald-200 hover:text-white transition-colors focus:outline-none"
            title={isCollapsed ? "Expand" : "Minimize"}
          >
            {isCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </div>
    </>
  );
}