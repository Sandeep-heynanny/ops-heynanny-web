import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server routes (/api/cashfree/*) use the Admin SDK; keep it out of the bundle.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
