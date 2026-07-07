import type { MetadataRoute } from "next";

const SITE = "https://storyboard-ruddy-ten.vercel.app";

// 공개 도구 페이지 (검색 노출 대상)
const ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1.0 },
  { path: "/heic", priority: 0.9 },
  { path: "/suno", priority: 0.8 },
  { path: "/detail", priority: 0.8 },
  { path: "/detail2", priority: 0.8 },
  { path: "/srt", priority: 0.8 },
  { path: "/storyboard", priority: 0.7 },
  { path: "/thumbnail", priority: 0.7 },
  { path: "/metaprompt", priority: 0.7 },
  { path: "/mapboard", priority: 0.6 },
  { path: "/actionboard", priority: 0.6 },
  { path: "/feed", priority: 0.6 },
  { path: "/url", priority: 0.5 },
  { path: "/qr", priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map(r => ({
    url: `${SITE}${r.path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: r.priority,
  }));
}
