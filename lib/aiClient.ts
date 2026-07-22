"use client";

import { auth } from "@/lib/firebase";

// 소유자 이메일 (서버의 ADMIN_EMAIL과 동일해야 함)
export const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com").toLowerCase();

export type AiProvider = "google" | "openai";

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  google: "Google AI (Gemini)",
  openai: "OpenAI",
};

export const PROVIDER_HELP: Record<AiProvider, string> = {
  google: "https://aistudio.google.com/app/apikey",
  openai: "https://platform.openai.com/api-keys",
};

const LS: Record<AiProvider, string> = {
  google: "byok_google_key",
  openai: "byok_openai_key",
};

export function getUserKey(p: AiProvider): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(LS[p]) || ""; } catch { return ""; }
}

export function setUserKey(p: AiProvider, value: string) {
  if (typeof window === "undefined") return;
  try {
    const v = value.trim();
    if (v) localStorage.setItem(LS[p], v);
    else localStorage.removeItem(LS[p]);
  } catch { /* ignore */ }
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === ADMIN_EMAIL;
}

/**
 * AI API 호출용 fetch 래퍼.
 * - 로그인돼 있으면 ID 토큰을 Authorization 헤더로(소유자 판별용)
 * - 저장된 본인 키(BYOK)가 있으면 x-user-*-key 헤더로 첨부
 */
export async function aiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const token = await auth?.currentUser?.getIdToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  } catch { /* not signed in */ }
  const g = getUserKey("google");
  if (g) headers.set("x-user-google-key", g);
  const o = getUserKey("openai");
  if (o) headers.set("x-user-openai-key", o);
  return fetch(input, { ...init, headers });
}
