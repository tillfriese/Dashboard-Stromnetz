import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker runtime image.
  output: "standalone",
  poweredByHeader: false,
  // Data is live and polled by the client; we opt out of Cache Components and
  // set Cache-Control explicitly per route handler instead.
  cacheComponents: false,
  // Native/driver packages stay as runtime requires (traced into standalone).
  serverExternalPackages: ["pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
