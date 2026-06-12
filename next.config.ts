import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['manifold-3d', 'opencascade.js', 'sharp'],
};

export default nextConfig;
