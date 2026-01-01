// app/error.tsx
"use client"; // Error components must be Client Components

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service (optional)
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
        <AlertTriangle className="text-red-500" size={40} />
      </div>

      <h2 className="text-3xl font-bold text-slate-900 mb-3">Something went wrong!</h2>
      <p className="text-slate-500 mb-8 max-w-md mx-auto">
        We encountered an unexpected error. Don't worry, your data is safe. Please try refreshing the page.
      </p>

      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-8 rounded-xl transition-all active:scale-95"
      >
        <RefreshCw size={18} />
        Try Again
      </button>

      {error.digest && (
        <p className="mt-8 text-xs text-slate-400 font-mono">
          Error ID: {error.digest}
        </p>
      )}
    </div>
  );
}