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

// 매칭용 토큰 정규화 (영문 소문자화, 구두점 제거, 한글 유지)
function normToken(s: string): string {
  return s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "");
}

interface RecWord { word: string; start: number; end: number }

/**
 * 포스드 얼라인먼트(lite):
 * 사용자가 제공한 가사 줄(lyricLines)을 Whisper 단어 타임스탬프(words)에 정렬한다.
 * 자막 텍스트 = 가사 원문 그대로 / 타이밍 = 인식된 단어와 LCS 매칭 후 보간.
 */
function alignLyrics(
  lyricLines: string[],
  words: RecWord[],
  duration: number,
): { start: number; end: number; text: string }[] {
  // 가사 토큰 (어느 줄 소속인지 추적)
  const lyr: { norm: string; line: number }[] = [];
  lyricLines.forEach((line, li) => {
    for (const tok of line.split(/\s+/)) {
      const n = normToken(tok);
      if (n) lyr.push({ norm: n, line: li });
    }
  });
  // 인식 단어 토큰
  const rec: { norm: string; start: number; end: number }[] = [];
  for (const w of words) {
    const n = normToken(w.word);
    if (n) rec.push({ norm: n, start: w.start, end: w.end });
  }

  const N = lyr.length, M = rec.length;
  const tokStart: (number | null)[] = new Array(N).fill(null);
  const tokEnd: (number | null)[] = new Array(N).fill(null);

  // LCS DP (가사 토큰 ↔ 인식 토큰) → 순서를 지키며 최대 매칭
  if (N && M && N * M <= 6_000_000) {
    const dir = new Uint8Array(N * M); // 1=match, 2=up, 3=left
    const prev = new Int32Array(M + 1);
    const cur = new Int32Array(M + 1);
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= M; j++) {
        if (lyr[i - 1].norm === rec[j - 1].norm) {
          cur[j] = prev[j - 1] + 1; dir[(i - 1) * M + (j - 1)] = 1;
        } else if (prev[j] >= cur[j - 1]) {
          cur[j] = prev[j]; dir[(i - 1) * M + (j - 1)] = 2;
        } else {
          cur[j] = cur[j - 1]; dir[(i - 1) * M + (j - 1)] = 3;
        }
      }
      prev.set(cur); cur.fill(0);
    }
    let i = N, j = M;
    while (i > 0 && j > 0) {
      const d = dir[(i - 1) * M + (j - 1)];
      if (d === 1) { tokStart[i - 1] = rec[j - 1].start; tokEnd[i - 1] = rec[j - 1].end; i--; j--; }
      else if (d === 2) { i--; } else { j--; }
    }
  }

  // 줄 단위 시간 (매칭된 토큰에서)
  const L = lyricLines.length;
  const lineStart: (number | null)[] = new Array(L).fill(null);
  const lineEnd: (number | null)[] = new Array(L).fill(null);
  for (let k = 0; k < N; k++) {
    if (tokStart[k] == null) continue;
    const ln = lyr[k].line;
    if (lineStart[ln] == null || (tokStart[k] as number) < (lineStart[ln] as number)) lineStart[ln] = tokStart[k];
    if (lineEnd[ln] == null || (tokEnd[k] as number) > (lineEnd[ln] as number)) lineEnd[ln] = tokEnd[k];
  }

  // 빈 줄 시작시간 선형 보간
  const starts: number[] = new Array(L).fill(0);
  for (let li = 0; li < L; li++) {
    if (lineStart[li] != null) { starts[li] = lineStart[li] as number; continue; }
    let p = li - 1; while (p >= 0 && lineStart[p] == null) p--;
    let nx = li + 1; while (nx < L && lineStart[nx] == null) nx++;
    const prevT = p >= 0 ? (lineStart[p] as number) : 0;
    const nextT = nx < L ? (lineStart[nx] as number) : (duration || prevT + (L - p) * 2.5);
    const span = nx - p;
    starts[li] = prevT + ((nextT - prevT) * (li - p)) / span;
  }

  // 종료시간 = 자체 매칭 끝 또는 다음 줄 시작 (겹침 방지)
  const ends: number[] = new Array(L).fill(0);
  for (let li = 0; li < L; li++) {
    const nextStart = li + 1 < L ? starts[li + 1] : (duration || starts[li] + 2.5);
    let end = lineEnd[li] != null ? Math.max(lineEnd[li] as number, starts[li] + 0.4) : nextStart;
    end = Math.min(end, nextStart);
    if (end <= starts[li]) end = starts[li] + 0.8;
    ends[li] = end;
  }
  // 단조 증가 보정
  for (let li = 1; li < L; li++) {
    if (starts[li] < ends[li - 1]) starts[li] = ends[li - 1];
    if (ends[li] < starts[li] + 0.4) ends[li] = starts[li] + 0.8;
  }

  return lyricLines.map((line, li) => ({ start: starts[li], end: ends[li], text: line }));
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

    // 가사 줄 분리 (제공된 경우) — 정렬용 + prompt 힌트용
    const lyricsRaw = txtContent ? String(txtContent) : "";
    const lyricLines = lyricsRaw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      // 섹션 마커([Verse 1], [Chorus], (간주) 등)는 자막에서 제외
      .filter(l => !/^[[(][^\])]*[\])]$/.test(l));
    const promptText = lyricsRaw
      ? lyricsRaw.replace(/\s+/g, " ").slice(0, 800).trim()
      : undefined;

    // 가사가 한글 위주면 언어 고정 (인식 정확도 ↑, 언어 오인식 방지)
    const language = lyricsRaw && /[가-힣]/.test(lyricsRaw) ? "ko" : undefined;

    // 5. Whisper — verbose_json + 단어 단위 타임스탬프(정렬용) + 세그먼트
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
      temperature: 0, // 환각/반복 억제
      prompt: promptText,
      ...(language ? { language } : {}),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transcription as any;
    const words = t.words as RecWord[] | undefined;
    const segments = t.segments as Array<{ start: number; end: number; text: string }> | undefined;
    const duration: number = t.duration || 0;

    let srt: string;
    if (lyricLines.length && words?.length) {
      // ✅ 포스드 얼라인먼트: 가사 원문 + Whisper 단어 타임스탬프 정렬
      srt = toSrt(alignLyrics(lyricLines, words, duration));
    } else if (segments?.length) {
      // 가사 미제공: Whisper 세그먼트 그대로
      srt = toSrt(segments.map(s => ({ start: s.start, end: s.end, text: s.text })));
    } else {
      const fullText = t.text || "";
      if (!fullText.trim()) {
        return NextResponse.json({ error: "자막 세그먼트를 생성하지 못했습니다." }, { status: 422 });
      }
      srt = toSrt([{ start: 0, end: duration || 60, text: fullText }]);
    }

    return NextResponse.json({ srt, aligned: lyricLines.length > 0 && !!words?.length });
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
