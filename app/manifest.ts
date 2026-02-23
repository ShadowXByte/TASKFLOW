import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TASKFLOW",
    short_name: "TASKFLOW",
    description: "Task and calendar planner",
    start_url: "/workspace",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/unnamed.jpg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        src: "/unnamed.jpg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
