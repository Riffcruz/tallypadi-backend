import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://tallypadi.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/about",
          "/blog",
          "/contact",
          "/faq",
          "/faqs",
          "/help",
          "/partners",
          "/privacy",
          "/privacy-policy",
          "/terms",
          "/terms-of-service",
          "/policy",
          "/sales-tracking-ledger",
          "/inventory-stock-management",
          "/best-way-to-grow-business",
          "/marketplace",
          "/marketplace/product/",
          "/shop/",
          "/whatsapp-receipt-generator",
          "/whatsapp-receipt-generator-nigeria",
          "/free-invoice-generator",
          "/product-catalog-shop-link-generator",
          "/accounts-receivable-debtors-tracking",
          "/receiptbuddy-alternative",
          "/nairatrack-alternative",
          "/tallyprime-whatsapp-alternative"
        ],
        disallow: [
          "/api/",
          "/login",
          "/register",
          "/dashboard",
          // The following block the app routes but are overridden by the specific allow rules above
          "/sales",     
          "/inventory",
          "/orders",
          "/settings",
          "/admin",
          "/debtors"
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
