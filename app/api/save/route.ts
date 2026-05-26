import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, verifyIdToken } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/save
 * Body: { type: "storyboard" | "suno" | "detail", data: {...} }
 * Auth: Bearer <Firebase ID token>
 *
 * Saves to users/{uid}/<collection>/{id}  (merge)
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token   = authHeader.slice(7);
    const decoded = await verifyIdToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const { type, data } = body as { type: string; data: Record<string, unknown> };
    const db = getAdminDb();

    const collections: Record<string, string> = {
      storyboard: "storyboards",
      suno:       "sunoTracks",
      detail:     "detailProjects",
    };

    const collectionName = collections[type];
    if (!collectionName) {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    const id = (data.id as string) || db.collection("_tmp").doc().id;
    const ref = db.collection("users").doc(decoded.uid).collection(collectionName).doc(id);

    await ref.set({
      ...data,
      id,
      uid:       decoded.uid,
      email:     decoded.email || "",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Save API error:", error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
