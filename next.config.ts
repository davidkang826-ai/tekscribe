import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these Node-only parsers out of the bundle; load them at runtime.
  serverExternalPackages: ["mammoth", "xlsx"],
};

export default nextConfig;
