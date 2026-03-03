import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ['three', '@mkkellogg/gaussian-splats-3d'],
  turbopack: {},
  webpack: (config) => {
    // Support WASM files (used by gaussian-splats-3d)
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
