import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath: process.env.BASE_PATH ?? "",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
