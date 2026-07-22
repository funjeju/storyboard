import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";

// 소유자(무제한, 서버 키 사용) 이메일. 그 외 사용자는 본인 키(BYOK)를 헤더로 보내야 함.
const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com").toLowerCase();

export type AiProvider = "google" | "openai";

const HEADER: Record<AiProvider, string> = {
  google: "x-user-google-key",
  openai: "x-user-openai-key",
};

// 키가 없을 때 던지는 에러 — keyErrorResponse로 401 응답 변환
export class KeyRequiredError extends Error {
  provider: AiProvider;
  constructor(provider: AiProvider) {
    super(provider === "google" ? "GOOGLE_KEY_REQUIRED" : "OPENAI_KEY_REQUIRED");
    this.provider = provider;
    this.name = "KeyRequiredError";
  }
}

async function isOwner(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const decoded = await verifyIdToken(auth.slice(7));
  return !!decoded && (decoded.email || "").toLowerCase() === ADMIN_EMAIL;
}

/**
 * 이 요청에 사용할 API 키를 결정한다.
 * - 소유자 계정이면 서버 환경변수 키(무제한)
 * - 그 외 사용자는 요청 헤더로 보낸 본인 키
 * - 둘 다 없으면 KeyRequiredError (→ 401, 클라이언트가 키 입력 유도)
 */
export async function resolveKey(req: Request, provider: AiProvider): Promise<string> {
  const envKey = provider === "google" ? process.env.GOOGLE_AI_API_KEY : process.env.OPENAI_API_KEY;
  if (envKey && (await isOwner(req))) return envKey;

  const userKey = req.headers.get(HEADER[provider]);
  if (userKey && userKey.trim()) return userKey.trim();

  throw new KeyRequiredError(provider);
}

// KeyRequiredError면 401 JSON을 반환, 아니면 null(호출부가 다시 throw)
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
