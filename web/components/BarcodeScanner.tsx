'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, Zap, AlertCircle } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(true);

  useEffect(() => {
    // Initialize scanner
    const scannerId = 'reader';
    
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
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Success callback
          onScan(decodedText);
          stopScanning();
        },
        () => {
          // Error callback (ignore for now as it triggers on every frame without code)
        }
      );
      setIsScanning(true);
    } catch (err) {
      console.error('Error starting scanner:', err);
      setError('Could not start camera. Please ensure you have granted camera permissions.');
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
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
            {error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
                    <p className="font-medium">{error}</p>
                </div>
            ) : (
                <>
                    <div id="reader" className="w-full h-full object-cover"></div>
                    {/* Overlay Guide */}
                    <div className="absolute inset-0 pointer-events-none border-[30px] border-black/50">
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
