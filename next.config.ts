import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['webhook.mati.my'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
