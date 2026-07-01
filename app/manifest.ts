import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TekScribe",
    short_name: "TekScribe",
    description: "Voice-to-summary for the trades",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8fb",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
        purpose: "maskable",
      },
    ],
  };
}
