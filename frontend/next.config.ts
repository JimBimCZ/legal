import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Static export otherwise emits privacy.html next to an empty privacy/
  // directory (RSC payloads only, no index.html). Starlette's StaticFiles
  // maps a directory to <dir>/index.html but never appends .html to a bare
  // path, so /privacy 404s. trailingSlash makes every route a directory with
  // its own index.html, which StaticFiles resolves correctly.
  trailingSlash: true,
};

export default nextConfig;
