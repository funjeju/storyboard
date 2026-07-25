import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import { invalidateAllowedCache } from "@/lib/aiKey";

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com").toLowerCase();

async function requireAdmin(req: NextRequest) {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const decoded = await verifyIdToken(h.slice(7));
  if (!decoded || (decoded.email || "").toLowerCase() !== ADMIN_EMAIL) return null;
  return decoded;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const listResult = await getAdminAuth().listUsers(1000);
    const users = listResult.users.map(u => ({
      uid: u.uid,
      email: u.email || "",
      name: u.displayName || "",
      photoURL: u.photoURL || "",
      lastSignIn: u.metadata.lastSignInTime || "",
      createdAt: u.metadata.creationTime || "",
    }));

    const snap = await getAdminDb().collection("allowedUsers").get();
    const allowedEmails = new Set(snap.docs.map(d => (d.data().email || "").toLowerCase()));

    return NextResponse.json({
      users: users.map(u => ({
        ...u,
        isOwner: u.email.toLowerCase() === ADMIN_EMAIL,
        isAllowed: allowedEmails.has(u.email.toLowerCase()),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { email, name, photoURL, uid } = await req.json();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const existing = await getAdminDb().collection("allowedUsers")
      .where("email", "==", email.toLowerCase()).limit(1).get();
    if (!existing.empty) return NextResponse.json({ error: "already allowed" }, { status: 409 });

    await getAdminDb().collection("allowedUsers").add({
      email: email.toLowerCase(),
      name: name || "",
      photoURL: photoURL || "",
      uid: uid || "",
      grantedAt: Date.now(),
      grantedBy: ADMIN_EMAIL,
    });

    invalidateAllowedCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const snap = await getAdminDb().collection("allowedUsers")
      .where("email", "==", email.toLowerCase()).get();

    const batch = getAdminDb().batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    invalidateAllowedCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
