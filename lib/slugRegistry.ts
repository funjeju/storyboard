import {
  collection, doc, setDoc, getDocs, updateDoc, increment,
  query, where, orderBy, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RESERVED_SLUGS } from "@/lib/slugConstants";

export interface UrlRecord {
  id: string;
  slug: string;
  target_url: string;
  project_type: "homepage" | "tool" | "campaign" | "custom";
  project_id?: string;
  owner_id?: string;
  created_at: number;
  click_count: number;
  status: "active" | "deleted";
}

export { RESERVED_SLUGS, generateRandomSlug } from "@/lib/slugConstants";

function col() {
  if (!db) throw new Error("Firestore not initialised");
  return collection(db, "url_registry");
}
function docRef(id: string) {
  if (!db) throw new Error("Firestore not initialised");
  return doc(db, "url_registry", id);
}

export async function getBySlug(slug: string): Promise<UrlRecord | null> {
  const q = query(col(), where("slug", "==", slug), where("status", "==", "active"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as UrlRecord;
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (RESERVED_SLUGS.has(slug)) return false;
  const record = await getBySlug(slug);
  return record === null;
}

export async function createSlugRecord(record: UrlRecord): Promise<void> {
  await setDoc(docRef(record.id), record);
}

export async function incrementClick(id: string): Promise<void> {
  await updateDoc(docRef(id), { click_count: increment(1) });
}

export async function deleteSlugRecord(id: string): Promise<void> {
  await updateDoc(docRef(id), { status: "deleted" });
}

export async function getAllSlugs(): Promise<UrlRecord[]> {
  const q = query(col(), orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as UrlRecord);
}

