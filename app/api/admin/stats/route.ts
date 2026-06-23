import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, verifyIdToken } from "@/lib/firebase-admin";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com";

interface PV {
  ts: number; path: string; ref: string; vid: string;
  uid: string | null; email: string | null; name: string | null;
  lang: string; device: string; os: string; browser: string;
  country: string; region: string; city: string;
}

function topCounts(rows: PV[], pick: (r: PV) => string, limit = 12) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = (pick(r) || "(없음)").trim() || "(없음)";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, n]) => ({ k, n }));
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const decoded = await verifyIdToken(auth.slice(7));
    if (!decoded || decoded.email !== ADMIN_EMAIL) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
    const since = Date.now() - days * 86400000;

    const snap = await getAdminDb().collection("pageviews")
      .where("ts", ">=", since).orderBy("ts", "desc").limit(20000).get();
    const rows = snap.docs.map(d => d.data() as PV);

    // 순방문자 / 신규·재방문
    const vidCount = new Map<string, number>();
    rows.forEach(r => vidCount.set(r.vid, (vidCount.get(r.vid) || 0) + 1));
    const visitors = vidCount.size;
    const returningVisitors = [...vidCount.values()].filter(n => n > 1).length;

    const loggedInViews = rows.filter(r => r.uid).length;
    const loggedInUsers = new Set(rows.filter(r => r.uid).map(r => r.uid)).size;

    // 일자별
    const dayMap = new Map<string, number>();
    const hour = new Array(24).fill(0);
    for (const r of rows) {
      const d = new Date(r.ts);
      const ds = `${d.getMonth() + 1}/${d.getDate()}`;
      dayMap.set(ds, (dayMap.get(ds) || 0) + 1);
      hour[d.getHours()]++;
    }
    // 날짜 정렬(시간순)
    const byDay: { d: string; n: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000);
      const ds = `${dt.getMonth() + 1}/${dt.getDate()}`;
      byDay.push({ d: ds, n: dayMap.get(ds) || 0 });
    }

    const recent = rows.slice(0, 25).map(r => ({
      ts: r.ts, path: r.path, device: r.device, browser: r.browser, os: r.os,
      country: r.country, region: r.region, city: r.city,
      email: r.email, name: r.name, ref: r.ref,
    }));

    return NextResponse.json({
      days,
      totals: { views: rows.length, visitors, returningVisitors, loggedInViews, loggedInUsers },
      byDay,
      byHour: hour.map((n, h) => ({ h, n })),
      device: topCounts(rows, r => r.device, 5),
      os: topCounts(rows, r => r.os, 8),
      browser: topCounts(rows, r => r.browser, 10),
      country: topCounts(rows, r => r.country || "(미상)", 10),
      region: topCounts(rows, r => r.region || "(미상)", 12),
      city: topCounts(rows, r => r.city || "(미상)", 12),
      lang: topCounts(rows, r => r.lang, 8),
      paths: topCounts(rows, r => r.path, 15),
      referrers: topCounts(rows, r => r.ref, 12),
      recent,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
