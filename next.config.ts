import type { NextConfig } from "next";

// Site estático para o GitHub Pages. BASE_PATH = nome do repositório (ex.: /foodops-ai).
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.BASE_PATH || "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
