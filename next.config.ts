import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  poweredByHeader: false,
};

export default nextConfig;
