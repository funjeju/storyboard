import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, verifyIdToken } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token    = authHeader.slice(7);
    const decoded  = await verifyIdToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const db   = getAdminDb();

    const docRef = await db.collection("storyboards").add({
      userId:    decoded.uid,
      email:     decoded.email || "",
      ...body,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: docRef.id });
  } catch (error) {
    console.error("Save API error:", error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
