import path from "node:path";
import type { NextConfig } from "next";

// Next 16 evaluates this file as an ES module, where __dirname is undefined.
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  // Pin the root so a package.json or lockfile in a parent folder is never picked up.
  outputFileTracingRoot: path.resolve(projectRoot),
  serverExternalPackages: [
    "@lancedb/lancedb",
    "apache-arrow",
    "pdfjs-dist",
    "@napi-rs/canvas",
  ],
  turbopack: {
    root: path.resolve(projectRoot),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
