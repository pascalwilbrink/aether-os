import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    // A new task's input files come through its Server Function (then on to
    // Loculus): up to 20 files of 25 MB each in principle; a request this large
    // covers the usual few.
    serverActions: { bodySizeLimit: "100mb" },
  },
  partialPrefetching: true,
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
