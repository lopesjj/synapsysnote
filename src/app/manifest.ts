import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Synapsys Note",
    short_name: "Synapsys",
    description:
      "Pensado para quem faz concurso público, vestibular ou faculdade. Organize seus estudos com eficiência.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07111C",
    theme_color: "#07111C",
    icons: [
      {
        src: "/icons/mark-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/mark-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
