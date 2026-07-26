import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb } from "@/lib/firebase-admin";

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com").toLowerCase();

export async function GET(req: NextRequest) {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return NextResponse.json({ allowed: false });

  const decoded = await verifyIdToken(h.slice(7));
  if (!decoded?.email) return NextResponse.json({ allowed: false });

  const email = decoded.email.toLowerCase();
  if (email === ADMIN_EMAIL) return NextResponse.json({ allowed: true });

  try {
    const snap = await getAdminDb()
      .collection("allowedUsers")
      .where("email", "==", email)
      .limit(1)
      .get();
    return NextResponse.json({ allowed: !snap.empty });
  } catch {
    return NextResponse.json({ allowed: false });
  }
}
