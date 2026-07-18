import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these Node-only parsers out of the bundle; load them at runtime.
  serverExternalPackages: ["mammoth", "xlsx"],
  experimental: {
    // React <ViewTransition>: smooth cross-fades between pages.
    viewTransition: true,
  },
};

export default nextConfig;
