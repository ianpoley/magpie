import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

const SERVICE_BUILDS = [".next-a", ".next-b"];
const DEFAULT_BUILD = ".next";

function liveServiceBuild(): string {
  try {
    const name = readFileSync(join(process.cwd(), ".next-active"), "utf8").trim();
    return SERVICE_BUILDS.includes(name) ? name : DEFAULT_BUILD;
  } catch {
    return DEFAULT_BUILD;
  }
}

function distDir(phase: string): string {
  if (phase === PHASE_DEVELOPMENT_SERVER) return DEFAULT_BUILD;
  if (phase === PHASE_PRODUCTION_BUILD) return process.env.MAGPIE_NEXT_DIST || DEFAULT_BUILD;
  return process.env.MAGPIE_NEXT_DIST || liveServiceBuild();
}

export default function nextConfig(phase: string): NextConfig {
  return {
    cacheComponents: true,
    distDir: distDir(phase),
    experimental: {
      serverActions: {
        bodySizeLimit: "8mb",
      },
    },
    partialPrefetching: true,
    reactCompiler: true,
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
