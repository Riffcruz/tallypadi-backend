"use client";
import { useEffect, useState, useRef } from "react";
import { Smartphone, X, Share, ArrowUp, Check, Home, Zap, Bell } from "lucide-react";
import { usePathname } from "next/navigation";

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafariIOS, setIsSafariIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPulsingGuide, setShowPulsingGuide] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  
  const guideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tutorialTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check if already installed
    const checkStandalone = () => {
      const matches = window.matchMedia("(display-mode: standalone)").matches;
      setIsStandalone(matches);
      if (matches) {
        // Show success if just installed
        const justInstalled = sessionStorage.getItem('justInstalled');
        if (justInstalled === 'true') {
          setShowSuccess(true);
          setConfettiActive(true);
          sessionStorage.removeItem('justInstalled');
          
          // Hide success after 5 seconds
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

    // Check if user dismissed before
    const dismissed = localStorage.getItem('installPromptDismissed');
    if (dismissed === 'true') return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform;
    
    // Detect iOS
    const ios = /iphone|ipad|ipod/.test(userAgent) || 
                (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    // Detect Safari on iOS
    const safariIOS = ios && /safari/.test(userAgent) && !/crios|fxios/.test(userAgent);
    
    if (ios) {
      setIsIOS(true);
      setIsSafariIOS(safariIOS);
      
      if (safariIOS) {
        setIsVisible(true);
        
        // Check if first visit
        const visitedBefore = localStorage.getItem('tallypadi_visited');
        if (!visitedBefore) {
          setIsFirstVisit(true);
          localStorage.setItem('tallypadi_visited', 'true');
          
          // Show tutorial after 2 seconds
          tutorialTimeoutRef.current = setTimeout(() => {
            setTutorialStep(1);
          }, 2000);
        } else {
          // Show regular prompt after 1.5 seconds
          guideTimeoutRef.current = setTimeout(() => {
            setShowPulsingGuide(true);
          }, 1500);
        }
      }
    }

    // Handle Android/Desktop PWA installation
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      sessionStorage.setItem('justInstalled', 'true');
      window.location.reload(); // Refresh to detect standalone mode
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
        // Mark for success animation
        sessionStorage.setItem('justInstalled', 'true');
        window.location.reload();
      }
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTutorialStep(0);
    localStorage.setItem('installPromptDismissed', 'true');
  };

  const handleGotIt = () => {
    setShowPulsingGuide(false);
    localStorage.setItem('installGuideSeen', 'true');
  };

  const handleTutorialNext = () => {
    if (tutorialStep < 3) {
      setTutorialStep(tutorialStep + 1);
    } else {
      setTutorialStep(0);
      setShowPulsingGuide(true);
    }
  };

  const handleSkipTutorial = () => {
    setTutorialStep(0);
    setShowPulsingGuide(true);
    localStorage.setItem('tutorialSkipped', 'true');
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    setConfettiActive(false);
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
  };

  // Generate confetti elements
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
            backgroundColor: [
              '#10b981', // emerald
              '#8b5cf6', // violet
              '#3b82f6', // blue
              '#f59e0b', // amber
              '#ef4444', // red
            ][Math.floor(Math.random() * 5)],
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

  // Hide if already installed, not visible, or on landing page
  if (isStandalone || !isVisible || pathname === "/") return null;

  // Success Celebration Animation
  if (showSuccess) {
    return (
      <>
        {/* Confetti overlay */}
        {confettiActive && (
          <div className="fixed inset-0 z-[200] pointer-events-none">
            {confettiElements}
          </div>
        )}

        {/* Success modal */}
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm mx-4 shadow-2xl animate-scale-in">
            <button
              onClick={handleCloseSuccess}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>

            <div className="text-center">
              {/* Animated checkmark */}
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center mx-auto relative">
                  {/* Pulsing rings */}
                  <div className="absolute inset-0 rounded-full border-4 border-emerald-200 animate-ping opacity-60" />
                  <div className="absolute inset-4 rounded-full border-2 border-emerald-100 animate-ping opacity-40" style={{ animationDelay: '0.5s' }} />
                  
                  {/* Checkmark icon with SVG animation */}
                  <svg
                    className="w-12 h-12 text-emerald-600"
                    viewBox="0 0 52 52"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M14 27L22.5 35.5L38 20"
                      stroke="currentColor"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="checkmark"
                    />
                  </svg>
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-2">🎉 Successfully Installed!</h3>
              <p className="text-gray-600 mb-6">
                TallyPadi is now on your home screen. Launch it anytime for instant access!
              </p>
              
              <div className="space-y-3 text-sm text-gray-500 mb-6">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span>Faster than browser bookmarks</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span>Works offline when needed</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span>Native app experience</span>
                </div>
              </div>
              
              <button
                onClick={handleCloseSuccess}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all active:scale-95"
              >
                Start Using TallyPadi
              </button>
              
              <p className="text-xs text-gray-400 mt-4">
                You can close this browser tab
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Tutorial Step 1: Welcome Modal
  if (isFirstVisit && tutorialStep === 1) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
          {/* Header with decorative gradient */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-white">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Smartphone size={24} />
              </div>
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Home size={24} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center mb-2">
              Welcome to TallyPadi!
            </h2>
            <p className="text-center text-emerald-100">
              Get the best experience with our app
            </p>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="text-center mb-6">
              <p className="text-gray-700 mb-4">
                For quick access, faster loading, and a native app experience, we recommend installing TallyPadi to your home screen.
              </p>
              
              <div className="flex items-center justify-center gap-2 mb-6">
                {[1, 2, 3].map((num) => (
                  <div 
                    key={num}
                    className={`w-2 h-2 rounded-full ${num === 1 ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSkipTutorial}
                className="flex-1 py-3 text-gray-600 font-medium rounded-xl border-2 border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
              >
                Skip
              </button>
              <button
                onClick={handleTutorialNext}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all active:scale-95"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Tutorial Step 2: Benefits
  if (isFirstVisit && tutorialStep === 2) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-900 text-center mb-6">
              Why Install TallyPadi?
            </h3>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-4 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Zap size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Lightning Fast</h4>
                  <p className="text-sm text-gray-600">Loads instantly, works offline, no browser tabs needed</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Bell size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Push Notifications</h4>
                  <p className="text-sm text-gray-600">Get instant alerts for sales, low stock, and payments</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Home size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">One-Tap Access</h4>
                  <p className="text-sm text-gray-600">Access like a native app from your home screen</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3].map((num) => (
                <div 
                  key={num}
                  className={`w-2 h-2 rounded-full ${num === 2 ? 'bg-emerald-500' : 'bg-gray-300'}`}
                />
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSkipTutorial}
                className="flex-1 py-3 text-gray-600 font-medium rounded-xl border-2 border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
              >
                Skip
              </button>
              <button
                onClick={handleTutorialNext}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all active:scale-95"
              >
                Show Me How
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Tutorial Step 3: Installation Guide
  if (isFirstVisit && tutorialStep === 3) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
              How to Install
            </h3>
            <p className="text-center text-gray-600 text-sm mb-8">
              Just follow these simple steps
            </p>
            
            <div className="space-y-6 mb-8">
              <div className="relative">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Find the Share Button</h4>
                    <p className="text-sm text-gray-600">Look at the bottom of your screen in Safari</p>
                  </div>
                </div>
                <div className="ml-14 mt-3">
                  <div className="bg-gray-900 rounded-xl p-3 inline-block">
                    <div className="flex items-center gap-2">
                      <Share size={16} className="text-white" />
                      <span className="text-white text-sm font-medium">Share</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="relative">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Scroll Down</h4>
                    <p className="text-sm text-gray-600">Scroll through the share options</p>
                  </div>
                </div>
                <div className="ml-14 mt-3 flex items-center gap-2 text-gray-500">
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center">
                    ↓
                  </div>
                  <span className="text-sm">Scroll down...</span>
                </div>
              </div>
              
              <div className="relative">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Add to Home Screen</h4>
                    <p className="text-sm text-gray-600">Tap "Add to Home Screen" then "Add"</p>
                  </div>
                </div>
                <div className="ml-14 mt-3">
                  <div className="bg-gray-100 rounded-xl p-3 inline-block border border-gray-200">
                    <div className="flex items-center gap-2">
                      <Home size={16} className="text-gray-700" />
                      <span className="text-gray-900 text-sm font-medium">Add to Home Screen</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3].map((num) => (
                <div 
                  key={num}
                  className={`w-2 h-2 rounded-full ${num === 3 ? 'bg-emerald-500' : 'bg-gray-300'}`}
                />
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSkipTutorial}
                className="flex-1 py-3 text-gray-600 font-medium rounded-xl border-2 border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
              >
                Skip
              </button>
              <button
                onClick={handleTutorialNext}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all active:scale-95"
              >
                Let's Do It!
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // iOS Safari with enhanced visual guidance
  if (isSafariIOS) {
    return (
      <>
        {/* Main instruction card */}
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-br from-white to-gray-50 p-4 rounded-2xl shadow-2xl shadow-emerald-500/20 border border-gray-200 max-w-xs relative">
            <button 
              onClick={handleDismiss}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Smartphone size={16} className="text-emerald-600" />
                </div>
              </div>
              
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900 mb-2">
                  Install TallyPadi App
                </p>
                
                <div className="text-xs text-gray-600 space-y-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                      1
                    </div>
                    <span>Look for the share button <Share size={12} className="inline ml-1" /></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                      2
                    </div>
                    <span>Select <strong className="text-emerald-700">"Add to Home Screen"</strong></span>
                  </div>
                </div>
                
                {showPulsingGuide ? (
                  <button
                    onClick={handleGotIt}
                    className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={14} />
                    Got it, thanks!
                  </button>
                ) : (
                  <button
                    onClick={() => setShowPulsingGuide(true)}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Show me where
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Animated Visual Guide */}
        {showPulsingGuide && (
          <div className="fixed inset-0 z-40 pointer-events-none">
            {/* Overlay with cutout */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            
            {/* Highlight area around Safari's share button */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="relative">
                {/* Pulsing ring */}
                <div className="absolute -inset-4">
                  <div className="w-16 h-16 rounded-full border-4 border-emerald-400 animate-ping opacity-60" />
                </div>
                
                {/* Arrow pointing up */}
                <div className="relative">
                  {/* Arrow animation */}
                  <div className="absolute -top-16 left-1/2 transform -translate-x-1/2">
                    <div className="animate-bounce">
                      <ArrowUp size={24} className="text-emerald-600" />
                    </div>
                  </div>
                  
                  {/* Tooltip */}
                  <div className="absolute -top-28 left-1/2 transform -translate-x-1/2 w-48">
                    <div className="bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-2xl border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                          <Share size={12} className="text-emerald-600" />
                        </div>
                        <p className="text-sm font-bold text-gray-900">
                          Tap this button
                        </p>
                      </div>
                      <p className="text-xs text-gray-600">
                        Then scroll down and select "Add to Home Screen"
                      </p>
                    </div>
                    
                    {/* Tooltip arrow */}
                    <div className="w-3 h-3 bg-white/95 transform rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b border-gray-200" />
                  </div>
                  
                  {/* Simulated Safari toolbar */}
                  <div className="w-48 bg-gray-900/90 backdrop-blur-sm rounded-xl p-3 border border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Share size={12} className="text-white" />
                        </div>
                        <span className="text-white text-sm font-medium">Share</span>
                      </div>
                      <div className="text-white/60 text-xs">Bottom toolbar</div>
                    </div>
                    
                    {/* Animated tap indicator */}
                    <div className="absolute -top-2 -right-2">
                      <div className="relative">
                        <div className="absolute -inset-2 bg-emerald-500/20 rounded-full animate-ping" />
                        <div className="relative bg-emerald-600 text-white px-2 py-1 rounded-full text-xs font-bold animate-pulse">
                          TAP HERE
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Instructional text */}
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 w-64 text-center">
              <p className="text-white font-semibold text-lg mb-2">
                Install TallyPadi
              </p>
              <p className="text-white/90 text-sm">
                Follow the guide below to add to your home screen
              </p>
            </div>
            
            {/* Close button */}
            <button
              onClick={() => setShowPulsingGuide(false)}
              className="absolute top-4 right-4 pointer-events-auto w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            >
              <X size={20} />
            </button>
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
          className="absolute -top-2 -right-2 bg-white text-gray-400 hover:text-gray-600 rounded-full p-1.5 shadow-lg border border-gray-200 z-10 hover:scale-110 transition-transform"
        >
          <X className="w-3 h-3" />
        </button>

        <button 
          onClick={handleInstallClick}
          className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-full shadow-xl shadow-emerald-600/30 transition-all hover:scale-105 hover:shadow-emerald-600/40 active:scale-95"
        >
          <Smartphone className="w-5 h-5" />
          <span>Install App</span>
        </button>
        
        {/* Subtle pulse effect */}
        <div className="absolute -inset-2 bg-emerald-500/20 rounded-full -z-10 animate-ping opacity-60" />
      </div>
    </div>
  );
}