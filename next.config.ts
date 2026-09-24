import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self), fullscreen=(self)",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore", "google-auth-library"],
  async headers() {
    return [{ source: "/((?!(?:[a-z]{2}/)?__/auth).*)", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/__/auth/:path*",
          destination: "https://synapsysnote.firebaseapp.com/__/auth/:path*",
        },
        {
          source: "/:locale([a-z]{2})/__/auth/:path*",
          destination: "https://synapsysnote.firebaseapp.com/__/auth/:path*",
        },
      ],
    };
  },
  async redirects() {
    return [
      { source: "/app", destination: "/home", permanent: true },
      { source: "/app/:path*", destination: "/home/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
