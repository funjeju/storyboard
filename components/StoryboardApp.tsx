"use client";
import { aiFetch } from "@/lib/aiClient";

import { useState, useEffect } from "react";
import type { Cut, Beat, Storyboard, StoryboardMeta, EmotionStyle } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { upsertStoryboard, getStoryboard } from "@/lib/firestoreHelpers";

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const SOLUTIONS: Record<string, { min: number; max: number; recommended: number }> = {
  "Kling 1.6":    { min: 5, max: 10, recommended: 8  },
  "Kling 3.0":    { min: 5, max: 10, recommended: 10 },
  "Veo 3":        { min: 5, max: 8,  recommended: 8  },
  "Sora":         { min: 5, max: 20, recommended: 15 },
  "Runway Gen-3": { min: 4, max: 16, recommended: 10 },
  "Higgsfield":   { min: 4, max: 10, recommended: 8  },
  "Custom":       { min: 2, max: 60, recommended: 15 },
};

const STYLES = [
  "광고 / Commercial", "브이로그 / Vlog", "영화 / Cinematic",
  "뮤직비디오 / MV", "다큐 / Documentary",
];
const MOODS = [
  "럭셔리 / Luxury", "감성 / Emotional", "레트로 / Retro",
  "미니멀 / Minimal", "다이나믹 / Dynamic", "드라마틱 / Dramatic",
];

const EMOTION_MAP: Record<string, EmotionStyle> = {
  Establishing: { color: "#6366F1", label: "도입",       bg: "rgba(99,102,241,0.13)"  },
  Build:        { color: "#F59E0B", label: "전개",       bg: "rgba(245,158,11,0.13)"  },
  Climax:       { color: "#EF4444", label: "클라이맥스", bg: "rgba(239,68,68,0.13)"   },
  Release:      { color: "#10B981", label: "해소",       bg: "rgba(16,185,129,0.13)"  },
  Brand:        { color: "#FBBf24", label: "브랜드",     bg: "rgba(251,191,36,0.13)"  },
};

const DURATION_PRESETS = [
  { label: "15초", val: 15  }, { label: "30초", val: 30  },
  { label: "1분",  val: 60  }, { label: "2분",  val: 120 },
  { label: "3분",  val: 180 }, { label: "직접입력", val: 0 },
];

// ── HELPERS ────────────────────────────────────────────────────────────────
const fmtSec = (s: number) => {
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const fmtDur = (s: number) => `${Math.round(s * 10) / 10}s`;

function calcCuts(total: number, maxCut: number): Cut[] {
  const n = Math.ceil(total / maxCut);
  return Array.from({ length: n }, (_, i) => {
    const s = Math.round(i * maxCut * 10) / 10;
    const e = Math.min(Math.round((i + 1) * maxCut * 10) / 10, total);
    return { cutNumber: i + 1, timeStart: s, timeEnd: e, duration: Math.round((e - s) * 10) / 10 };
  });
}

async function callClaude(system: string, user: string, maxTokens = 4000): Promise<string> {
  const res = await aiFetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user, maxTokens }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || "";
}

async function generateImage(prompt: string): Promise<string> {
  const res = await aiFetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.imageUrl;
}

// ── SMALL COMPONENTS ───────────────────────────────────────────────────────
function Spin({ size = 16, color = "rgba(255,255,255,0.7)" }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      border: "2px solid rgba(255,255,255,0.12)",
      borderTop: `2px solid ${color}`,
      borderRadius: "50%", animation: "spin 0.8s linear infinite",
    }} />
  );
}

function CopyBtn({ text, label = "복사" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setOk(true);
    setTimeout(() => setOk(false), 1600);
  };
  return (
    <button onClick={copy} style={{
      background: ok ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${ok ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.1)"}`,
      borderRadius: 7, padding: "5px 10px", fontSize: 10, fontWeight: 700,
      color: ok ? "#6EE7B7" : "rgba(255,255,255,0.5)", cursor: "pointer",
    }}>
      {ok ? "✓ 복사됨" : `📋 ${label}`}
    </button>
  );
}

function SelectInput({ label, value, setter, options }: {
  label: string; value: string; setter: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, color: "rgba(251,191,36,0.65)", letterSpacing: 1.5, marginBottom: 7 }}>{label}</label>
      <select value={value} onChange={e => setter(e.target.value)} style={{
        width: "100%", background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9,
        padding: "10px 13px", fontSize: 12, color: "#E8E8F2", fontFamily: "inherit", cursor: "pointer", appearance: "none",
      }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── BEAT CARD ──────────────────────────────────────────────────────────────
function BeatCard({ beat, cutNumber, cutTimeStart, topic, solution }: {
  beat: Beat; cutNumber: number; cutTimeStart: number; topic: string; solution: string;
}) {
  const [open,      setOpen]      = useState(false);
  const [vidPrompt, setVidPrompt] = useState<string | null>(null);
  const [loadVid,   setLoadVid]   = useState(false);
  const [imgUrl,    setImgUrl]    = useState<string | null>(null);
  const [loadImg,   setLoadImg]   = useState(false);
  const absStart = cutTimeStart + beat.timeStart;
  const absEnd   = cutTimeStart + beat.timeEnd;

  const genVid = async () => {
    setLoadVid(true);
    try {
      const text = await callClaude(
        `Convert storyboard beat into a ${solution} video generation prompt. Reply ONLY with the prompt, no explanation.`,
        `Beat: ${beat.content}\nCamera: ${beat.cameraAction}\nEmotion: ${beat.emotion}\nFirst Frame: ${beat.firstFrame}\nDuration: ${beat.timeEnd - beat.timeStart}s\nProject: ${topic}`,
        400,
      );
      setVidPrompt(text.trim());
    } catch { /* silent */ }
    setLoadVid(false);
  };

  const genImg = async () => {
    setLoadImg(true);
    try {
      const url = await generateImage(beat.firstFrame);
      setImgUrl(url);
    } catch { /* silent */ }
    setLoadImg(false);
  };

  return (
    <div
      style={{
        minWidth: 240, maxWidth: 265, flexShrink: 0,
        background: "rgba(167,139,250,0.05)",
        border: "1px solid rgba(167,139,250,0.18)",
        borderRadius: 14, overflow: "hidden", transition: "border-color 0.2s",
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(167,139,250,0.45)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(167,139,250,0.18)"}
    >
      {/* header */}
      <div style={{
        background: "rgba(167,139,250,0.1)", padding: "8px 13px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid rgba(167,139,250,0.12)",
      }}>
        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, color: "#A78BFA" }}>
          {beat.beatId}
        </span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(167,139,250,0.55)" }}>
            상대: {fmtSec(beat.timeStart)}–{fmtSec(beat.timeEnd)} ({fmtDur(beat.timeEnd - beat.timeStart)})
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(167,139,250,0.35)" }}>
            절대: {fmtSec(absStart)}–{fmtSec(absEnd)}
          </div>
        </div>
      </div>

      {/* thumbnail */}
      <div
        onClick={() => !imgUrl && !loadImg && setOpen(!open)}
        style={{
          aspectRatio: "16/9", background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: imgUrl || loadImg ? "default" : "pointer", userSelect: "none", overflow: "hidden",
        }}
      >
        {imgUrl ? (
          <img src={imgUrl} alt={beat.beatId} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : loadImg ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Spin size={20} color="#A78BFA" />
            <span style={{ fontSize: 9, color: "rgba(167,139,250,0.5)" }}>이미지 생성 중...</span>
          </div>
        ) : open ? (
          <p style={{ margin: "8px 12px", fontSize: 9, color: "rgba(255,255,255,0.45)", fontFamily: "monospace", lineHeight: 1.65 }}>
            {beat.firstFrame}
          </p>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22 }}>🎞️</div>
            <div style={{ fontSize: 9, color: "rgba(167,139,250,0.4)", marginTop: 3 }}>▼ 프롬프트</div>
          </div>
        )}
      </div>

      {/* content */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.65, wordBreak: "keep-all", marginBottom: 8 }}>
          {beat.content}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(
            [["🎥", beat.cameraAction, "rgba(255,255,255,0.55)"],
             ["💫", beat.emotion,      "rgba(167,139,250,0.75)"],
             ["🎵", beat.audioNote,    "rgba(255,255,255,0.45)"]] as [string, string, string][]
          ).map(([icon, text, color], i) => (
            <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
              {icon} <span style={{ color }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {vidPrompt && (
        <div style={{
          margin: "0 13px 8px", padding: "8px 10px",
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 8, fontSize: 10, color: "rgba(167,139,250,0.85)",
          fontFamily: "monospace", lineHeight: 1.65,
        }}>{vidPrompt}</div>
      )}

      {/* actions */}
      <div style={{ padding: "0 13px 13px", display: "flex", flexWrap: "wrap", gap: 5 }}>
        <button onClick={genImg} disabled={loadImg} style={{
          flex: "1 1 auto",
          background: "linear-gradient(135deg,rgba(167,139,250,0.3),rgba(139,92,246,0.25))",
          border: "1px solid rgba(167,139,250,0.3)", borderRadius: 7,
          padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#DDD6FE",
          cursor: loadImg ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
        }}>
          {loadImg ? <><Spin size={10} color="#DDD6FE" /> 생성 중</> : "🎨 이미지 생성"}
        </button>
        <button onClick={vidPrompt ? () => setVidPrompt(null) : genVid} disabled={loadVid} style={{
          flex: "1 1 auto",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 7, padding: "6px 8px", fontSize: 10, fontWeight: 600,
          color: "rgba(255,255,255,0.5)", cursor: loadVid ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
        }}>
          {loadVid ? <><Spin size={10} /> 변환 중</> : "🎥 영상 변환"}
        </button>
        <CopyBtn text={beat.firstFrame} label="프롬프트" />
      </div>
    </div>
  );
}

// ── CUT CARD ───────────────────────────────────────────────────────────────
function CutCard({ cut, meta, beatBoard, isGenBeats, onGenBeat, idx }: {
  cut: Cut; meta: StoryboardMeta; beatBoard: Beat[] | null;
  isGenBeats: boolean; onGenBeat: (cut: Cut) => void; idx: number;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [beatOpen,   setBeatOpen]   = useState(false);
  const [imgUrl,     setImgUrl]     = useState<string | null>(null);
  const [loadImg,    setLoadImg]    = useState(false);
  const em = EMOTION_MAP[cut.emotion || "Establishing"] || EMOTION_MAP.Establishing;

  useEffect(() => { if (beatBoard) setBeatOpen(true); }, [beatBoard]);

  const genImg = async () => {
    if (!cut.firstFrame) return;
    setLoadImg(true);
    try {
      const url = await generateImage(cut.firstFrame);
      setImgUrl(url);
    } catch { /* silent */ }
    setLoadImg(false);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.022)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderLeft: `3px solid ${em.color}`,
      borderRadius: 18, overflow: "hidden",
      animation: `fadeInUp 0.4s ease ${idx * 0.035}s both`,
    }}>
      {/* ── header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, padding: "13px 20px",
        background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.045)",
        flexWrap: "wrap", rowGap: 8,
      }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, lineHeight: 1, color: em.color, minWidth: 50 }}>
          {String(cut.cutNumber).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            {fmtSec(cut.timeStart)} – {fmtSec(cut.timeEnd)}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{
              padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
              color: em.color, background: em.bg, border: `1px solid ${em.color}44`,
            }}>{em.label}</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: "monospace" }}>{fmtDur(cut.duration)}</span>
            {beatBoard && (
              <span style={{
                padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                color: "#A78BFA", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)",
              }}>비트 {beatBoard.length}개</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", flex: "0 1 420px", lineHeight: 1.55, wordBreak: "keep-all" }}>
          {cut.content}
        </div>
      </div>

      {/* ── body ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 1fr 1fr", gap: 0 }}>

        {/* First Frame */}
        <div style={{ padding: 18, borderRight: "1px solid rgba(255,255,255,0.045)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: 2, marginBottom: 10 }}>FIRST FRAME</div>
          <div
            onClick={() => !imgUrl && !loadImg && setShowPrompt(!showPrompt)}
            style={{
              aspectRatio: "16/9", background: "rgba(0,0,0,0.35)",
              borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 10, cursor: imgUrl || loadImg ? "default" : "pointer",
              border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden",
            }}
          >
            {imgUrl ? (
              <img src={imgUrl} alt={`Cut ${cut.cutNumber}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : loadImg ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Spin size={22} color="#FBBf24" />
                <span style={{ fontSize: 9, color: "rgba(251,191,36,0.5)" }}>이미지 생성 중...</span>
              </div>
            ) : showPrompt ? (
              <p style={{ margin: "10px 12px", fontSize: 9, color: "rgba(255,255,255,0.45)", fontFamily: "monospace", lineHeight: 1.7 }}>
                {cut.firstFrame}
              </p>
            ) : (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 26, marginBottom: 4 }}>🎬</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)" }}>▼ 프롬프트 보기</div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button onClick={genImg} disabled={loadImg} style={{
              flex: "1 1 100%",
              background: loadImg
                ? "rgba(251,191,36,0.2)"
                : "linear-gradient(135deg,#FBBf24,#F59E0B)",
              border: "none", borderRadius: 8, padding: "9px 12px",
              fontSize: 11, fontWeight: 800, color: "#000",
              cursor: loadImg ? "wait" : "pointer", letterSpacing: 0.5,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {loadImg ? <><Spin size={12} color="rgba(0,0,0,0.4)" /> 생성 중...</> : "🎨 이미지 생성"}
            </button>
            <CopyBtn text={cut.firstFrame || ""} label="프롬프트 복사" />
          </div>
        </div>

        {/* Composition + Camera */}
        <div style={{ padding: 18, borderRight: "1px solid rgba(255,255,255,0.045)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: 2, marginBottom: 8 }}>COMPOSITION</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", lineHeight: 1.75, marginBottom: 16 }}>{cut.composition}</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: 2, marginBottom: 8 }}>CAMERA ACTION</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", lineHeight: 1.75 }}>{cut.cameraAction}</div>
        </div>

        {/* Beat Board trigger */}
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 9, color: "rgba(167,139,250,0.55)", letterSpacing: 2, marginBottom: 10 }}>BEAT BOARD</div>
          {beatBoard ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                {beatBoard.map(b => (
                  <div key={b.beatId} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "5px 10px", background: "rgba(167,139,250,0.07)", borderRadius: 7,
                  }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#A78BFA" }}>{b.beatId}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(167,139,250,0.5)" }}>
                      {fmtDur(b.timeEnd - b.timeStart)}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(167,139,250,0.35)" }}>
                      {fmtSec(cut.timeStart + b.timeStart)}–{fmtSec(cut.timeStart + b.timeEnd)}
                    </span>
                  </div>
                ))}
              </div>
              <button onClick={() => setBeatOpen(!beatOpen)} style={{
                width: "100%",
                background: beatOpen ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.08)",
                border: "1px solid rgba(167,139,250,0.28)", borderRadius: 9,
                padding: "9px", fontSize: 12, fontWeight: 700, color: "#A78BFA", cursor: "pointer",
              }}>
                {beatOpen ? "▲ 비트보드 접기" : "▼ 비트보드 펼치기"}
              </button>
            </>
          ) : (
            <button onClick={() => onGenBeat(cut)} disabled={isGenBeats} style={{
              width: "100%",
              background: isGenBeats ? "rgba(167,139,250,0.04)" : "rgba(167,139,250,0.1)",
              border: "1px solid rgba(167,139,250,0.22)", borderRadius: 11,
              padding: "16px 12px", cursor: isGenBeats ? "wait" : "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}>
              {isGenBeats ? (
                <><Spin size={16} color="#A78BFA" /><span style={{ fontSize: 11, color: "rgba(167,139,250,0.7)" }}>생성 중...</span></>
              ) : (
                <>
                  <span style={{ fontSize: 18 }}>🎞️</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#A78BFA" }}>비트보드 생성</span>
                  <span style={{ fontSize: 10, color: "rgba(167,139,250,0.5)" }}>
                    {fmtDur(cut.duration)} → {Math.max(3, Math.ceil(cut.duration / 2.5))}개 마이크로 비트
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── beat board expanded ── */}
      {beatOpen && beatBoard && (
        <div style={{
          borderTop: "1px solid rgba(167,139,250,0.13)",
          padding: "16px 20px 20px",
          background: "rgba(167,139,250,0.025)",
        }}>
          <div style={{ fontSize: 10, color: "rgba(167,139,250,0.5)", letterSpacing: 2, marginBottom: 14 }}>
            ◆ BEAT BOARD — CUT {String(cut.cutNumber).padStart(2, "0")} · {fmtSec(cut.timeStart)}–{fmtSec(cut.timeEnd)} · {beatBoard.length} BEATS
          </div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
            {beatBoard.map(beat => (
              <BeatCard
                key={beat.beatId}
                beat={beat}
                cutNumber={cut.cutNumber}
                cutTimeStart={cut.timeStart}
                topic={meta.topic}
                solution={meta.solution}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN ───────────────────────────────────────────────────────────────────
export default function StoryboardApp() {
  const { user, signIn, signOut } = useAuth();
  const searchParams = useSearchParams();

  const [topic,         setTopic]         = useState("");
  const [totalDuration, setTotalDuration] = useState(120);
  const [customDur,     setCustomDur]     = useState("");
  const [useCustom,     setUseCustom]     = useState(false);
  const [solution,      setSolution]      = useState("Kling 3.0");
  const [maxCut,        setMaxCut]        = useState(8);
  const [style,         setStyle]         = useState(STYLES[0]);
  const [mood,          setMood]          = useState(MOODS[0]);
  const [extraNote,     setExtraNote]     = useState("");
  const [storyboard,    setStoryboard]    = useState<Storyboard | null>(null);
  const [beatBoards,    setBeatBoards]    = useState<Record<number, Beat[]>>({});
  const [projectId,     setProjectId]     = useState<string>(() => `sb-${Date.now()}`);
  const [loading,       setLoading]       = useState(false);
  const [genBeats,      setGenBeats]      = useState<Record<number, boolean>>({});
  const [error,         setError]         = useState<string | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const solInfo = SOLUTIONS[solution];
  const effDur  = useCustom ? (parseInt(customDur) || 60) : totalDuration;
  const cuts    = calcCuts(effDur, maxCut);

  useEffect(() => { setMaxCut(SOLUTIONS[solution].recommended); }, [solution]);

  // Load from Firestore if ?load= param present
  useEffect(() => {
    const loadId = searchParams?.get("load");
    if (loadId && user) {
      getStoryboard(user.uid, loadId).then(sb => {
        if (sb) {
          try {
            const parsed = JSON.parse(sb.storyboardData);
            if (parsed.topic)      setTopic(parsed.topic);
            if (parsed.solution)   setSolution(parsed.solution);
            if (parsed.style)      setStyle(parsed.style);
            if (parsed.mood)       setMood(parsed.mood);
            if (parsed.effDur)     setTotalDuration(parsed.effDur);
            if (parsed.storyboard) setStoryboard(parsed.storyboard);
            if (parsed.beatBoards) setBeatBoards(parsed.beatBoards);
            setProjectId(loadId);
          } catch { /* ignore */ }
        }
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // ── Generate storyboard ──
  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true); setStoryboard(null); setBeatBoards({}); setError(null);

    const system = `You are a professional film director creating a cinematic storyboard for AI video generation.
CRITICAL: Respond ONLY with valid JSON. No markdown fences, no preamble.
Structure:
{
  "toneAndMood": "string",
  "copyLines": ["line1","line2","line3"],
  "cuts": [{
    "cutNumber": 1,
    "firstFrame": "English AI image generation prompt — minimum 65 words: include lighting type, lens characteristics, color grading, atmosphere, textures, composition elements, film aesthetic",
    "composition": "Shot type and angle in English",
    "cameraAction": "Camera movement in English",
    "content": "Korean: scene description and emotional intent",
    "emotion": "Establishing|Build|Climax|Release|Brand"
  }]
}`;

    const cutsDesc = cuts.map(c =>
      `CUT ${String(c.cutNumber).padStart(2, "0")}: ${fmtSec(c.timeStart)}–${fmtSec(c.timeEnd)} (${fmtDur(c.duration)})`
    ).join("\n");

    const userMsg = `Create storyboard for exactly ${cuts.length} cuts:\n\n${cutsDesc}\n\nTopic: ${topic}\nTotal: ${effDur}s | Solution: ${solution} (max ${maxCut}s/cut) | Style: ${style} | Mood: ${mood}\nNotes: ${extraNote || "없음"}\n\nEmotional arc: Establishing → Build → Climax → Release → Brand. Distribute emotions naturally across ${cuts.length} cuts.`;

    try {
      const text   = await callClaude(system, userMsg, 9000);
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const merged = cuts.map((c, i) => ({
        ...c, ...(parsed.cuts[i] || {}),
        cutNumber: c.cutNumber, timeStart: c.timeStart, timeEnd: c.timeEnd, duration: c.duration,
      }));
      const newSB: Storyboard = {
        toneAndMood: parsed.toneAndMood,
        copyLines: parsed.copyLines || [],
        cuts: merged,
        meta: { topic, solution, style, mood, effDur, maxCut },
      };
      setStoryboard(newSB);
      // Auto-save to cloud as in-progress
      cloudSave(newSB, beatBoards, "in-progress").catch(() => {});
    } catch {
      setError("스토리보드 생성 실패. 다시 시도해주세요.");
    }
    setLoading(false);
  };

  // ── Generate beat board ──
  const generateBeat = async (cut: Cut) => {
    setGenBeats(p => ({ ...p, [cut.cutNumber]: true }));
    const beatCount = Math.max(3, Math.ceil(cut.duration / 2.5));

    const system = `You are a film editor breaking a single shot into micro beats.
CRITICAL: Respond ONLY with a valid JSON array. No markdown, no preamble.
[{
  "beatId":"01A",
  "timeStart":0,"timeEnd":2.5,
  "firstFrame":"English AI image prompt for this exact moment (45+ words: lighting/lens/mood/composition/specific detail)",
  "cameraAction":"precise micro-movement for this 2-3s moment",
  "content":"Korean: what visually happens in this beat",
  "emotion":"emotional quality of this beat",
  "audioNote":"Korean: BGM / SFX suggestion for this beat"
}]`;

    const userMsg = `Break CUT ${String(cut.cutNumber).padStart(2, "0")} (${fmtDur(cut.duration)}) into ${beatCount} micro beats.
Scene: ${cut.content}
Composition: ${cut.composition} | Camera: ${cut.cameraAction} | Phase: ${cut.emotion}
First Frame context: ${cut.firstFrame}
Project: ${topic} | ${style} | ${mood}

Rules:
- timeStart/timeEnd are RELATIVE to this cut (start from 0, total = ${cut.duration})
- Each beat 2–3s, they must sum to exactly ${cut.duration}s
- beatId format: ${String(cut.cutNumber).padStart(2, "0")}A, ${String(cut.cutNumber).padStart(2, "0")}B …
- Show natural micro-progression of camera and emotion through the ${cut.duration}s`;

    try {
      const text  = await callClaude(system, userMsg, 3000);
      const beats = JSON.parse(text.replace(/```json|```/g, "").trim());
      const newBB = { ...beatBoards, [cut.cutNumber]: beats };
      setBeatBoards(newBB);
      // Update cloud save with latest beat boards
      if (storyboard) cloudSave(storyboard, newBB, "in-progress").catch(() => {});
    } catch {
      showToast("비트 생성 실패. 다시 시도해주세요.");
    }
    setGenBeats(p => ({ ...p, [cut.cutNumber]: false }));
  };

  // ── Save to Firestore ──
  const cloudSave = async (sb: Storyboard, bb: Record<number, Beat[]>, status: "in-progress" | "completed") => {
    if (!user) return;
    try {
      await upsertStoryboard(user.uid, {
        id: projectId,
        topic: sb.meta.topic,
        solution: sb.meta.solution,
        style: sb.meta.style,
        mood: sb.meta.mood,
        durationSec: sb.meta.effDur,
        status,
        cutsGenerated: sb.cuts.length,
        totalCuts: sb.cuts.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        storyboardData: JSON.stringify({ topic, solution, style, mood, effDur, storyboard: sb, beatBoards: bb }),
      });
    } catch (e) {
      console.warn("Firestore storyboard save failed", e);
    }
  };

  const handleSave = async () => {
    if (!storyboard) return;
    if (!user) { setShowAuthModal(true); return; }
    setSaving(true);
    try {
      await cloudSave(storyboard, beatBoards, "completed");
      showToast("스토리보드 저장됐어요! 🎬");
    } catch {
      showToast("저장 실패. 다시 시도해주세요.");
    }
    setSaving(false);
  };

  // ── RENDER ──
  return (
    <div style={{ minHeight: "100vh", background: "#090912", fontFamily: "'Noto Sans KR',sans-serif", color: "#E8E8F2" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        * { box-sizing: border-box }
        ::-webkit-scrollbar { width:4px; height:4px }
        ::-webkit-scrollbar-thumb { background:rgba(167,139,250,0.3); border-radius:2px }
        input::placeholder, textarea::placeholder { color:rgba(255,255,255,0.2) }
        input, textarea, select { outline:none; font-family:inherit }
        select option { background:#13131F; color:#E8E8F2 }
      `}</style>

      {/* Auth modal */}
      {showAuthModal && (
        <div
          onClick={() => setShowAuthModal(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:24, backdropFilter:"blur(4px)" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:"#13131F", border:"1px solid rgba(255,255,255,0.1)", borderRadius:24, padding:"40px 36px", textAlign:"center", maxWidth:380, width:"100%", boxShadow:"0 24px 80px rgba(0,0,0,0.5)", animation:"fadeInUp 0.25s ease both" }}
          >
            <div style={{ fontSize:44, marginBottom:14 }}>🔐</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#E8E8F2", marginBottom:10 }}>로그인이 필요해요</div>
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.45)", lineHeight:1.7, marginBottom:32 }}>
              Google 계정으로 로그인하면<br />
              스토리보드를 저장하고<br />
              언제든지 다시 불러올 수 있어요.
            </div>
            <button
              onClick={async () => { await signIn(); setShowAuthModal(false); }}
              style={{ width:"100%", padding:"14px", background:"linear-gradient(135deg,#6366F1,#8B5CF6)", border:"none", borderRadius:14, fontSize:15, fontWeight:700, color:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, boxShadow:"0 4px 16px rgba(99,102,241,0.35)", marginBottom:12 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google로 로그인
            </button>
            <button
              onClick={() => setShowAuthModal(false)}
              style={{ width:"100%", padding:"12px", background:"transparent", border:"1px solid rgba(255,255,255,0.12)", borderRadius:14, fontSize:14, fontWeight:600, color:"rgba(255,255,255,0.4)", cursor:"pointer" }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 70% 40% at 50% 0%,rgba(99,102,241,0.07) 0%,transparent 60%), radial-gradient(ellipse 50% 30% at 90% 90%,rgba(251,191,36,0.04) 0%,transparent 50%)",
      }} />

      {/* Top Nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        background: "rgba(13,13,26,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 28px", height: 42, display: "flex", alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none" }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7,
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: "white", fontWeight: 800,
            }}>✦</div>
            <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>AI Studio</span>
          </a>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
          {[
            { href: "/storyboard", icon: "🎬", label: "Storyboard" },
            { href: "/suno", icon: "🎵", label: "Suno Maker" },
            { href: "/metaprompt", icon: "✦", label: "MetaPrompt" },
            { href: "/detail", icon: "🛍️", label: "Detail Page" },
            { href: "/autocut", icon: "✂️", label: "AutoCut" },
          ].map(t => (
            <a key={t.href} href={t.href} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 7, textDecoration: "none",
              background: t.href === "/storyboard" ? "rgba(251,191,36,0.15)" : "transparent",
              border: t.href === "/storyboard" ? "1px solid rgba(251,191,36,0.3)" : "1px solid transparent",
              fontSize: 11, fontWeight: 600,
              color: t.href === "/storyboard" ? "#FBBf24" : "rgba(255,255,255,0.45)",
            }}>
              <span style={{ fontSize: 12 }}>{t.icon}</span>{t.label}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {user ? (
            <>
              <span style={{ fontSize: 10, color: "#10B981" }}>☁️ 클라우드 저장</span>
              {user.photoURL && <img src={user.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />}
            </>
          ) : (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}>
              Powered by <span style={{ color: "#60A5FA" }}>Gemini</span>
            </span>
          )}
        </div>
      </nav>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1440, margin: "0 auto", padding: "42px 28px 100px" }}>

        {/* HEADER */}
        <div style={{ padding: "28px 0 24px", display: "flex", alignItems: "center", gap: 18, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{
            width: 50, height: 50, borderRadius: 14,
            background: "linear-gradient(135deg,#FBBf24,#D97706)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, boxShadow: "0 0 28px rgba(251,191,36,0.22)",
          }}>🎬</div>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 4, color: "#FBBf24" }}>
              STORYBOARD GENERATOR
            </h1>
            <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)", letterSpacing: 2.5 }}>
              MULTI-LEVEL · STORYBOARD → BEAT BOARD → VIDEO PIPELINE
            </p>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {([
              ["L1", "프로덕션",   "rgba(251,191,36,0.2)",  "#FBBf24"],
              ["L2", "스토리보드", "rgba(99,102,241,0.2)",  "#818CF8"],
              ["L3", "비트보드",   "rgba(167,139,250,0.2)", "#A78BFA"],
            ] as [string, string, string, string][]).map(([lvl, name, bg, color]) => (
              <div key={lvl} style={{ padding: "6px 12px", background: bg, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: "monospace" }}>{lvl}</span>
                <span style={{ fontSize: 9, color: `${color}99` }}>{name}</span>
              </div>
            ))}
            <button
              onClick={user ? signOut : signIn}
              style={{
                marginLeft: 8, padding: "7px 14px",
                background: user ? "rgba(255,255,255,0.06)" : "rgba(99,102,241,0.18)",
                border: `1px solid ${user ? "rgba(255,255,255,0.1)" : "rgba(99,102,241,0.35)"}`,
                borderRadius: 9, fontSize: 11, fontWeight: 700,
                color: user ? "rgba(255,255,255,0.5)" : "#818CF8", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {user?.photoURL && <img src={user.photoURL} alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />}
              {user ? `${user.displayName?.split(" ")[0] || "User"} · 로그아웃` : "Google 로그인"}
            </button>
          </div>
        </div>

        {/* SETTINGS PANEL */}
        <div style={{
          marginTop: 26, background: "rgba(255,255,255,0.022)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 26,
          animation: "fadeInUp 0.4s ease",
        }}>
          {/* Topic */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 10, color: "rgba(251,191,36,0.65)", letterSpacing: 1.5, marginBottom: 7 }}>
              LEVEL 1 — 주제 / 브랜드 *
            </label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && topic.trim() && generate()}
              placeholder="예: 2분짜리 제주 감성 오션뷰 카페 브랜드 필름 / BTS2.0 스켈레톤 워치 런칭 영상..."
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
                padding: "13px 16px", fontSize: 14, color: "#E8E8F2", transition: "border-color 0.2s",
              }}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = "rgba(251,191,36,0.4)"}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.08)"}
            />
          </div>

          {/* Production row */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.4fr 1fr", gap: 16, marginBottom: 16 }}>

            {/* Duration */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "rgba(251,191,36,0.65)", letterSpacing: 1.5, marginBottom: 8 }}>총 영상 길이</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                {DURATION_PRESETS.map(p => {
                  const active = (!useCustom && totalDuration === p.val) || (useCustom && p.val === 0);
                  return (
                    <button key={p.label} onClick={() => {
                      if (p.val > 0) { setTotalDuration(p.val); setUseCustom(false); }
                      else setUseCustom(true);
                    }} style={{
                      padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      background: active ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${active ? "rgba(251,191,36,0.45)" : "rgba(255,255,255,0.07)"}`,
                      color: active ? "#FBBf24" : "rgba(255,255,255,0.45)",
                    }}>{p.label}</button>
                  );
                })}
              </div>
              {useCustom && (
                <input
                  type="number" placeholder="초 단위" value={customDur}
                  onChange={e => setCustomDur(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8,
                    padding: "9px 13px", fontSize: 14, color: "#FBBf24", fontFamily: "'Space Mono',monospace",
                  }}
                />
              )}
            </div>

            {/* Solution */}
            <div>
              <SelectInput label="AI 솔루션" value={solution} setter={setSolution} options={Object.keys(SOLUTIONS)} />
              <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
                최소 {solInfo.min}s · 최대 {solInfo.max}s
              </div>
            </div>

            {/* Max cut */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "rgba(251,191,36,0.65)", letterSpacing: 1.5, marginBottom: 8 }}>
                컷당 최대 길이 &nbsp;
                <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400, letterSpacing: 0 }}>({solInfo.min}s ~ {solInfo.max}s)</span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <input
                  type="range" min={solInfo.min} max={solInfo.max} step={1}
                  value={maxCut} onChange={e => setMaxCut(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#FBBf24" }}
                />
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 16, color: "#FBBf24", minWidth: 36, textAlign: "right" }}>
                  {maxCut}s
                </span>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                padding: "8px 12px", background: "rgba(251,191,36,0.06)",
                border: "1px solid rgba(251,191,36,0.15)", borderRadius: 8,
              }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: "#FBBf24", letterSpacing: 1 }}>
                  {cuts.length}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>컷</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>=</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{effDur}s ÷ {maxCut}s</span>
              </div>
            </div>

            {/* Style + Mood */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SelectInput label="스타일" value={style} setter={setStyle} options={STYLES} />
              <SelectInput label="톤앤무드" value={mood} setter={setMood} options={MOODS} />
            </div>
          </div>

          {/* Extra note */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 10, color: "rgba(251,191,36,0.65)", letterSpacing: 1.5, marginBottom: 7 }}>추가 참고사항</label>
            <textarea
              value={extraNote} onChange={e => setExtraNote(e.target.value)} rows={2}
              placeholder="핵심 소재, 브랜드컬러, 타겟층, 특수 요청사항..."
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
                padding: "11px 15px", fontSize: 13, color: "#E8E8F2", resize: "vertical", lineHeight: 1.65,
              }}
              onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = "rgba(251,191,36,0.35)"}
              onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = "rgba(255,255,255,0.07)"}
            />
          </div>

          <button
            onClick={generate}
            disabled={loading || !topic.trim()}
            style={{
              width: "100%", padding: "15px",
              background: loading || !topic.trim() ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg,#FBBf24,#F59E0B)",
              border: "none", borderRadius: 12,
              fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 3,
              color: loading || !topic.trim() ? "rgba(255,255,255,0.18)" : "#000",
              cursor: loading || !topic.trim() ? "not-allowed" : "pointer",
              boxShadow: loading || !topic.trim() ? "none" : "0 6px 30px rgba(251,191,36,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              transition: "all 0.3s",
            }}
          >
            {loading ? (
              <>
                <Spin size={18} color="rgba(255,255,255,0.6)" />
                <span style={{ fontFamily: "'Noto Sans KR'", fontSize: 14, color: "rgba(255,255,255,0.45)" }}>
                  AI가 {cuts.length}개 컷 스토리보드 구성 중...
                </span>
              </>
            ) : (
              `🎬 GENERATE — ${cuts.length} CUTS · ${effDur}S · ${solution}`
            )}
          </button>
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: "12px 18px",
            background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)",
            borderRadius: 10, color: "#FCA5A5", fontSize: 13,
          }}>{error}</div>
        )}

        {/* STORYBOARD RESULT */}
        {storyboard && (
          <div style={{ marginTop: 36, animation: "fadeInUp 0.5s ease" }}>

            {/* Tone / Copy + Save */}
            {(storyboard.toneAndMood || storyboard.copyLines?.length > 0) && (
              <div style={{
                background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.1)",
                borderRadius: 14, padding: "18px 22px", marginBottom: 22,
                display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center",
              }}>
                {storyboard.toneAndMood && (
                  <div style={{ flex: "1 1 200px" }}>
                    <div style={{ fontSize: 9, color: "rgba(251,191,36,0.5)", letterSpacing: 2, marginBottom: 6 }}>TONE & MOOD</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{storyboard.toneAndMood}</div>
                  </div>
                )}
                {storyboard.copyLines?.length > 0 && (
                  <div style={{ flex: "1 1 300px" }}>
                    <div style={{ fontSize: 9, color: "rgba(251,191,36,0.5)", letterSpacing: 2, marginBottom: 8 }}>COPY LINES</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {storyboard.copyLines.map((l, i) => (
                        <span key={i}
                          onClick={() => { navigator.clipboard.writeText(l); showToast("복사됐어요!"); }}
                          style={{
                            padding: "5px 13px", background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20,
                            fontSize: 12, color: "rgba(255,255,255,0.6)", cursor: "pointer",
                          }}>"{l}" 📋</span>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={handleSave} disabled={saving} style={{
                  padding: "9px 20px",
                  background: saving ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.14)",
                  border: "1px solid rgba(16,185,129,0.28)", borderRadius: 9,
                  fontSize: 12, fontWeight: 700, color: "#6EE7B7",
                  cursor: saving ? "wait" : "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  {saving ? <><Spin size={12} color="#6EE7B7" /> 저장 중</> : "💾 저장하기"}
                </button>
              </div>
            )}

            {/* Timeline bar */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: 2.5, marginBottom: 10 }}>
                PRODUCTION TIMELINE — {storyboard.cuts.length} CUTS · {effDur}s · {solution} · max {maxCut}s/컷
              </div>
              <div style={{
                display: "flex", gap: 2, height: 52, borderRadius: 10, overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.05)",
              }}>
                {storyboard.cuts.map(cut => {
                  const em = EMOTION_MAP[cut.emotion || "Establishing"] || EMOTION_MAP.Establishing;
                  const w  = (cut.duration / effDur) * 100;
                  return (
                    <div key={cut.cutNumber}
                      title={`CUT ${String(cut.cutNumber).padStart(2, "0")} · ${fmtSec(cut.timeStart)}–${fmtSec(cut.timeEnd)}`}
                      style={{
                        flex: `0 0 ${w}%`, background: em.bg,
                        borderRight: "1px solid rgba(0,0,0,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexDirection: "column", gap: 1, cursor: "pointer", transition: "filter 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.6)"}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)"}
                    >
                      <span style={{ fontSize: 9, fontWeight: 700, color: em.color, fontFamily: "monospace" }}>
                        {String(cut.cutNumber).padStart(2, "0")}
                      </span>
                      {w > 5 && <span style={{ fontSize: 8, color: `${em.color}77` }}>{fmtDur(cut.duration)}</span>}
                      {beatBoards[cut.cutNumber] && <span style={{ fontSize: 7, color: "rgba(167,139,250,0.6)" }}>●</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
                {Object.entries(EMOTION_MAP).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: v.color }} />
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{v.label}</span>
                  </div>
                ))}
                <span style={{ fontSize: 9, color: "rgba(167,139,250,0.5)", marginLeft: 8 }}>● 비트보드 생성됨</span>
              </div>
            </div>

            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, color: "#FBBf24" }}>
                  L2 STORYBOARD
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
                  각 컷 우측 [비트보드 생성] → L3 마이크로 비트 자동 분해
                </p>
              </div>
              {Object.keys(beatBoards).length === 0 && (
                <button
                  onClick={() => storyboard.cuts.forEach((c, i) => setTimeout(() => generateBeat(c), i * 1200))}
                  style={{
                    padding: "8px 16px", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)",
                    borderRadius: 9, fontSize: 11, fontWeight: 700, color: "#A78BFA", cursor: "pointer",
                  }}
                >모든 컷 비트보드 생성</button>
              )}
            </div>

            {/* Cut cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {storyboard.cuts.map((cut, idx) => (
                <CutCard
                  key={cut.cutNumber} cut={cut} meta={storyboard.meta}
                  beatBoard={beatBoards[cut.cutNumber] || null}
                  isGenBeats={!!genBeats[cut.cutNumber]}
                  onGenBeat={generateBeat}
                  idx={idx}
                />
              ))}
            </div>

            {/* Pipeline status */}
            <div style={{
              marginTop: 30, padding: "15px 22px",
              background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
            }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: 2 }}>PIPELINE</span>
              {[
                { label: "① L1 프로덕션 설정 ✓", done: true },
                { label: "② L2 스토리보드 ✓", done: true },
                { label: `③ L3 비트보드 (${Object.keys(beatBoards).length}/${storyboard.cuts.length}컷)`, done: Object.keys(beatBoards).length > 0 },
                { label: "④ 퍼스트프레임 이미지 생성", done: false },
                { label: `⑤ ${solution} 영상 생성`, done: false },
                { label: "⑥ 편집 / 이어붙이기", done: false },
              ].map((s, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: "4px 12px", borderRadius: 20,
                  background: s.done ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)",
                  color: s.done ? "#6EE7B7" : "rgba(255,255,255,0.32)",
                  border: s.done ? "1px solid rgba(16,185,129,0.28)" : "1px solid rgba(255,255,255,0.05)",
                }}>{s.label}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "#FBBf24", color: "#000", padding: "9px 22px",
          borderRadius: 30, fontSize: 13, fontWeight: 700,
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)", zIndex: 1000,
          animation: "fadeInUp 0.25s ease",
        }}>{toast}</div>
      )}
    </div>
  );
}
