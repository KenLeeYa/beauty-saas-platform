import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lumi Beauty",
    short_name: "Lumi",
    description: "美業營運與線上預約平台",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#1f2933",
    lang: "zh-Hant-TW",
  };
}
