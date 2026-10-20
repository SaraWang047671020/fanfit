import type { MetadataRoute } from "next";

// "Add to home screen": opens the fan side like an app (no browser bar), starting at the fan home page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FanFit — deals from your team's partners",
    short_name: "FanFit",
    description: "Claim deals from local businesses that partner with your team.",
    start_url: "/fans",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#f5f7fb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
