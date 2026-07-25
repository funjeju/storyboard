import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, verifyIdToken } from "@/lib/firebase-admin";

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com").toLowerCase();

export async function GET(req: NextRequest) {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const decoded = await verifyIdToken(h.slice(7));
  if (!decoded || (decoded.email || "").toLowerCase() !== ADMIN_EMAIL)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(searchParams.get("days")) || 30));
    const since = Date.now() - days * 86_400_000;

    const snap = await getAdminDb()
      .collection("apiUsageLogs")
      .where("ts", ">=", since)
      .orderBy("ts", "desc")
      .limit(1000)
      .get();

    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 요약 통계
    let serverCount = 0;
    let byokCount = 0;
    let googleCount = 0;
    let openaiCount = 0;
    const byUser = new Map<string, number>();
    const byEndpoint = new Map<string, number>();

    for (const l of logs as Array<Record<string, unknown>>) {
      if (l.keySource === "server") serverCount++;
      else byokCount++;
      if (l.provider === "google") googleCount++;
      else openaiCount++;
      const email = (l.email as string) || "unknown";
      byUser.set(email, (byUser.get(email) || 0) + 1);
      const ep = (l.endpoint as string) || "unknown";
      byEndpoint.set(ep, (byEndpoint.get(ep) || 0) + 1);
    }

    return NextResponse.json({
      days,
      logs,
      summary: {
        total: logs.length,
        serverCount,
        byokCount,
        googleCount,
        openaiCount,
        topUsers: [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ k, n })),
        topEndpoints: [...byEndpoint.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ k, n })),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
