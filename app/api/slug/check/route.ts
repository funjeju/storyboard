import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { RESERVED_SLUGS } from "@/lib/slugRegistry";

export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error: "slug 필수" }, { status: 400 });

    const clean = slug.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 50);

    if (RESERVED_SLUGS.has(clean)) {
      return NextResponse.json({ available: false, reason: "예약어" });
    }

    const db = getAdminDb();
    const snap = await db.collection("url_registry")
      .where("slug", "==", clean)
      .where("status", "==", "active")
      .limit(1)
      .get();

    const available = snap.empty;
    const suggestion = available ? null : `${clean}-${Math.floor(Math.random() * 90 + 10)}`;

    return NextResponse.json({ available, slug: clean, suggestion });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
