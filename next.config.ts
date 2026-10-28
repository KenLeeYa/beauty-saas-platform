import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

function safeOrigin(value: string | undefined, fallback: string): string {
  try {
    return value ? new URL(value).origin : fallback;
  } catch {
    return fallback;
  }
}

const supabaseOrigin = safeOrigin(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "http://127.0.0.1:54321"
);

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${supabaseOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} wss: https://challenges.cloudflare.com`,
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join("; ");

const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    ...(process.env.LOCAL_DEV_HOST ? [process.env.LOCAL_DEV_HOST] : [])
  ],
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains"
                }
              ]
            : [])
        ]
      }
    ];
  }
};

export default nextConfig;
