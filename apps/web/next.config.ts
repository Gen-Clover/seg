import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  // Workspace packages are TypeScript sources.
  transpilePackages: ["@seg/domain", "@seg/data"],
  // Heavy Node libraries stay out of the server bundle.
  serverExternalPackages: ["mongodb", "@google-cloud/bigquery"],
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  devIndicators: { position: "bottom-left" }, // keeps the bottom-right free for Ask Abrams
};

export default nextConfig;
