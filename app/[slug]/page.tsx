import { redirect, notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export default async function SlugRedirectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let targetUrl: string;

  try {
    const db = getAdminDb();
    const snap = await db.collection("url_registry")
      .where("slug", "==", slug)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (snap.empty) return notFound();

    const docSnap = snap.docs[0];
    const { target_url, id } = docSnap.data() as { target_url: string; id: string };

    db.collection("url_registry").doc(id)
      .update({ click_count: FieldValue.increment(1) })
      .catch(() => {});

    targetUrl = target_url;
  } catch {
    return notFound();
  }

  redirect(targetUrl);
}
