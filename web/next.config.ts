import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  async headers() {
    return [
      {
        source: '/service-worker.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "static.dw.com" },
      { protocol: "https", hostname: "tallypadi.com" },
      { protocol: "https", hostname: "**.tallypadi.com" },
      { protocol: "https", hostname: "**.r2.dev" },
    ],
  },
};

export default nextConfig;
