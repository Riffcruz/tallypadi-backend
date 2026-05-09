import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://tallypadi.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/sales-tracking-ledger",
          "/inventory-stock-management",
          "/best-way-to-grow-business",
          "/marketplace",
          "/marketplace/product/",
          "/shop/",
          "/whatsapp-receipt-generator",
          "/product-catalog-shop-link-generator",
          "/accounts-receivable-debtors-tracking"
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
