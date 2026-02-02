import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

// Keeping your existing InstallPrompt component import
import InstallPrompt from "../components/InstallPrompt";

// Configure the fonts required by the new Tailwind config
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://tallypadi.com"),
  title: {
    default:
      "TallyPadi — WhatsApp Receipts, Invoicing & Inventory for Business",
    template: "%s — TallyPadi",
  },
  description: "Generate WhatsApp receipts & invoices, track sales, and manage inventory automatically. The #1 business tool for retail, wholesale, and teams.",
  applicationName: "TallyPadi",
  keywords: ["WhatsApp receipts", "WhatsApp invoice generator", "sales tracking software", "inventory management", "business ledger", "SME", "enterprise", "POS"],

  // ✅ REQUIRED for installability
  manifest: "/manifest.json",

  // ✅ FAVICON (ADD THIS)
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },

  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "TallyPadi — WhatsApp Sales & Inventory Tracker",
    description: "Track sales, stock, and profit directly on WhatsApp. Built for Businesses and vendors.",
    siteName: "TallyPadi",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TallyPadi" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TallyPadi — WhatsApp Sales & Inventory Tracker",
    description: "Track sales, stock, and profit directly on WhatsApp. Built for Businesses and vendors.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: "TallyPadi",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.variable} ${poppins.variable} font-sans antialiased`}>
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
