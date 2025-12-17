"use client";
import { useEffect, useState, useRef } from "react";
import { Smartphone, X, Share, ArrowUp, Check, Home, Zap, Bell, Copy } from "lucide-react";
import { usePathname } from "next/navigation";

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showPulsingGuide, setShowPulsingGuide] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  
  const guideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tutorialTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check if already installed
    const checkStandalone = () => {
      const matches = window.matchMedia("(display-mode: standalone)").matches;
      if (matches) {
        // Show success if just installed
        const justInstalled = sessionStorage.getItem('justInstalled');
        if (justInstalled === 'true') {
          setShowSuccess(true);
          setConfettiActive(true);
          sessionStorage.removeItem('justInstalled');
          
          successTimeoutRef.current = setTimeout(() => {
            setShowSuccess(false);
            setConfettiActive(false);
          }, 5000);
        }
      }
      return matches;
    };

    const isStandalone = checkStandalone();
    if (isStandalone) return;

    // Check if user dismissed in this session only (removed long-term storage check)
    const dismissedSession = sessionStorage.getItem('installPromptDismissed');
    if (dismissedSession === 'true') return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform;
    
    // Detect iOS (iPhone/iPad)
    const ios = /iphone|ipad|ipod/.test(userAgent) || 
                (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    // Detect iOS Browser (Safari OR Chrome OR Firefox)
    // Removed the !/crios|fxios/ exclusion so it works on Chrome iOS too
    const isIOSBrowser = ios && (/safari/.test(userAgent) || /crios/.test(userAgent) || /fxios/.test(userAgent));
    
    if (isIOSBrowser) {
      setIsIOS(true);
      setIsVisible(true);
      
      // Removed 'tallypadi_visited' local storage check.
      // Now acts as "first visit" every time the session starts if not installed.
      tutorialTimeoutRef.current = setTimeout(() => {
        setTutorialStep(1);
      }, 1500);
    }

    // Handle Android/Desktop PWA installation
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      sessionStorage.setItem('justInstalled', 'true');
      window.location.reload(); 
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      if (guideTimeoutRef.current) clearTimeout(guideTimeoutRef.current);
      if (tutorialTimeoutRef.current) clearTimeout(tutorialTimeoutRef.current);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setIsVisible(false);
        sessionStorage.setItem('justInstalled', 'true');
        window.location.reload();
      }
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTutorialStep(0);
    // Changed to sessionStorage so it resets when they close the tab/browser
    sessionStorage.setItem('installPromptDismissed', 'true');
  };

  const handleGotIt = () => {
    setShowPulsingGuide(false);
  };

  const handleStartInstallation = () => {
    setTutorialStep(0);
    setShowPulsingGuide(true);
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    setConfettiActive(false);
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
  };

  // Generate confetti elements (Same as before)
  const confettiElements = [];
  if (confettiActive) {
    for (let i = 0; i < 50; i++) {
      confettiElements.push(
        <div
          key={i}
          className="absolute confetti"
          style={{
            left: `${Math.random() * 100}%`,
            top: '-10px',
            backgroundColor: ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ef4444'][Math.floor(Math.random() * 5)],
            width: `${Math.random() * 10 + 5}px`,
            height: `${Math.random() * 10 + 5}px`,
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
            animation: `confetti-fall ${Math.random() * 3 + 2}s linear forwards`,
            animationDelay: `${Math.random() * 2}s`,
          }}
        />
      );
    }
  }

  // NOTE: I removed the `pathname === "/"` check so it shows on the homepage too.
  // Add it back if you specifically want to hide it on the root.
  if (!isVisible) return null;

  // Success Animation (Same as before)
  if (showSuccess) {
    return (
      <>
        {confettiActive && <div className="fixed inset-0 z-[200] pointer-events-none">{confettiElements}</div>}
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm mx-4 shadow-2xl animate-scale-in text-center">
             <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4 text-emerald-600">
                <Check size={40} />
             </div>
             <h3 className="text-2xl font-bold text-gray-900 mb-2">Installed!</h3>
             <button onClick={handleCloseSuccess} className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl">Start Using App</button>
          </div>
        </div>
      </>
    );
  }

  // NEW: Merged Step 1 & 2 (Compact Welcome + Benefits)
  if (isIOS && tutorialStep === 1) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-2xl max-w-xs w-full overflow-hidden shadow-2xl relative">
          <button 
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 z-10"
          >
            <X size={20} />
          </button>

          <div className="p-5 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-3">
              <Smartphone className="text-emerald-600 w-7 h-7" />
            </div>
            
            <h2 className="text-lg font-bold text-gray-900 mb-1">Install TallyPadi</h2>
            <p className="text-xs text-gray-500 mb-4">Add to home screen for the best experience</p>
            
            <div className="space-y-2 mb-6 text-left">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                <Zap size={16} className="text-emerald-600 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-700">Opens instantly & works offline</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                <Bell size={16} className="text-emerald-600 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-700">Real-time sale notifications</span>
              </div>
            </div>

            <button
              onClick={handleStartInstallation}
              className="w-full py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/30 active:scale-95 transition-all"
            >
              Install Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // iOS Visual Guide (Simplified)
  if (isIOS) {
    return (
      <>
        {/* Floating Mini Prompt (if guide is dismissed but not installed) */}
        {!showPulsingGuide && (
          <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className="bg-white p-3 rounded-2xl shadow-xl border border-gray-100 flex items-center gap-3 pr-8 relative">
                <button onClick={handleDismiss} className="absolute top-1 right-1 text-gray-300 p-1"><X size={14} /></button>
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold">
                  <ArrowUp size={20} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-gray-900">Install App</p>
                  <button onClick={() => setShowPulsingGuide(true)} className="text-xs text-emerald-600 font-medium underline decoration-emerald-600/30">Show me how</button>
                </div>
             </div>
          </div>
        )}

        {/* Full Screen Visual Guide Overlay */}
        {showPulsingGuide && (
          <div className="fixed inset-0 z-[150] pointer-events-none">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            
            {/* Guide Content */}
            <div className="absolute bottom-0 left-0 right-0 p-6 pb-12 flex flex-col items-center pointer-events-auto">
              <div className="bg-white rounded-2xl p-5 max-w-xs w-full shadow-2xl mb-8 relative">
                <button 
                  onClick={handleGotIt}
                  className="absolute -top-3 -right-3 w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-lg"
                >
                  <X size={16} />
                </button>
                
                <h3 className="text-center font-bold text-gray-900 mb-4">How to Install</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                    <p className="text-sm text-gray-600">Tap the <Share size={14} className="inline mx-1" /> <strong>Share</strong> button</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                    <p className="text-sm text-gray-600">Scroll down & tap <strong>"Add to Home Screen"</strong></p>
                  </div>
                </div>
                
                {/* Visual Arrow Animation */}
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="animate-bounce">
                    <ArrowUp size={32} className="text-white drop-shadow-lg" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Android / Desktop UI
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="relative group">
        <button 
          onClick={handleDismiss}
          className="absolute -top-2 -right-2 bg-white text-gray-400 hover:text-gray-600 rounded-full p-1 shadow-lg border border-gray-200 z-10"
        >
          <X size={12} />
        </button>
        <button 
          onClick={handleInstallClick}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-5 rounded-full shadow-xl transition-all active:scale-95"
        >
          <Smartphone size={18} />
          <span>Install App</span>
        </button>
      </div>
    </div>
  );
}