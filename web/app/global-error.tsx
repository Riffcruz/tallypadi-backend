// app/global-error.tsx
"use client";

import { AlertOctagon } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-slate-50 text-slate-900 font-sans antialiased">
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertOctagon className="text-red-600" size={48} />
          </div>
          
          <h1 className="text-4xl font-extrabold mb-4">Critical System Error</h1>
          <p className="text-slate-600 text-lg mb-8 max-w-lg">
            A critical error occurred in the main layout. Please refresh the page completely.
          </p>
          
          <button
            onClick={() => reset()}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-10 rounded-full shadow-lg transition-transform hover:scale-105"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}