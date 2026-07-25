import { NextResponse } from "next/server";
import { verifyIdToken, getAdminDb } from "@/lib/firebase-admin";

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com").toLowerCase();

export type AiProvider = "google" | "openai";

const HEADER: Record<AiProvider, string> = {
  google: "x-user-google-key",
  openai: "x-user-openai-key",
};

export class KeyRequiredError extends Error {
  provider: AiProvider;
  constructor(provider: AiProvider) {
    super(provider === "google" ? "GOOGLE_KEY_REQUIRED" : "OPENAI_KEY_REQUIRED");
    this.provider = provider;
    this.name = "KeyRequiredError";
  }
}

// ── 허용된 사용자 캐시 (서버 측, 1분 TTL) ──────────────────────────────────
let allowedCache: Set<string> | null = null;
let cacheTick = 0;

async function loadAllowed(): Promise<Set<string>> {
  if (allowedCache && Date.now() - cacheTick < 60_000) return allowedCache;
  try {
    const snap = await getAdminDb().collection("allowedUsers").get();
    allowedCache = new Set(snap.docs.map(d => (d.data().email || "").toLowerCase()));
  } catch {
    allowedCache = new Set();
  }
  cacheTick = Date.now();
  return allowedCache;
}

export function invalidateAllowedCache() {
  allowedCache = null;
  cacheTick = 0;
}

// ── 요청에서 사용자 정보 추출 ──────────────────────────────────────────────
interface ReqUser { uid: string; email: string; name: string }

async function extractUser(req: Request): Promise<ReqUser | null> {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const decoded = await verifyIdToken(h.slice(7));
  if (!decoded?.email) return null;
  return { uid: decoded.uid, email: decoded.email.toLowerCase(), name: decoded.name || "" };
}

async function canUseServerKey(req: Request): Promise<{ ok: boolean; user: ReqUser | null }> {
  const user = await extractUser(req);
  if (!user) return { ok: false, user: null };
  if (user.email === ADMIN_EMAIL) return { ok: true, user };
  const set = await loadAllowed();
  return { ok: set.has(user.email), user };
}

// ── API 사용 로그 (fire-and-forget) ────────────────────────────────────────
function logUsage(req: Request, user: ReqUser, provider: AiProvider, keySource: "server" | "byok") {
  try {
    const url = new URL(req.url);
    getAdminDb().collection("apiUsageLogs").add({
      ts: Date.now(),
      uid: user.uid,
      email: user.email,
      name: user.name,
      endpoint: url.pathname,
      provider,
      keySource,
    }).catch(() => {});
  } catch { /* ignore */ }
}

/**
 * 이 요청에 사용할 API 키를 결정한다.
 * - 소유자 또는 허용된 사용자 → 서버 환경변수 키(무제한)
 * - 그 외 사용자 → 요청 헤더로 보낸 본인 키(BYOK)
 * - 둘 다 없으면 KeyRequiredError → 401
 */
export async function resolveKey(req: Request, provider: AiProvider): Promise<string> {
  const envKey = provider === "google" ? process.env.GOOGLE_AI_API_KEY : process.env.OPENAI_API_KEY;
  const { ok, user } = await canUseServerKey(req);

  if (envKey && ok && user) {
    logUsage(req, user, provider, "server");
    return envKey;
  }

  const userKey = req.headers.get(HEADER[provider]);
  if (userKey && userKey.trim()) {
    if (user) logUsage(req, user, provider, "byok");
    return userKey.trim();
  }

  throw new KeyRequiredError(provider);
}

export function keyErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof KeyRequiredError) {
    return NextResponse.json(
      {
        error: "api_key_required",
        provider: e.provider,
        message:
          e.provider === "google"
            ? "이 도구는 소유자 전용입니다. 계속하려면 본인의 Google AI(Gemini) API 키를 입력하세요."
            : "이 도구는 소유자 전용입니다. 계속하려면 본인의 OpenAI API 키를 입력하세요.",
      },
      { status: 401 },
    );
  }
  return null;
}
