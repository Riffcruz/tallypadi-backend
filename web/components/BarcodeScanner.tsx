'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, Zap, AlertCircle, Keyboard } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const decodedRef = useRef(false);
  const [manualCode, setManualCode] = useState('');
  const scannerId = `barcode-reader-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    // Initialize scanner
    // Slight delay to ensure DOM is ready
    const timer = setTimeout(() => {
        startScanning(scannerId);
    }, 100);

    return () => {
      clearTimeout(timer);
      stopScanning();
    };
  }, []);

  const startScanning = async (elementId: string) => {
    try {
      setError(null);
      decodedRef.current = false;
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
      ];

      const html5QrCode = new Html5Qrcode(elementId, { verbose: false, formatsToSupport });

      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 140 },
          aspectRatio: 1.777,
        },
        (decodedText) => {
          if (decodedRef.current) return;
          decodedRef.current = true;
          navigator.vibrate?.(80);
          onScan(decodedText);
        },
        () => {
          // Error callback (ignore for now as it triggers on every frame without code)
        }
      );
    } catch (err) {
      console.error('Error starting scanner:', err);
      setError('Camera could not start. Allow camera access, try again, or enter the barcode below.');
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const submitManualCode = (event: React.FormEvent) => {
    event.preventDefault();
    const code = manualCode.trim();
    if (code) onScan(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 rounded-full text-emerald-600">
                    <Camera className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900">Scan Barcode</h3>
                    <p className="text-xs text-gray-500">Point camera at product barcode</p>
                </div>
            </div>
            <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
            >
                <X className="w-6 h-6" />
            </button>
        </div>

        {/* Scanner Area */}
        <div className="relative bg-black aspect-square w-full overflow-hidden">
            <div id={scannerId} className="w-full h-full object-cover"></div>
            {error ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black text-white p-6 text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
                    <p className="font-medium">{error}</p>
                </div>
            ) : (
                <>
                    {/* Overlay Guide */}
                    <div className="absolute inset-0 pointer-events-none border-x-[24px] border-y-[92px] border-black/50">
                        <div className="w-full h-full border-2 border-emerald-500/50 relative">
                            <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-500"></div>
                            <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-500"></div>
                            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-500"></div>
                            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-500"></div>
                            
                            {/* Scanning Line Animation */}
                            <div className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-scan top-1/2 -translate-y-1/2"></div>
                        </div>
                    </div>
                </>
            )}
        </div>

        {/* Footer Hint */}
        <div className="px-6 py-4 bg-gray-50 text-center">
            <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                Auto-detecting barcodes...
            </p>
            <form onSubmit={submitManualCode} className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Keyboard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Enter barcode" inputMode="numeric" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-500" />
              </div>
              <button type="submit" disabled={!manualCode.trim()} className="rounded-xl bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-40">Use code</button>
            </form>
            {error && <button type="button" onClick={() => startScanning(scannerId)} className="mt-3 text-sm font-bold text-emerald-700">Try camera again</button>}
        </div>
      </div>
      
      <style jsx global>{`
        @keyframes scan {
            0% { top: 10%; opacity: 0; }
            50% { opacity: 1; }
            100% { top: 90%; opacity: 0; }
        }
        .animate-scan {
            animation: scan 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}
