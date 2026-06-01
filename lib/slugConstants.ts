export const RESERVED_SLUGS = new Set([
  "api", "url", "feed", "storyboard", "suno", "library", "detail",
  "autocut", "srt", "metaprompt", "actionboard", "dashboard",
  "_next", "favicon.ico", "robots.txt", "sitemap.xml",
]);

export function generateRandomSlug(length = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
