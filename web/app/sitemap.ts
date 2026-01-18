import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://tallypadi.com";

  // Add ONLY public pages you want indexed
  // Anchors (e.g., /#pricing) are part of the home page and should not be listed separately.
  const routes = ["", "/faq", "/policy", "/payment"];

  return routes.map((path) => ({
    url: `${site}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.8,
  }));
}
