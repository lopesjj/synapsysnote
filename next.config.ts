import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore", "google-auth-library"],
  experimental: {
    serverActions: {
      bodySizeLimit: "60mb",
    },
  },
  async redirects() {
    return [
      { source: "/app", destination: "/home", permanent: true },
      { source: "/app/:path*", destination: "/home/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
