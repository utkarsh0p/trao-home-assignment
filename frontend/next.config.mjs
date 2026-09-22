import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The backend at the repo root has its own lockfile, so Turbopack otherwise infers
  // the parent directory as the workspace root and warns on every build.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
