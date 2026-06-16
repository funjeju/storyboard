/**
 * Firebase Storage helpers for binary assets:
 *   - Audio files (Suno mp3 uploads)
 *   - Images (Detail page / Storyboard generated images)
 */

import { initializeApp, getApps } from "firebase/app";
import {
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

// Reuse the same Firebase app instance
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getStorageInstance() {
  if (typeof window === "undefined") return null;
  if (!firebaseConfig.apiKey || !firebaseConfig.storageBucket) return null;
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getStorage(app);
}

// ─── Audio ──────────────────────────────────────────────────────────────────

/**
 * Upload an audio Blob to Firebase Storage.
 * @returns storage path (to store in Firestore) + download URL
 */
export async function uploadAudio(
  uid: string,
  trackId: string,
  blob: Blob,
): Promise<{ path: string; url: string }> {
  const storage = getStorageInstance();
  if (!storage) throw new Error("Firebase Storage not initialised");
  const ext = blob.type.includes("wav") ? "wav" : "mp3";
  const path = `users/${uid}/audio/${trackId}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return { path, url };
}

export async function deleteStorageFile(path: string) {
  const storage = getStorageInstance();
  if (!storage) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // file may not exist — ignore
  }
}

export async function getStorageUrl(path: string): Promise<string | null> {
  const storage = getStorageInstance();
  if (!storage) return null;
  try {
    return await getDownloadURL(ref(storage, path));
  } catch {
    return null;
  }
}

// ─── Video (AutoCut) ────────────────────────────────────────────────────────

export async function uploadVideoFile(
  jobId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ path: string; url: string }> {
  const storage = getStorageInstance();
  if (!storage) throw new Error("Firebase Storage not initialised");
  const path = `autocut/${jobId}/${file.name}`;
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ path, url });
      },
    );
  });
}

// ─── Images (base64 data URL → Storage) ─────────────────────────────────────

/**
 * Upload a base64 data URL image to Firebase Storage.
 * @returns storage path + download URL
 */
export async function uploadImageDataUrl(
  uid: string,
  folder: string,   // e.g. "detail/{projectId}" or "storyboard/{projectId}"
  filename: string, // e.g. "hook.jpg"
  dataUrl: string,
): Promise<{ path: string; url: string }> {
  const storage = getStorageInstance();
  if (!storage) throw new Error("Firebase Storage not initialised");

  // Convert base64 data URL to Blob
  const [meta, b64] = dataUrl.split(",");
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const byteChars = atob(b64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNums)], { type: mime });

  const path = `users/${uid}/${folder}/${filename}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return { path, url };
}

// ─── Poster images (공모전 / 프로젝트 포스터) ─────────────────────────────────

export async function uploadPosterImage(
  posterId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ path: string; url: string }> {
  const storage = getStorageInstance();
  if (!storage) throw new Error("Firebase Storage not initialised");
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const path = `posters/${posterId}/${safeName}`;
  const storageRef = ref(storage, path);
  if (onProgress) {
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file);
      task.on("state_changed",
        snap => onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        () => resolve(),
      );
    });
  } else {
    await uploadBytes(storageRef, file);
  }
  const url = await getDownloadURL(storageRef);
  return { path, url };
}

// ─── Board files (audio / ppt / image File objects) ──────────────────────────

export async function uploadBoardFile(
  boardId: string,
  subPath: string,   // e.g. "audio" | "ppt"
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ path: string; url: string }> {
  const storage = getStorageInstance();
  if (!storage) throw new Error("Firebase Storage not initialised");
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const path = `actionboards/${boardId}/${subPath}/${safeName}`;
  const storageRef = ref(storage, path);
  if (onProgress) {
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file);
      task.on("state_changed",
        snap => onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        () => resolve(),
      );
    });
  } else {
    await uploadBytes(storageRef, file);
  }
  const url = await getDownloadURL(storageRef);
  return { path, url };
}
