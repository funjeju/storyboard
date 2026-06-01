import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { RESERVED_SLUGS, generateRandomSlug } from "@/lib/slugConstants";
import type { UrlRecord } from "@/lib/slugRegistry";

const BASE_URL = process.env.NEXT_PUBLIC_SLUG_BASE_URL ?? "https://study.funjeju.com";

function authCheck(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key");
  return key === process.env.SLUG_API_KEY;
}

async function slugExists(db: FirebaseFirestore.Firestore, slug: string): Promise<boolean> {
  if (RESERVED_SLUGS.has(slug)) return true;
  const snap = await db.collection("url_registry")
    .where("slug", "==", slug)
    .where("status", "==", "active")
    .limit(1)
    .get();
  return !snap.empty;
}

async function resolveSlug(db: FirebaseFirestore.Firestore, preferred?: string): Promise<string> {
  // 1. 사용자 입력 slug 시도
  if (preferred) {
    const clean = preferred.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 50);
    if (clean && !await slugExists(db, clean)) return clean;
    // 충돌 시 suffix 추가
    for (let i = 1; i <= 9; i++) {
      const candidate = `${clean}-${i}`;
      if (!await slugExists(db, candidate)) return candidate;
    }
  }
  // 2. 랜덤 생성
  for (let i = 0; i < 10; i++) {
    const candidate = generateRandomSlug(6);
    if (!await slugExists(db, candidate)) return candidate;
  }
  throw new Error("slug 생성 실패 — 재시도해주세요");
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { target_url, preferred_slug, project_type = "custom", project_id, owner_id } = body;

    if (!target_url) return NextResponse.json({ error: "target_url 필수" }, { status: 400 });

    const db = getAdminDb();
    const slug = await resolveSlug(db, preferred_slug);

    const record: UrlRecord = {
      id: `slug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      slug,
      target_url,
      project_type,
      ...(project_id && { project_id }),
      ...(owner_id && { owner_id }),
      created_at: Date.now(),
      click_count: 0,
      status: "active",
    };

    await db.collection("url_registry").doc(record.id).set(record);

    return NextResponse.json({
      slug,
      short_url: `${BASE_URL}/${slug}`,
      target_url,
      id: record.id,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
