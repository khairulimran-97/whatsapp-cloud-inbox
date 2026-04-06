import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['webhook.mati.my'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
