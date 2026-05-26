/**
 * Firestore CRUD helpers for all three tools.
 * All user data lives under  users/{uid}/<collection>
 * so Firestore security rules can be   allow read, write: if request.auth.uid == resource.data.uid;
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CloudSunoTrack {
  id: string;              // Firestore doc ID
  uid: string;
  title: string;
  stylePrompt: string;
  lyrics: string | null;
  genre: string;
  mood: string;
  vocal: string;
  topic: string;
  createdAt: number;
  updatedAt: number;
  status: "completed";
  audioStoragePath: string | null;  // Firebase Storage path for uploaded mp3
  audioUrl: string | null;          // download URL once uploaded
}

export interface CloudDetailProject {
  id: string;
  uid: string;
  productName: string;
  platform: string;
  tone: string;
  status: "in-progress" | "completed";
  completedSections: number;
  totalSections: number;
  createdAt: number;
  updatedAt: number;
  projectData: string;   // JSON.stringify(ProjectState)
}

export interface CloudStoryboard {
  id: string;
  uid: string;
  topic: string;
  solution: string;
  style: string;
  mood: string;
  durationSec: number;
  status: "in-progress" | "completed";
  cutsGenerated: number;
  totalCuts: number;
  createdAt: number;
  updatedAt: number;
  storyboardData: string;   // JSON.stringify(full state)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function col(uid: string, name: string) {
  if (!db) throw new Error("Firestore not initialised");
  return collection(db, "users", uid, name);
}
function d(uid: string, name: string, id: string) {
  if (!db) throw new Error("Firestore not initialised");
  return doc(db, "users", uid, name, id);
}

// ─── Suno Tracks ────────────────────────────────────────────────────────────

export async function upsertSunoTrack(uid: string, track: Omit<CloudSunoTrack, "uid">) {
  const ref = d(uid, "sunoTracks", track.id);
  await setDoc(ref, { ...track, uid, updatedAt: Date.now() }, { merge: true });
}

export async function deleteSunoTrack(uid: string, trackId: string) {
  await deleteDoc(d(uid, "sunoTracks", trackId));
}

export function subscribeToSunoTracks(
  uid: string,
  cb: (tracks: CloudSunoTrack[]) => void,
): Unsubscribe {
  const q = query(col(uid, "sunoTracks"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => d.data() as CloudSunoTrack));
  });
}

export async function getSunoTrack(uid: string, trackId: string): Promise<CloudSunoTrack | null> {
  const snap = await getDoc(d(uid, "sunoTracks", trackId));
  return snap.exists() ? (snap.data() as CloudSunoTrack) : null;
}

// ─── Detail Projects ─────────────────────────────────────────────────────────

export async function upsertDetailProject(uid: string, project: Omit<CloudDetailProject, "uid">) {
  const ref = d(uid, "detailProjects", project.id);
  await setDoc(ref, { ...project, uid, updatedAt: Date.now() }, { merge: true });
}

export async function deleteDetailProject(uid: string, projectId: string) {
  await deleteDoc(d(uid, "detailProjects", projectId));
}

export function subscribeToDetailProjects(
  uid: string,
  cb: (projects: CloudDetailProject[]) => void,
): Unsubscribe {
  const q = query(col(uid, "detailProjects"), orderBy("updatedAt", "desc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => d.data() as CloudDetailProject));
  });
}

export async function getDetailProject(uid: string, projectId: string): Promise<CloudDetailProject | null> {
  const snap = await getDoc(d(uid, "detailProjects", projectId));
  return snap.exists() ? (snap.data() as CloudDetailProject) : null;
}

// ─── Storyboards ─────────────────────────────────────────────────────────────

export async function upsertStoryboard(uid: string, sb: Omit<CloudStoryboard, "uid">) {
  const ref = d(uid, "storyboards", sb.id);
  await setDoc(ref, { ...sb, uid, updatedAt: Date.now() }, { merge: true });
}

export async function deleteStoryboard(uid: string, sbId: string) {
  await deleteDoc(d(uid, "storyboards", sbId));
}

export function subscribeToStoryboards(
  uid: string,
  cb: (sbs: CloudStoryboard[]) => void,
): Unsubscribe {
  const q = query(col(uid, "storyboards"), orderBy("updatedAt", "desc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => d.data() as CloudStoryboard));
  });
}

export async function getStoryboard(uid: string, sbId: string): Promise<CloudStoryboard | null> {
  const snap = await getDoc(d(uid, "storyboards", sbId));
  return snap.exists() ? (snap.data() as CloudStoryboard) : null;
}
