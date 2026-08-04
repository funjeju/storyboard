import { NextRequest, NextResponse } from "next/server";

/**
 * 액션보드 첨부파일 프록시.
 * 브라우저에서 Storage URL을 직접 fetch 하지 못하는 경우(CORS)에만 사용되는 폴백.
 * 임의 URL 프록시(SSRF)를 막기 위해 Firebase Storage 호스트만 허용한다.
 */
const ALLOWED_HOSTS = [
  /^firebasestorage\.googleapis\.com$/,
  /^storage\.googleapis\.com$/,
  /^[a-z0-9-]+\.firebasestorage\.app$/,
];

const MAX_BYTES = 60 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.some(re => re.test(target.hostname))) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const upstream = await fetch(target.toString());
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }

  const len = Number(upstream.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}
