import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

// User-Agent → 기기/OS/브라우저(인앱 포함)
function parseUA(ua: string) {
  const u = ua.toLowerCase();
  const device = /ipad|tablet|playbook|silk/.test(u) ? "태블릿" : /mobi|iphone|android|phone/.test(u) ? "모바일" : "데스크탑";
  const os =
    /iphone|ipad|ios/.test(u) ? "iOS" :
    /android/.test(u) ? "Android" :
    /windows/.test(u) ? "Windows" :
    /mac os|macintosh/.test(u) ? "macOS" :
    /linux/.test(u) ? "Linux" : "기타";
  const browser =
    /kakaotalk/.test(u) ? "카카오톡(인앱)" :
    /naver\(inapp|naver|whale/.test(u) ? "네이버/웨일" :
    /instagram/.test(u) ? "인스타그램(인앱)" :
    /fban|fbav/.test(u) ? "페이스북(인앱)" :
    /edg/.test(u) ? "Edge" :
    /samsungbrowser/.test(u) ? "삼성인터넷" :
    /crios|chrome/.test(u) ? "Chrome" :
    /fxios|firefox/.test(u) ? "Firefox" :
    /safari/.test(u) ? "Safari" : "기타";
  return { device, os, browser };
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const ua = req.headers.get("user-agent") || "";
    const { device, os, browser } = parseUA(ua);

    // Vercel이 주입하는 지오 헤더 (배포 환경)
    const country = req.headers.get("x-vercel-ip-country") || "";
    const region = req.headers.get("x-vercel-ip-country-region") || "";
    let city = req.headers.get("x-vercel-ip-city") || "";
    try { city = decodeURIComponent(city); } catch { /* keep */ }

    const doc = {
      ts: Date.now(),
      path: String(b.path || "/").slice(0, 200),
      ref: String(b.ref || "").slice(0, 200),
      vid: String(b.vid || "").slice(0, 60),
      uid: b.uid ? String(b.uid).slice(0, 80) : null,
      email: b.email ? String(b.email).slice(0, 120) : null,
      name: b.name ? String(b.name).slice(0, 80) : null,
      lang: String(b.lang || "").slice(0, 20),
      vw: Number(b.vw) || 0,
      vh: Number(b.vh) || 0,
      device, os, browser, country, region, city,
    };

    await getAdminDb().collection("pageviews").add(doc);
    return NextResponse.json({ ok: true });
  } catch {
    // 추적 실패는 사용자 경험을 막지 않음
    return NextResponse.json({ ok: false });
  }
}
