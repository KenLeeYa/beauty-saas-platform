import type { NextConfig } from "next";

const apiOrigin = (process.env.API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@beauty-saas/shared"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`
      }
    ];
  }
};

export default nextConfig;
