// app/not-found.tsx
import Link from "next/link";
import { MoveLeft, SearchX, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      {/* Icon Graphic */}
      <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
        <SearchX className="text-slate-400" size={48} />
      </div>

      {/* Main Text */}
      <h1 className="text-4xl font-extrabold text-slate-900 mb-2 font-heading">
        Page Not Found
      </h1>
      <p className="text-slate-500 text-lg max-w-md mb-8">
        We couldn't find the page you're looking for. It might have been moved, deleted, or never existed in our inventory.
      </p>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-8 rounded-full transition-all hover:scale-105 shadow-lg shadow-emerald-600/20"
        >
          <Home size={18} />
          Go Home
        </Link>
        
        {/* Optional: "Back" button functionality isn't built-in to Link, 
            but usually a Home link is sufficient for 404s. 
            If you want a true back button, you'd need a client component wrapper. */}
      </div>

      {/* Footer / Help */}
      <div className="mt-12 text-sm text-slate-400">
        Lost? <a href="#" className="text-emerald-600 hover:underline">Contact Support</a>
      </div>
    </div>
  );
}