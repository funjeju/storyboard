import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminAuth } from "@/lib/firebase-admin";

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // Whisper API 25MB 한도

function secToSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function toSrt(segments: { start: number; end: number; text: string }[]): string {
  return segments
    .filter(s => s.text?.trim())
    .map((seg, i) => `${i + 1}\n${secToSrtTime(seg.start)} --> ${secToSrtTime(seg.end)}\n${seg.text.trim()}`)
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  let storageFilePath: string | null = null;

  try {
    // 1. 인증
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "유효하지 않은 토큰입니다." }, { status: 401 });
    }

    // 2. 본문 파싱
    const { mp3Path, mp3MimeType, mp3Name, txtContent } = await req.json();
    if (!mp3Path || typeof mp3Path !== "string") {
      return NextResponse.json({ error: "mp3Path가 필요합니다." }, { status: 400 });
    }

    // 3. 경로 검증 — 본인 폴더만 허용
    if (!mp3Path.startsWith(`srt_temp/${uid}/`)) {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }
    storageFilePath = mp3Path;

    // 4. Storage에서 다운로드
    const bucket = getStorage(getAdminApp()).bucket();
    const file = bucket.file(mp3Path);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: "업로드된 파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const [buffer] = await file.download();
    if (buffer.length > WHISPER_MAX_BYTES) {
      return NextResponse.json({
        error: `오디오 파일이 너무 큽니다 (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Whisper는 25MB까지 지원합니다.`,
      }, { status: 413 });
    }

    const mimeType = mp3MimeType || "audio/mpeg";
    const ext = (mp3Name?.split(".").pop() || "mp3").toLowerCase();
    const audioFile = new File([new Uint8Array(buffer)], `audio.${ext}`, { type: mimeType });

    // TXT 스크립트가 있으면 prompt로 주입 — 정확도 향상 (Whisper prompt 한도)
    const promptText = txtContent
      ? String(txtContent).slice(0, 800).replace(/\s+/g, " ").trim()
      : undefined;

    // 5. Whisper — verbose_json + segment 타임스탬프
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      prompt: promptText,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transcription as any;
    const segments = t.segments as Array<{ start: number; end: number; text: string }> | undefined;

    let srt: string;
    if (segments?.length) {
      srt = toSrt(segments.map(s => ({ start: s.start, end: s.end, text: s.text })));
    } else {
      const fullText = t.text || "";
      if (!fullText.trim()) {
        return NextResponse.json({ error: "자막 세그먼트를 생성하지 못했습니다." }, { status: 422 });
      }
      srt = toSrt([{ start: 0, end: t.duration || 60, text: fullText }]);
    }

    return NextResponse.json({ srt });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.";
    console.error("SRT generate error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    // 6. 임시 파일 삭제
    if (storageFilePath) {
      try {
        await getStorage(getAdminApp()).bucket().file(storageFilePath).delete();
      } catch (e) {
        console.warn("[SRT] 임시 파일 삭제 실패:", storageFilePath, e);
      }
    }
  }
}
