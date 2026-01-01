import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = "https://tallypadi.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/login", "/register", "/dashboard", "/sales", "/inventory"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
