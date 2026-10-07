import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // When nginx is not yet enabled (SSH tunnel / direct Next), proxy /api → backend.
  // With nginx in front, /api never hits Next — this is a no-op path then.
  async rewrites() {
    if (process.env.NODE_ENV !== "production") return [];
    const apiOrigin = process.env.API_PROXY_ORIGIN || "http://127.0.0.1:4020";
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
