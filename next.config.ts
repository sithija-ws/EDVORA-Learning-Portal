import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ─── Performance ─────────────────────────────────────────────────────────
  cacheComponents: true,
  partialPrefetching: true,

  // ─── Server Actions Body Size Limit (Allow 50 MB PDF notes + headers) ────
  experimental: {
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },

  // ─── Tailwind v4 via Turbopack ────────────────────────────────────────────
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  // ─── Security Headers ─────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // ─── Images ───────────────────────────────────────────────────────────────
  images: {
    // YouTube thumbnail CDN — no API key required
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**",
      },
    ],
  },
};

export default nextConfig;
