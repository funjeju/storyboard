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
  increment,
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

// ─── Feed Posts ───────────────────────────────────────────────────────────────

export type FeedCategory = "music" | "video" | "image" | "web";

export interface CloudFeedPost {
  id: string;
  uid: string;
  authorName: string;
  authorPhoto: string;
  category: FeedCategory;
  title: string;
  description?: string;
  // content per category
  audioUrl?: string;      // music
  youtubeUrl?: string;    // video
  imageUrl?: string;      // image
  webUrl?: string;        // web/app
  thumbnailUrl?: string;  // optional override thumbnail
  // stats
  likes: number;
  views: number;
  fromBoardId?: string;   // set if shared from ActionBoard
  createdAt: number;
  updatedAt: number;
}

function feedCol() {
  if (!db) throw new Error("Firestore not initialised");
  return collection(db, "feedPosts");
}
function feedDoc(id: string) {
  if (!db) throw new Error("Firestore not initialised");
  return doc(db, "feedPosts", id);
}

export async function createFeedPost(post: CloudFeedPost) {
  await setDoc(feedDoc(post.id), post);
}

export async function deleteFeedPost(postId: string) {
  await deleteDoc(feedDoc(postId));
}

export async function updateFeedPost(
  postId: string,
  fields: Partial<Pick<CloudFeedPost, "title" | "description" | "youtubeUrl" | "webUrl">>,
) {
  await setDoc(feedDoc(postId), { ...fields, updatedAt: Date.now() }, { merge: true });
}

export async function likeFeedPost(postId: string, delta: 1 | -1) {
  await setDoc(feedDoc(postId), { likes: increment(delta) }, { merge: true });
}

export async function incrementFeedViews(postId: string) {
  await setDoc(feedDoc(postId), { views: increment(1) }, { merge: true });
}

export function subscribeToFeedPosts(
  cb: (posts: CloudFeedPost[]) => void,
  category?: FeedCategory,
): Unsubscribe {
  const base = feedCol();
  const q = category
    ? query(base, orderBy("createdAt", "desc"))
    : query(base, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    let posts = snap.docs.map(d => d.data() as CloudFeedPost);
    if (category) posts = posts.filter(p => p.category === category);
    cb(posts);
  });
}

// ─── Action Boards ────────────────────────────────────────────────────────────

export interface CloudActionBoard {
  id: string;
  uid: string;
  creatorName: string;
  creatorPhoto: string;
  title: string;
  description: string;
  startAt: number;      // posting open timestamp
  endAt: number;        // posting close timestamp
  postCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CloudBoardPost {
  id: string;
  boardId: string;
  uid: string;
  authorName: string;
  authorPhoto: string;
  contentType: "text" | "image" | "audio" | "youtube" | "ppt";
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioName?: string;
  youtubeUrl?: string;
  pptUrl?: string;
  pptName?: string;
  bgColor?: string;        // user-selected card background color
  isAnnouncement?: boolean; // admin-pinned announcement
  createdAt: number;
  x?: number;
  y?: number;
}

function boardsCol() {
  if (!db) throw new Error("Firestore not initialised");
  return collection(db, "actionBoards");
}
function boardDoc(id: string) {
  if (!db) throw new Error("Firestore not initialised");
  return doc(db, "actionBoards", id);
}
function postsCol(boardId: string) {
  if (!db) throw new Error("Firestore not initialised");
  return collection(db, "actionBoards", boardId, "posts");
}
function postDoc(boardId: string, postId: string) {
  if (!db) throw new Error("Firestore not initialised");
  return doc(db, "actionBoards", boardId, "posts", postId);
}

export async function createActionBoard(board: Omit<CloudActionBoard, "updatedAt">) {
  const ref = boardDoc(board.id);
  await setDoc(ref, { ...board, updatedAt: Date.now() });
}

export async function updateActionBoard(id: string, fields: Partial<Pick<CloudActionBoard, "title" | "description" | "startAt" | "endAt">>) {
  await setDoc(boardDoc(id), { ...fields, updatedAt: Date.now() }, { merge: true });
}

export async function deleteActionBoard(id: string) {
  await deleteDoc(boardDoc(id));
}

export async function getActionBoard(id: string): Promise<CloudActionBoard | null> {
  const snap = await getDoc(boardDoc(id));
  return snap.exists() ? (snap.data() as CloudActionBoard) : null;
}

export function subscribeToActionBoards(cb: (boards: CloudActionBoard[]) => void): Unsubscribe {
  const q = query(boardsCol(), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => d.data() as CloudActionBoard)));
}

export async function addBoardPost(boardId: string, post: CloudBoardPost) {
  // Post write is awaited; postCount uses atomic increment (concurrent-safe), fire-and-forget
  await setDoc(postDoc(boardId, post.id), post);
  setDoc(boardDoc(boardId), { postCount: increment(1), updatedAt: Date.now() }, { merge: true }).catch(() => {});
}

export async function deleteBoardPost(boardId: string, postId: string) {
  await deleteDoc(postDoc(boardId, postId));
  setDoc(boardDoc(boardId), { postCount: increment(-1), updatedAt: Date.now() }, { merge: true }).catch(() => {});
}

export async function updateBoardPostPosition(boardId: string, postId: string, x: number, y: number) {
  await setDoc(postDoc(boardId, postId), { x, y }, { merge: true });
}

export async function updateBoardPost(
  boardId: string,
  postId: string,
  fields: Partial<Pick<CloudBoardPost, "text" | "audioName" | "youtubeUrl" | "pptName" | "bgColor">>,
) {
  await setDoc(postDoc(boardId, postId), fields, { merge: true });
}

export function subscribeToBoardPosts(boardId: string, cb: (posts: CloudBoardPost[]) => void): Unsubscribe {
  const q = query(postsCol(boardId), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => d.data() as CloudBoardPost)));
}

// ─── MetaPrompts ─────────────────────────────────────────────────────────────

export interface CloudMetaPrompt {
  id: string;
  uid: string;
  domain: string;
  title: string;        // first user message (truncated)
  finalPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export async function upsertMetaPrompt(uid: string, prompt: Omit<CloudMetaPrompt, "uid">) {
  const ref = d(uid, "metaPrompts", prompt.id);
  await setDoc(ref, { ...prompt, uid, updatedAt: Date.now() }, { merge: true });
}

export async function deleteMetaPrompt(uid: string, promptId: string) {
  await deleteDoc(d(uid, "metaPrompts", promptId));
}

export function subscribeToMetaPrompts(
  uid: string,
  cb: (prompts: CloudMetaPrompt[]) => void,
): Unsubscribe {
  const q = query(col(uid, "metaPrompts"), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => d.data() as CloudMetaPrompt));
  });
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
