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
      "TallyPadi — WhatsApp POS & Business Management Software for African SMEs",
    template: "%s | TallyPadi",
  },
  description: "Run sales, receipts, inventory, debtors, staff, online storefronts, product boosts, and business reports from WhatsApp, web, phones, and compatible POS machines. Built for Nigerian and African SMEs, retailers, wholesalers, and service businesses.",
  applicationName: "TallyPadi",
  keywords: [
    "WhatsApp POS Africa",
    "WhatsApp POS Nigeria",
    "POS machine software Nigeria",
    "POS machine business management",
    "business management software Africa",
    "business management software Nigeria",
    "small business management app Africa",
    "inventory management software Nigeria",
    "stock management app Nigeria",
    "sales tracking app Africa",
    "sales ledger app Nigeria",
    "receipt generator Nigeria",
    "WhatsApp receipt generator",
    "storefront ads Nigeria",
    "marketplace product boosts",
    "debtor management Nigeria",
    "retail POS Nigeria",
    "SME business tools Africa",
    "African retail software",
    "wholesale inventory software",
    "send ads to facebook",
    "send ads to instagram",
    "send ads to tiktok",
    "send ads to google",
    "send receipts via whatsapp",
    "manage inventory and stock",
    "record sales and track cash flow",
    "publish products to a public shop link",
    "publish products to TallyPadi Marketplace",
  ],

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
    title: "TallyPadi — WhatsApp POS & Business Management Software",
    description: "WhatsApp POS, compatible POS machine use, receipts, inventory, sales tracking, debtors, storefronts, product boosts, and business reports for Nigerian and African SMEs.",
    siteName: "TallyPadi",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TallyPadi WhatsApp POS and business management software" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TallyPadi — WhatsApp POS & Business Management Software",
    description: "Business management software for Nigerian and African SMEs: WhatsApp POS, POS machine support, receipts, inventory, storefronts, ads boosts, sales tracking, and debtors.",
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
