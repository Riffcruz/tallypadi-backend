"use client";
import { useEffect, useState, useRef } from "react";
import { Smartphone, X, Share, PlusSquare, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  
  // New states for collapsible behavior
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    
    const ios = /iphone|ipad|ipod/.test(userAgent) || 
                (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (ios) {
      setIsIOS(true);
      setShowInstallButton(true);
    }

    // 3. Handle Android/Desktop Native Install Prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    // 4. Listen for successful install
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setShowInstallButton(false);
      setShowInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Auto-collapse after 5 seconds
    if (showInstallButton && isExpanded) {
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
        setHasAutoCollapsed(true);
      }, 5000); // 5 seconds
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, [showInstallButton, isExpanded]);

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setShowInstallButton(false);
      }
    } else if (isIOS) {
      setShowInstructions(true);
    }
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
    setIsExpanded(true);
    
    // Clear any existing collapse timer
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    
    // Auto-collapse after 3 seconds if not hovering
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    
    hoverTimerRef.current = setTimeout(() => {
      if (!isHovering) {
        setIsExpanded(false);
      }
    }, 3000);
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      // When manually expanding, set auto-collapse for 5 seconds
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 5000);
    }
  };

  // Hide on home page AND sales page
  if (isStandalone || !showInstallButton || pathname === "/" || pathname === "/sales") return null;

  return (
    <>
      {/* --- COLLAPSIBLE INSTALL BUTTON (Right Side) --- */}
      <div 
        className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {isExpanded ? (
          // EXPANDED STATE
          <div className="flex items-center gap-2">
            <button 
              onClick={handleClick}
              className="group flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white pl-3 pr-4 py-3 rounded-full shadow-lg shadow-emerald-900/20 transition-all hover:scale-105 active:scale-95"
            >
              <div className="bg-white/20 p-1.5 rounded-full">
                <Smartphone size={18} className="text-white" />
              </div>
              <span className="font-semibold text-sm whitespace-nowrap">Install App</span>
            </button>
            
            {/* Collapse Button */}
            <button
              onClick={toggleExpand}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full shadow-md transition-all active:scale-95"
              title="Collapse"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          // COLLAPSED STATE (Icon only)
          <div className="relative">
            <button 
              onClick={toggleExpand}
              className="group w-12 h-12 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg shadow-emerald-900/20 transition-all hover:scale-110 active:scale-95"
              title="Install App"
            >
              <Smartphone size={20} className="text-white" />
              
              {/* Badge indicator */}
              {hasAutoCollapsed && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse">
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-white text-[8px] font-bold">!</span>
                  </div>
                </div>
              )}
            </button>
            
            {/* Tooltip on hover */}
            {isHovering && (
              <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 px-3 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap animate-in fade-in slide-in-from-right-1 duration-200">
                Install App
                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- iOS INSTRUCTION MODAL (Updated position to right) --- */}
      {showInstructions && (
        <>
          {/* Transparent Backdrop */}
          <div 
            className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[1px]" 
            onClick={() => setShowInstructions(false)}
          />

          {/* Small Instruction Card - Positioned to right */}
          <div className="fixed bottom-20 right-6 z-[70] w-72 bg-white rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 duration-200 border border-gray-100 overflow-hidden">
            
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