import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agustina & Agustín",
    short_name: "A&A",
    description: "Nuestro organizador de casamiento",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f1e7",
    theme_color: "#59664a",
    icons: [
      { src: "/icons/wedding-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/wedding-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
