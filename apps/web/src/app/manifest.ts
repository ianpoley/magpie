import type { MetadataRoute } from "next";

const CANVAS = "oklch(0.972 0.014 235)";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Magpie",
    short_name: "Magpie",
    description: "Every post you bookmarked or liked on X, sorted into topics.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: CANVAS,
    theme_color: CANVAS,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
