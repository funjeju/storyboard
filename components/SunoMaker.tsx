"use client";

import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { upsertSunoTrack } from "@/lib/firestoreHelpers";
import Link from "next/link";

// ── STYLE CONSTANTS ─────────────────────────────────────────────────────────
const GENRES = [
  "K-Pop", "팝 / Pop", "힙합 / Hip-Hop", "R&B", "록 / Rock", "인디 / Indie",
  "EDM", "재즈 / Jazz", "클래식 / Classical", "발라드 / Ballad",
  "트로트", "시티팝 / City Pop", "Lo-Fi", "Metal", "Folk", "Country",
];
const MOODS = [
  "어둡고 강렬한", "밝고 경쾌한", "감성적인 / Emotional", "드라마틱한",
  "몽환적인", "그루비한", "웅장한 / Epic", "잔잔한 / Calm",
  "하이에너지", "로맨틱한", "우울한 / Melancholic", "신나는 / Upbeat",
];
const PURPOSES = [
  "일반 릴리즈", "영상 BGM", "광고 음악", "게임 OST",
  "플레이리스트", "워크아웃 믹스", "명상 / 수면", "졸업 / 기념",
];
const STRUCTURES = [
  "인트로", "벌스 1", "프리코러스", "후렴", "벌스 2",
  "브릿지", "마지막 후렴", "아웃트로",
];
const PLATFORMS = [
  { id: "spotify",    label: "Spotify",      lufs: -14, color: "#1DB954" },
  { id: "apple",      label: "Apple Music",  lufs: -16, color: "#FC3C44" },
  { id: "youtube",    label: "YouTube",      lufs: -14, color: "#FF0000" },
  { id: "soundcloud", label: "SoundCloud",   lufs: -8,  color: "#FF5500" },
];

// ── LYRICS CONSTANTS ────────────────────────────────────────────────────────
const CORE_EMOTIONS = [
  "설렘", "애틋함", "그리움", "슬픔", "분노", "기쁨",
  "외로움", "희망", "절망", "행복", "불안", "평온",
  "질투", "미련", "해방감", "혼란",
];
const SITUATIONS = [
  "첫만남", "썸", "짝사랑", "재회", "고백 직전",
  "여행", "멀어짐", "기다림", "이별 후", "운명적 만남",
];
const NARRATIVE_LABELS: Record<string, { v1: string; v2: string; bridge: string; outro: string }> = {
  "첫만남":      { v1: "처음 마주친 순간의 감각적 묘사",     v2: "마음이 기울어지는 과정",          bridge: "말하지 못한 감정의 폭발",           outro: "여운 남는 설렘" },
  "썸":          { v1: "아직 확실하지 않은 감정",             v2: "조금씩 가까워지는 거리",           bridge: "고백 직전의 긴장감",               outro: "어떻게 될지 모르는 설렘" },
  "짝사랑":      { v1: "혼자 바라보는 마음",                  v2: "멀리서 지켜보는 일상",             bridge: "감정이 터지는 순간",               outro: "혼자 삭히는 여운" },
  "재회":        { v1: "오랜만에 마주친 순간",                v2: "예전 감정이 다시 올라오는 과정",    bridge: "변한 것과 변하지 않은 것의 충돌",  outro: "다시 시작할 수 있을까의 열린 결말" },
  "고백 직전":   { v1: "감정을 말해야 한다는 확신",           v2: "망설임과 용기 사이",               bridge: "결심의 순간",                      outro: "고백하거나 못 하거나의 열린 결말" },
  "여행":        { v1: "낯선 곳에서의 자유로움",              v2: "그 순간 감정이 깊어짐",            bridge: "돌아가야 할 현실과의 대비",         outro: "여행이 남긴 흔적과 여운" },
  "멀어짐":      { v1: "조금씩 멀어지는 거리감",              v2: "그 사이에서 혼자 애쓰는 마음",     bridge: "더 이상 잡을 수 없다는 깨달음",    outro: "조용한 이별" },
  "기다림":      { v1: "기다리는 시간의 무게",                v2: "오지 않는 답에 지쳐가는 마음",     bridge: "기다림을 멈출 것인가의 선택",      outro: "기다림의 끝에 남는 것" },
  "이별 후":     { v1: "익숙하던 것들이 낯설어진 일상",       v2: "지워지지 않는 기억과 흔적",        bridge: "이제는 보내야 한다는 것",          outro: "홀로 서는 법을 배우는 과정" },
  "운명적 만남": { v1: "처음부터 다른 느낌",                  v2: "만날 수밖에 없었다는 확신",        bridge: "현실과 감정 사이의 갈등",          outro: "운명을 받아들이거나 거스르거나" },
};
const BACKGROUND_SCENES = [
  "비 오는 밤", "새벽 카페", "해변", "드라이브", "공항",
  "빈 거리", "지하철", "옥상", "캠프파이어", "창가",
  "편의점", "지는 노을", "첫눈", "병원 복도",
];
const HOOK_STYLES_LYRICS = [
  "감정 폭발형", "중독성 반복형", "속삭임 훅",
  "고음 터짐형", "떼창형 (anthem)", "랩 섞임",
];
const PROHIBITION_CHIPS = [
  "진부한 표현", "직접적 감정 서술", "종교적 언급",
  "폭력적 묘사", "선정적 내용", "영어 섞기",
  "일본어 섞기", "신체 직접 언급",
];

// ── ADVANCED (SONIC ONLY — lyrics items removed) ────────────────────────────
const VOCAL_DIRECTIONS = [
  "자동", "속삭임 중심", "감성/허스키", "청량한 팝톤", "파워 보컬",
  "오페라틱/고딕", "거친 샤우팅 혼합", "듀엣/하모니 강조",
];
const VENUE_MOODS = [
  "자동", "바다 파도", "바람 소리", "비 오는 거리", "화산/현무암 무드",
  "도심 야경", "카페 감성", "드라이브", "캠프파이어", "새벽 공항", "섬 여행 감성",
];
const ENERGY_CURVES = [
  "자동", "잔잔→폭발형", "처음부터 강렬함", "점층적 빌드업",
  "후렴 몰빵형", "브릿지 반전형", "마지막 대폭발형",
];
const BPM_FEELS = ["자동", "느리고 묵직함", "미드템포 그루브", "달리는 느낌", "댄서블"];
const VOCAL_PRODUCTION = [
  "자동", "생보컬 느낌", "리버브 많음", "오토튠 약간",
  "하모니 강조", "공간감 큼", "라디오/빈티지 질감",
];
const INSTRUMENT_GUITAR = ["자동", "클린", "디스토션", "헤비 리프", "앰비언트", "빈티지"];
const INSTRUMENT_DRUMS  = ["자동", "타이트", "묵직함", "트라이벌", "더블킥", "라이브 밴드 느낌"];
const INSTRUMENT_BASS   = ["자동", "서브 강함", "펑키", "왜곡", "자연스러움"];
const INSTRUMENT_SYNTH  = ["자동: 장르에 맞게", "없음", "약함", "중간", "강함"];

const PRESETS: { name: string; emoji: string; set: Record<string, string | string[]> }[] = [
  { name: "제주 새벽 드라이브", emoji: "🌅", set: { vocalDirection: "속삭임 중심", venueMood: "드라이브",      energyCurve: "점층적 빌드업",       bpmFeel: "미드템포 그루브", vocalProduction: "리버브 많음" } },
  { name: "여름밤 시티팝",     emoji: "🌃", set: { vocalDirection: "청량한 팝톤",   venueMood: "도심 야경",      energyCurve: "잔잔→폭발형",         bpmFeel: "댄서블",         vocalProduction: "공간감 큼"  } },
  { name: "겨울 아침 카페",   emoji: "☕", set: { vocalDirection: "감성/허스키",   venueMood: "카페 감성",      energyCurve: "처음부터 강렬함",     bpmFeel: "느리고 묵직함",  vocalProduction: "생보컬 느낌" } },
  { name: "광활한 영화 OST",  emoji: "🎬", set: { vocalDirection: "오페라틱/고딕", venueMood: "화산/현무암 무드", energyCurve: "마지막 대폭발형",    bpmFeel: "느리고 묵직함",  vocalProduction: "공간감 큼"  } },
  { name: "비 오는 밤 R&B",  emoji: "🌧️", set: { vocalDirection: "감성/허스키",   venueMood: "비 오는 거리",   energyCurve: "잔잔→폭발형",         bpmFeel: "미드템포 그루브", vocalProduction: "리버브 많음" } },
  { name: "섬 여행 인디팝",   emoji: "🏝️", set: { vocalDirection: "청량한 팝톤",   venueMood: "섬 여행 감성",   energyCurve: "처음부터 강렬함",     bpmFeel: "달리는 느낌",    vocalProduction: "생보컬 느낌" } },
];

// ── COLORS ──────────────────────────────────────────────────────────────────
const P = "#7C3AED";
const PINK = "#EC4899";

// ── AUDIO UTILS ─────────────────────────────────────────────────────────────
function calculateLUFS(buffer: AudioBuffer): number {
  let sum = 0, count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) { sum += data[i] ** 2; count++; }
  }
  const rms = Math.sqrt(sum / Math.max(count, 1));
  return Math.round((20 * Math.log10(rms || 0.0001)) * 10) / 10;
}
function getPeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) { if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]); }
  }
  return Math.round(20 * Math.log10(peak || 0.0001) * 10) / 10;
}
function detectBPM(buffer: AudioBuffer): number {
  const ch = buffer.getChannelData(0), sr = buffer.sampleRate;
  const winSamples = Math.floor(sr * 0.1);
  const maxWin = Math.min(Math.floor(ch.length / winSamples), 300);
  const energies: number[] = [];
  for (let i = 0; i < maxWin; i++) {
    let e = 0;
    for (let j = 0; j < winSamples; j++) e += ch[i * winSamples + j] ** 2;
    energies.push(e / winSamples);
  }
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const peaks: number[] = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > mean * 1.4 && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) peaks.push(i);
  }
  if (peaks.length < 2) return 120;
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return Math.max(60, Math.min(220, Math.round(60 / (avg * 0.1))));
}
async function applyMastering(audioBuffer: AudioBuffer, targetLUFS: number, gainSlider: number): Promise<AudioBuffer> {
  const currentLUFS = calculateLUFS(audioBuffer);
  const gainDb = targetLUFS - currentLUFS;
  const gainLinear = Math.pow(10, gainDb / 20) * (0.7 + gainSlider * 0.006);
  const peak = getPeak(audioBuffer);
  const maxGain = Math.pow(10, (-1 - peak) / 20);
  const safeGain = Math.min(gainLinear, maxGain);
  const offline = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  const gain = offline.createGain();
  gain.gain.value = safeGain;
  src.connect(gain); gain.connect(offline.destination); src.start(0);
  return offline.startRendering();
}
function encodeWAV(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels, numSamples = buffer.length, sampleRate = buffer.sampleRate;
  const bitsPerSample = 16, blockAlign = numCh * 2, dataSize = numSamples * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,"RIFF"); view.setUint32(4,36+dataSize,true); ws(8,"WAVE"); ws(12,"fmt ");
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,numCh,true);
  view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*blockAlign,true);
  view.setUint16(32,blockAlign,true); view.setUint16(34,16,true); ws(36,"data"); view.setUint32(40,dataSize,true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true); offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

// ── TYPES ────────────────────────────────────────────────────────────────────
interface LibraryTrack {
  id: string; title: string; stylePrompt: string; lyrics: string | null;
  genre: string; mood: string; vocal: string; topic: string;
  createdAt: number; audioDataKey: string | null;
}
interface LyricsResult {
  lyrics: string;
  narrativeUsed: { verse1: string; verse2: string; bridge: string; outro: string };
  symbolVariations: string[];
  hookLine: string;
  narrativeStructure: { v1: string; v2: string; bridge: string; outro: string };
}
interface LyricsContext {
  genre: string; mood: string; atmosphere: string;
  styleHint: string; emotionSummary?: string;
  suggestedMood?: string; suggestedGenre?: string;
}

// ── SMALL UI HELPERS ─────────────────────────────────────────────────────────
function Spin({ size = 16, color = P }: { size?: number; color?: string }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, border: `2px solid rgba(124,58,237,0.15)`, borderTop: `2px solid ${color}`, animation: "spin 0.8s linear infinite" }} />;
}

function SectionCard({ num, title, children, accent = P }: { num: string; title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: "white", borderRadius: 20, border: "1px solid #EDE9FE", overflow: "hidden", boxShadow: "0 2px 8px rgba(124,58,237,0.06)" }}>
      <div style={{ background: `linear-gradient(135deg, ${accent}, ${PINK})`, padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "white" }}>{num}</div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "white" }}>{title}</span>
      </div>
      <div style={{ padding: "24px" }}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B21A8", letterSpacing: 1.2 }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: "#9CA3AF" }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: "#FAFAFA",
  border: "1.5px solid #EDE9FE", borderRadius: 10,
  fontSize: 13, color: "#1A1A2E", fontFamily: "inherit", outline: "none",
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer", appearance: "none" };

function Chip({ label, selected, onClick, color = P }: { label: string; selected: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 100, border: `1.5px solid ${selected ? color : "#E5E7EB"}`,
      background: selected ? color : "white", color: selected ? "white" : "#4B5563",
      fontSize: 12, fontWeight: selected ? 700 : 500, cursor: "pointer",
      transition: "all 0.15s", flexShrink: 0,
    }}>{label}</button>
  );
}

function SliderField({ label, value, onChange, leftLabel, rightLabel }: {
  label: string; value: number; onChange: (v: number) => void;
  leftLabel?: string; rightLabel?: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#6B21A8" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: P }}>{value}%</span>
      </div>
      {(leftLabel || rightLabel) && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>{leftLabel}</span>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>{rightLabel}</span>
        </div>
      )}
      <input type="range" min={0} max={100} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: P, height: 4 }} />
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SunoMaker() {
  const { user, signIn } = useAuth();

  // ─ App Flow
  const [appMode, setAppMode]         = useState<"select" | "simple" | "path-a" | "path-b">("select");

  // ─ 간단 모드 (한 줄 → AI가 전부 결정)
  const [simpleIdea,    setSimpleIdea]    = useState("");
  const [simpleLoading, setSimpleLoading] = useState(false);
  const [simpleStyle,   setSimpleStyle]   = useState("");
  const [simpleLyrics,  setSimpleLyrics]  = useState("");
  const [simpleTitle,   setSimpleTitle]   = useState("");
  const [simpleMeta,    setSimpleMeta]    = useState<{ genre?: string; mood?: string; vocal?: string; language?: string } | null>(null);
  const [simpleSaved,   setSimpleSaved]   = useState(false);
  const [pathAStep, setPathAStep]     = useState<"choose" | "paste" | "create" | "style">("choose");
  const [pathBLyricsShown, setPathBLyricsShown] = useState(false);

  // ─ Project
  const [projectType, setProjectType] = useState<"single" | "album">("single");
  const [trackCount,  setTrackCount]  = useState(1);
  const [titleMode,   setTitleMode]   = useState<"custom" | "random">("custom");
  const [title,       setTitle]       = useState("");

  // ─ Style Form
  const [topic,       setTopic]       = useState("");
  const [structure,   setStructure]   = useState<string[]>(STRUCTURES);
  const [avoidEl,     setAvoidEl]     = useState("");
  const [addRequest,  setAddRequest]  = useState("");
  const [genre1,      setGenre1]      = useState("K-Pop");
  const [genre2,      setGenre2]      = useState("");
  const [purpose,     setPurpose]     = useState("일반 릴리즈");
  const [mood,        setMood]        = useState("감성적인 / Emotional");
  const [intensity,   setIntensity]   = useState("랜덤");
  const [bpmMode,     setBpmMode]     = useState<"random" | "custom">("random");
  const [bpm,         setBpm]         = useState("");
  const [duration,    setDuration]    = useState("3분");
  const [vocal,       setVocal]       = useState("있음");
  const [language,    setLanguage]    = useState("한국어");
  const [promptLang,  setPromptLang]  = useState("영어");

  // ─ Advanced Sonic Controls (lyrics items removed)
  const [advancedMode,    setAdvancedMode]    = useState(false);
  const [vocalDirection,  setVocalDirection]  = useState("자동");
  const [venueMood,       setVenueMood]       = useState("자동");
  const [energyCurve,     setEnergyCurve]     = useState("자동");
  const [bpmFeel,         setBpmFeel]         = useState("자동");
  const [vocalProduction, setVocalProduction] = useState("자동");
  const [instGuitar,      setInstGuitar]      = useState("자동");
  const [instDrums,       setInstDrums]       = useState("자동");
  const [instBass,        setInstBass]        = useState("자동");
  const [instSynth,       setInstSynth]       = useState("자동: 장르에 맞게");

  // ─ Lyrics Form (7 items)
  const [lyricsInputType,   setLyricsInputType]   = useState<"full" | "keywords">("full");
  const [lyricsRawText,     setLyricsRawText]     = useState("");
  const [analyzingLyrics,   setAnalyzingLyrics]   = useState(false);
  const [lyricsContext,     setLyricsContext]      = useState<LyricsContext | null>(null);
  const [lyricsEmotions,    setLyricsEmotions]    = useState<string[]>([]);
  const [emotionIntensity,  setEmotionIntensity]  = useState(60);
  const [lyricsSituation,   setLyricsSituation]   = useState("");
  const [situationDetail,   setSituationDetail]   = useState("");
  const [backgroundScenes,  setBackgroundScenes]  = useState<string[]>([]);
  const [symbolKeywords,    setSymbolKeywords]     = useState<string[]>([]);
  const [symbolInput,       setSymbolInput]        = useState("");
  const [lyricProhibitions, setLyricProhibitions] = useState<string[]>([]);
  const [prohibitionCustom, setProhibitionCustom] = useState("");
  const [lyricsHookStyles,  setLyricsHookStyles]  = useState<string[]>([]);
  const [expressionTone,    setExpressionTone]    = useState(50);
  const [lyricsLanguage,    setLyricsLanguage]    = useState<"한국어" | "영어">("한국어");
  const [lyricsInspiration, setLyricsInspiration] = useState("");

  // ─ Results
  const [results,          setResults]          = useState<{ stylePrompt: string; lyrics: string | null; suggestedTitle: string }[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [copiedTarget,     setCopiedTarget]     = useState<string | null>(null);
  const [lyricsOpen,       setLyricsOpen]       = useState<boolean[]>([]);
  const [generatingLyrics, setGeneratingLyrics] = useState(false);
  const [lyricsResult,     setLyricsResult]     = useState<LyricsResult | null>(null);

  // ─ Audio
  const [audioFile,   setAudioFile]   = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [analysis,    setAnalysis]    = useState<{ bpm: number; lufs: number; peak: number; duration: number } | null>(null);
  const [analyzing,   setAnalyzing]   = useState(false);
  const [mastering,   setMastering]   = useState(false);
  const [masterDone,  setMasterDone]  = useState(false);
  const [dragOver,    setDragOver]    = useState(false);
  const [platform,    setPlatform]    = useState("spotify");
  const [clarity,     setClarity]     = useState(70);

  // ─ Publishing
  const [artistName,  setArtistName]  = useState("");
  const [albumName,   setAlbumName]   = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [copyright,   setCopyright]   = useState("");
  const [coverArt,    setCoverArt]    = useState<string | null>(null);
  const [genCover,    setGenCover]    = useState(false);

  // ─ Save state
  const [savedIndices,   setSavedIndices]   = useState<Set<number>>(new Set());
  const [lyricsSaved,    setLyricsSaved]    = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const masterBlobRef = useRef<Blob | null>(null);
  const mp3BlobRef    = useRef<Blob | null>(null);
  const lyricsTopRef  = useRef<HTMLDivElement>(null);

  // ── FUNCTIONS ──────────────────────────────────────────────────────────────

  // Save result to library (requires login)
  const saveResultToLibrary = (i: number) => {
    if (!user) { setShowLoginModal(true); return; }
    const r = results[i];
    const now = Date.now();
    const entry: LibraryTrack = {
      id: `track-${now}-${i}`,
      title: r.suggestedTitle || (titleMode === "custom" ? title : "") || `${genre1} 트랙`,
      stylePrompt: r.stylePrompt,
      lyrics: lyricsResult?.lyrics || r.lyrics || null,
      genre: [genre1, genre2].filter(Boolean).join(" + "),
      mood, vocal: `${vocal} (${language})`, topic,
      createdAt: now, audioDataKey: null,
    };
    try {
      const existing: LibraryTrack[] = JSON.parse(localStorage.getItem("suno_library_v1") || "[]");
      // Remove duplicate id if exists
      localStorage.setItem("suno_library_v1", JSON.stringify([entry, ...existing.filter(e => e.id !== entry.id)].slice(0, 200)));
    } catch { /* silent */ }
    upsertSunoTrack(user.uid, {
      id: entry.id, title: entry.title, stylePrompt: entry.stylePrompt, lyrics: entry.lyrics,
      genre: entry.genre, mood: entry.mood, vocal: entry.vocal, topic: entry.topic,
      createdAt: entry.createdAt, updatedAt: now,
      status: "completed", audioStoragePath: null, audioUrl: null,
    }).catch(e => console.warn("Cloud save failed", e));
    setSavedIndices(prev => new Set([...prev, i]));
  };

  // Save lyrics to library (requires login)
  const saveLyricsToLibrary = () => {
    if (!user) { setShowLoginModal(true); return; }
    if (!lyricsResult) return;
    const now = Date.now();
    const entry: LibraryTrack = {
      id: `lyrics-${now}`,
      title: title || (lyricsEmotions.length ? lyricsEmotions.join(" · ") + " 가사" : "생성된 가사"),
      stylePrompt: results[0]?.stylePrompt || "",
      lyrics: lyricsResult.lyrics,
      genre: [genre1, genre2].filter(Boolean).join(" + "),
      mood, vocal: `${vocal} (${lyricsLanguage})`,
      topic: situationDetail || lyricsSituation || "",
      createdAt: now, audioDataKey: null,
    };
    try {
      const existing: LibraryTrack[] = JSON.parse(localStorage.getItem("suno_library_v1") || "[]");
      localStorage.setItem("suno_library_v1", JSON.stringify([entry, ...existing].slice(0, 200)));
    } catch { /* silent */ }
    upsertSunoTrack(user.uid, {
      id: entry.id, title: entry.title, stylePrompt: entry.stylePrompt, lyrics: entry.lyrics,
      genre: entry.genre, mood: entry.mood, vocal: entry.vocal, topic: entry.topic,
      createdAt: entry.createdAt, updatedAt: now,
      status: "completed", audioStoragePath: null, audioUrl: null,
    }).catch(e => console.warn("Cloud save failed", e));
    setLyricsSaved(true);
  };

  // Generate style prompt
  const generate = async () => {
    setLoading(true);
    setResults([]);
    setSavedIndices(new Set());
    setMasterDone(false);
    const count = projectType === "album" ? trackCount : 1;
    const out: typeof results = [];

    const isAutoOrEmpty = (v?: string) => !v || v === "자동" || v.startsWith("자동");
    const advPayload = advancedMode ? {
      vocalDirection, venueMood, energyCurve, bpmFeel,
      vocalProduction, avoidElementsAdvanced: [],
      instruments: { guitar: instGuitar, drums: instDrums, bass: instBass, synth: instSynth },
    } : null;

    for (let i = 0; i < count; i++) {
      try {
        const res = await fetch("/api/suno-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectType, trackCount, trackIndex: i + 1,
            title: titleMode === "random" ? "" : title,
            topic, songStructure: structure.join("-"),
            avoidElements: avoidEl, additionalRequests: addRequest,
            genre1, genre2, purpose, mood, intensity,
            bpmMode, bpm, duration, vocal, language, promptLanguage: promptLang,
            advanced: advPayload,
            lyricsContext: lyricsContext || null,
          }),
        });
        const data = await res.json();
        out.push({
          stylePrompt: data.stylePrompt || "생성 실패",
          lyrics: data.lyrics || null,
          suggestedTitle: data.suggestedTitle || "",
        });
      } catch {
        out.push({ stylePrompt: "생성 실패 — 다시 시도해주세요.", lyrics: null, suggestedTitle: "" });
      }
    }

    setResults(out);
    setLyricsOpen(out.map(() => false));
    setLoading(false);
  };

  // ── 간단 모드: 한 줄 → 스타일 + 가사 바로 생성 ──────────────────────────────
  const runSimple = async () => {
    if (!simpleIdea.trim() || simpleLoading) return;
    setSimpleLoading(true);
    setSimpleStyle(""); setSimpleLyrics(""); setSimpleTitle(""); setSimpleMeta(null); setSimpleSaved(false);
    try {
      const res = await fetch("/api/suno-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "simple", idea: simpleIdea.trim() }),
      });
      const data = await res.json();
      setSimpleStyle(data.stylePrompt || "생성 실패 — 다시 시도해주세요.");
      setSimpleLyrics(data.lyrics || "");
      setSimpleTitle(data.suggestedTitle || "");
      setSimpleMeta(data.meta || null);
    } catch {
      setSimpleStyle("생성 실패 — 다시 시도해주세요.");
    }
    setSimpleLoading(false);
  };

  const saveSimple = () => {
    if (!user) { setShowLoginModal(true); return; }
    if (!simpleStyle) return;
    const now = Date.now();
    const id = `track-${now}-simple`;
    const entry: LibraryTrack = {
      id, title: simpleTitle || "간단 생성 트랙", stylePrompt: simpleStyle,
      lyrics: simpleLyrics || null,
      genre: simpleMeta?.genre || "", mood: simpleMeta?.mood || "",
      vocal: `${simpleMeta?.vocal || "있음"} (${simpleMeta?.language || "한국어"})`,
      topic: simpleIdea, createdAt: now, audioDataKey: null,
    };
    try {
      const existing: LibraryTrack[] = JSON.parse(localStorage.getItem("suno_library_v1") || "[]");
      localStorage.setItem("suno_library_v1", JSON.stringify([entry, ...existing].slice(0, 200)));
    } catch { /* silent */ }
    upsertSunoTrack(user.uid, {
      id: entry.id, title: entry.title, stylePrompt: entry.stylePrompt, lyrics: entry.lyrics,
      genre: entry.genre, mood: entry.mood, vocal: entry.vocal, topic: entry.topic,
      createdAt: now, updatedAt: now, status: "completed", audioStoragePath: null, audioUrl: null,
    }).catch(() => {});
    setSimpleSaved(true);
  };

  // Analyze pasted lyrics/keywords
  const analyzeLyrics = async () => {
    if (!lyricsRawText.trim()) return;
    setAnalyzingLyrics(true);
    try {
      const res = await fetch("/api/lyrics-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lyricsRawText, type: lyricsInputType }),
      });
      const data: LyricsContext & { suggestedMood?: string; suggestedGenre?: string } = await res.json();
      setLyricsContext(data);
      if (data.suggestedMood) setMood(data.suggestedMood);
      if (data.suggestedGenre) setGenre1(data.suggestedGenre);
      setPathAStep("style");
    } catch { /* silent */ }
    setAnalyzingLyrics(false);
  };

  // Generate lyrics
  const generateLyrics = async () => {
    setGeneratingLyrics(true);
    setLyricsResult(null);
    try {
      const res = await fetch("/api/lyrics-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emotions: lyricsEmotions,
          emotionIntensity,
          situation: lyricsSituation,
          situationDetail,
          scenes: backgroundScenes,
          symbolKeywords,
          prohibitions: lyricProhibitions,
          prohibitionCustom,
          hookStyles: lyricsHookStyles,
          expressionTone,
          language: lyricsLanguage,
          lyricsInspiration,
          styleContext: lyricsContext,
        }),
      });
      const data: LyricsResult = await res.json();
      setLyricsResult(data);
      // After lyrics created in Path A → move to style step
      if (appMode === "path-a") {
        // Extract simple context from the generated lyrics form params
        setLyricsContext(prev => prev || {
          genre: genre1, mood: mood,
          atmosphere: backgroundScenes.join(", "),
          styleHint: `감정: ${lyricsEmotions.join(", ")}. 상황: ${lyricsSituation}`,
        });
        setPathAStep("style");
      }
    } catch { /* silent */ }
    setGeneratingLyrics(false);
  };

  // Copy helper
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTarget(key);
    setTimeout(() => setCopiedTarget(null), 1800);
  };

  // Audio analysis
  const analyzeFile = useCallback(async (file: File) => {
    setAudioFile(file); setAnalyzing(true); setAnalysis(null); setMasterDone(false);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
      setAnalysis({ bpm: detectBPM(decoded), lufs: calculateLUFS(decoded), peak: getPeak(decoded), duration: Math.round(decoded.duration) });
    } catch { /* silent */ }
    setAnalyzing(false);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("audio/") || file.name.match(/\.(mp3|wav|flac|aac|ogg)$/i))) analyzeFile(file);
  };

  const handleMaster = async () => {
    if (!audioBuffer) return;
    setMastering(true);
    try {
      const plt = PLATFORMS.find(p => p.id === platform)!;
      const masteredBuffer = await applyMastering(audioBuffer, plt.lufs, clarity);
      masterBlobRef.current = encodeWAV(masteredBuffer);
      // MP3 인코딩 (lamejs — dynamic import for client-only)
      try {
        const lamejs = (await import("lamejs")).default;
        const numCh = masteredBuffer.numberOfChannels;
        const sr = masteredBuffer.sampleRate;
        const encoder = new lamejs.Mp3Encoder(numCh > 1 ? 2 : 1, sr, 192);
        const left = masteredBuffer.getChannelData(0);
        const right = numCh > 1 ? masteredBuffer.getChannelData(1) : left;
        const toInt16 = (f: Float32Array) => {
          const out = new Int16Array(f.length);
          for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, f[i] * 32767));
          return out;
        };
        const l16 = toInt16(left), r16 = toInt16(right);
        const chunks: Uint8Array[] = [];
        const blockSize = 1152;
        for (let i = 0; i < l16.length; i += blockSize) {
          const enc = numCh > 1
            ? encoder.encodeBuffer(l16.subarray(i, i + blockSize), r16.subarray(i, i + blockSize))
            : encoder.encodeBuffer(l16.subarray(i, i + blockSize));
          if (enc.length > 0) chunks.push(new Uint8Array(enc.buffer));
        }
        const flushed = encoder.flush();
        if (flushed.length > 0) chunks.push(new Uint8Array(flushed.buffer));
        mp3BlobRef.current = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
      } catch { mp3BlobRef.current = null; }
      setAnalysis(prev => prev ? {
        ...prev,
        lufs: calculateLUFS(masteredBuffer),
        peak: getPeak(masteredBuffer),
      } : prev);
      setMasterDone(true);
    } catch { /* silent */ }
    setMastering(false);
  };

  const downloadMastered = (format: "wav" | "mp3" = "wav") => {
    const blob = format === "mp3" ? mp3BlobRef.current : masterBlobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${title || "mastered"}_mastered.${format}`; a.click();
    URL.revokeObjectURL(url);
  };

  const generateCover = async () => {
    setGenCover(true);
    try {
      const res = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Album cover art for a ${genre1} ${mood} music track titled "${title || "Untitled"}". ${topic}. Professional music album cover, high quality digital art, 1:1 square format.` }),
      });
      const data = await res.json();
      if (data.imageUrl) setCoverArt(data.imageUrl);
    } catch { /* silent */ }
    setGenCover(false);
  };

  // ── APPLY PRESET ────────────────────────────────────────────────────────────
  const applyPreset = (set: Record<string, string | string[]>) => {
    if (set.vocalDirection) setVocalDirection(set.vocalDirection as string);
    if (set.venueMood)      setVenueMood(set.venueMood as string);
    if (set.energyCurve)    setEnergyCurve(set.energyCurve as string);
    if (set.bpmFeel)        setBpmFeel(set.bpmFeel as string);
    if (set.vocalProduction) setVocalProduction(set.vocalProduction as string);
  };

  const narrative = lyricsSituation ? NARRATIVE_LABELS[lyricsSituation] : null;

  // ── SHARED STYLES ───────────────────────────────────────────────────────────
  const globalStyle = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap');
    * { box-sizing: border-box; }
    @keyframes spin { to { transform: rotate(360deg) } }
    @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    input[type=range]::-webkit-slider-thumb { width:16px;height:16px;border-radius:50%;background:${P};cursor:pointer;-webkit-appearance:none;box-shadow:0 2px 6px rgba(124,58,237,0.4); }
    input[type=range]::-webkit-slider-runnable-track { height:4px;border-radius:2px;background:#EDE9FE; }
    select option { background:white;color:#1A1A2E; }
    input:focus,textarea:focus,select:focus { border-color:${P}!important;box-shadow:0 0 0 3px rgba(124,58,237,0.1); }
    .chip-row { display:flex;flex-wrap:wrap;gap:8px; }
    .suno-mode-grid { display:grid;grid-template-columns:1fr 1fr;gap:24px; }
    .suno-2col { display:grid;grid-template-columns:1fr 1fr;gap:16px; }
    .suno-4col { display:grid;grid-template-columns:repeat(4,1fr);gap:12px; }
    .suno-page-pad { padding:40px 40px 80px; }
    .suno-select-pad { padding:72px 40px; }
    .suno-step-bar { padding:12px 40px; }
    .suno-nav { padding:0 32px; }
    .suno-mode-btn { padding:40px 32px; }
    @media (max-width:640px) {
      .suno-mode-grid { grid-template-columns:1fr!important;gap:16px!important; }
      .suno-2col { grid-template-columns:1fr!important;gap:12px!important; }
      .suno-4col { grid-template-columns:1fr 1fr!important;gap:10px!important; }
      .suno-page-pad { padding:24px 16px 60px!important; }
      .suno-select-pad { padding:36px 16px!important; }
      .suno-step-bar { padding:10px 16px!important; }
      .suno-nav { padding:0 12px!important; }
      .suno-nav-links { gap:6px!important; }
      .suno-mode-btn { padding:24px 20px!important; }
      .suno-nav-label { display:none!important; }
    }
  `;

  // ── TOP NAV ─────────────────────────────────────────────────────────────────
  const renderNav = () => (
    <nav className="suno-nav" style={{ background:"white", borderBottom:"1px solid #EDE9FE", padding:"0 32px", minHeight:42, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:101, boxShadow:"0 1px 3px rgba(124,58,237,0.06)", flexWrap:"wrap", gap:4, paddingTop:6, paddingBottom:6 }}>
      <div className="suno-nav-links" style={{ display:"flex", alignItems:"center", gap:14, overflowX:"auto", flexShrink:1, minWidth:0 }}>
        <Link href="/" style={{ display:"flex", alignItems:"center", gap:7, textDecoration:"none", flexShrink:0 }}>
          <div style={{ width:24, height:24, borderRadius:7, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"white", fontWeight:800 }}>✦</div>
          <span style={{ fontSize:12, fontWeight:800, color:"#111827" }}>AI Studio</span>
        </Link>
        <div style={{ width:1, height:14, background:"#E5E7EB", flexShrink:0 }} />
        {[{ href:"/storyboard",icon:"🎬",label:"Storyboard" },{ href:"/suno",icon:"🎵",label:"Suno Maker" },{ href:"/metaprompt",icon:"✦",label:"MetaPrompt" },{ href:"/detail",icon:"🛍️",label:"Detail Page" },{ href:"/autocut",icon:"✂️",label:"AutoCut" }].map(t => (
          <Link key={t.href} href={t.href} style={{ display:"flex", alignItems:"center", gap:4, textDecoration:"none", padding:"4px 8px", borderRadius:6, background:t.href==="/suno"?"rgba(124,58,237,0.08)":"transparent", flexShrink:0 }}>
            <span style={{ fontSize:12 }}>{t.icon}</span>
            <span className="suno-nav-label" style={{ fontSize:12, fontWeight:600, color:t.href==="/suno"?P:"#6B7280" }}>{t.label}</span>
          </Link>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {user ? (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"#10B981" }} />
            <span style={{ fontSize:11, color:"#6B7280", fontWeight:500 }}>☁️ 동기화 중</span>
          </div>
        ) : (
          <button onClick={signIn} style={{ padding:"6px 14px", background:"white", border:`1.5px solid ${P}`, borderRadius:8, fontSize:11, fontWeight:600, color:P, cursor:"pointer" }}>
            로그인하면 클라우드 저장
          </button>
        )}
      </div>
    </nav>
  );

  // ── SHARED BOTTOM: Audio Analysis + Publishing ───────────────────────────────
  // ── LOGIN MODAL ──────────────────────────────────────────────────────────────
  const renderLoginModal = () => {
    if (!showLoginModal) return null;
    return (
      <div
        onClick={() => setShowLoginModal(false)}
        style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{ background:"white", borderRadius:24, padding:"40px 36px", maxWidth:400, width:"90%", textAlign:"center", boxShadow:"0 24px 64px rgba(0,0,0,0.2)", animation:"fadeUp 0.3s ease both" }}>
          <div style={{ width:60, height:60, borderRadius:18, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, margin:"0 auto 20px" }}>
            📚
          </div>
          <h2 style={{ fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:10 }}>
            저장하려면 로그인이 필요해요
          </h2>
          <p style={{ fontSize:14, color:"#6B7280", lineHeight:1.7, marginBottom:28 }}>
            생성한 스타일 프롬프트와 가사를<br />
            마이 라이브러리에 저장하고 언제든 불러올 수 있어요.
          </p>
          <button
            onClick={() => { setShowLoginModal(false); signIn(); }}
            style={{ width:"100%", padding:"14px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:14, fontSize:14, fontWeight:700, color:"#374151", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Google로 로그인
          </button>
          <button
            onClick={() => setShowLoginModal(false)}
            style={{ width:"100%", padding:"10px", background:"transparent", border:"none", fontSize:13, color:"#9CA3AF", cursor:"pointer" }}>
            취소 (생성 결과는 유지됩니다)
          </button>
        </div>
      </div>
    );
  };

  const renderSharedBottom = () => (
    <div style={{ marginTop:40, display:"flex", flexDirection:"column", gap:24 }}>
      <SectionCard num="🎚" title="오디오 분석 · 마스터링">
        <div
          onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{ border:"2px dashed #DDD6FE", borderRadius:14, padding:"40px 24px", textAlign:"center", cursor:"pointer", background:dragOver?"rgba(124,58,237,0.04)":"#FAFAFA", marginBottom:audioFile?20:0 }}>
          <input ref={fileInputRef} type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/flac,audio/aac,audio/ogg,audio/x-m4a,.mp3,.mp4,.wav,.flac,.aac,.m4a,.ogg" style={{ display:"none" }} onChange={e => { if (e.target.files?.[0]) analyzeFile(e.target.files[0]); }} />
          <div style={{ fontSize:32, marginBottom:8 }}>🎵</div>
          <div style={{ fontSize:14, fontWeight:600, color:"#374151", marginBottom:4 }}>오디오 파일을 드래그하거나 클릭</div>
          <div style={{ fontSize:12, color:"#9CA3AF" }}>MP3, WAV, FLAC, AAC 지원</div>
        </div>
        {analyzing && <div style={{ display:"flex", alignItems:"center", gap:10, color:P, padding:"12px 0" }}><Spin /> 분석 중...</div>}
        {analysis && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div className="suno-4col" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              {[
                ["BPM", analysis.bpm, ""],
                ["LUFS", analysis.lufs, "dB"],
                ["Peak", analysis.peak, "dBTP"],
                ["길이", `${Math.floor(analysis.duration/60)}:${String(analysis.duration%60).padStart(2,"0")}`, ""],
              ].map(([label, val]) => (
                <div key={label as string} style={{ background:"rgba(124,58,237,0.04)", border:"1px solid #EDE9FE", borderRadius:12, padding:"14px", textAlign:"center" }}>
                  <div style={{ fontSize:11, color:"#9CA3AF", fontWeight:600, marginBottom:4 }}>{label as string}</div>
                  <div style={{ fontSize:20, fontWeight:800, color:P }}>{String(val)}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"#6B21A8", letterSpacing:1.2, marginBottom:10 }}>마스터링 플랫폼</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {PLATFORMS.map(plt => {
                  const sel = platform === plt.id;
                  return (
                    <button key={plt.id} onClick={() => setPlatform(plt.id)} style={{
                      padding:"8px 16px", borderRadius:10,
                      border: sel ? ("2px solid " + plt.color) : "2px solid #E5E7EB",
                      background: sel ? (plt.color + "22") : "white",
                      color: sel ? plt.color : "#374151",
                      fontSize:12, fontWeight:600, cursor:"pointer",
                    }}>
                      {plt.label} <span style={{ fontSize:10, color:"#9CA3AF" }}>({plt.lufs} LUFS)</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <button onClick={handleMaster} disabled={mastering} style={{ flex:1, padding:"12px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:12, color:"white", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {mastering ? <><Spin size={14} color="white" /> 마스터링 중...</> : "🎚 마스터링 적용"}
              </button>
              {masterDone && (
                <>
                  <button onClick={() => downloadMastered("wav")} style={{ flex:1, padding:"12px", background:"#10B981", border:"none", borderRadius:12, color:"white", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                    ⬇️ WAV
                  </button>
                  {mp3BlobRef.current && (
                    <button onClick={() => downloadMastered("mp3")} style={{ flex:1, padding:"12px", background:"#3B82F6", border:"none", borderRadius:12, color:"white", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                      ⬇️ MP3
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard num="📦" title="퍼블리싱 패키지">
        <div className="suno-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          {([["아티스트 이름", artistName, setArtistName],["앨범 이름", albumName, setAlbumName],["발매일", releaseDate, setReleaseDate],["저작권 표기", copyright, setCopyright]] as [string, string, (v:string)=>void][]).map(([label, val, setter]) => (
            <div key={label}>
              <div style={{ fontSize:11, fontWeight:700, color:"#6B21A8", letterSpacing:1.2, marginBottom:7 }}>{label}</div>
              <input value={val} onChange={e => setter(e.target.value)} placeholder={label} style={inputStyle} />
            </div>
          ))}
        </div>
        <div style={{ marginTop:20 }}>
          <button onClick={generateCover} disabled={genCover} style={{ padding:"10px 20px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, color:"white", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
            {genCover ? <><Spin size={12} color="white" /> 생성 중...</> : "🎨 커버 아트 생성"}
          </button>
          {coverArt && <img src={coverArt} alt="cover" style={{ marginTop:16, width:200, height:200, objectFit:"cover", borderRadius:12, display:"block" }} />}
        </div>
      </SectionCard>
    </div>
  );

  // ── MODE SELECTOR SCREEN ─────────────────────────────────────────────────────
  if (appMode === "select") {
    return (
      <div style={{ minHeight:"100vh", background:"#F8F5FF", fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
        <style>{globalStyle}</style>
        {renderLoginModal()}
        {renderNav()}
        <div className="suno-select-pad" style={{ maxWidth:860, margin:"0 auto", padding:"72px 40px" }}>
          {/* Header */}
          <div style={{ textAlign:"center", marginBottom:56, animation:"fadeUp 0.4s ease both" }}>
            <div style={{ fontSize:44, marginBottom:16 }}>🎵</div>
            <h1 style={{ fontSize:34, fontWeight:800, color:"#0F172A", letterSpacing:-1, marginBottom:12 }}>
              어디서부터 시작할까요?
            </h1>
            <p style={{ fontSize:15, color:"#6B7280", lineHeight:1.7 }}>
              가사를 먼저 쓰거나, 사운드 스타일을 먼저 잡거나 —<br />
              원하는 방식으로 음악을 만들어보세요.
            </p>
          </div>

          {/* 간단 모드 배너 */}
          <button
            onClick={() => setAppMode("simple")}
            className="suno-mode-btn"
            style={{ width:"100%", marginBottom:22, background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:20, padding:"22px 26px", cursor:"pointer", textAlign:"left", color:"white", display:"flex", alignItems:"center", gap:18, boxShadow:"0 10px 28px rgba(124,58,237,0.28)", transition:"all 0.2s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform="translateY(-3px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform="translateY(0)"; }}
          >
            <div style={{ fontSize:38, flexShrink:0 }}>⚡</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:19, fontWeight:800, marginBottom:4 }}>간단 모드 — 한 줄로 바로 생성</div>
              <div style={{ fontSize:13, opacity:0.92, lineHeight:1.6 }}>
                “비 오는 날 헤어진 연인을 그리는 잔잔한 시티팝” 한 줄만 입력 →<br />장르·무드·보컬까지 AI가 알아서 + 가사·스타일 프롬프트 완성
              </div>
            </div>
            <div style={{ fontSize:22, flexShrink:0 }}>→</div>
          </button>

          <div style={{ textAlign:"center", fontSize:12, color:"#9CA3AF", fontWeight:600, marginBottom:18 }}>또는 직접 골라서 만들기 (디테일 모드)</div>

          {/* Two big mode cards */}
          <div className="suno-mode-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginBottom:40 }}>
            {/* Path A: Lyrics First */}
            <button
              onClick={() => { setAppMode("path-a"); setPathAStep("choose"); }}
              className="suno-mode-btn"
              style={{ background:"white", border:`2px solid ${P}`, borderRadius:24, padding:"40px 32px", cursor:"pointer", textAlign:"left", transition:"all 0.2s", boxShadow:"0 4px 16px rgba(124,58,237,0.12)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform="translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow="0 16px 40px rgba(124,58,237,0.2)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform="translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow="0 4px 16px rgba(124,58,237,0.12)"; }}
            >
              <div style={{ fontSize:40, marginBottom:16 }}>✍️</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:8 }}>가사 먼저 만들기</div>
              <div style={{ fontSize:13, color:"#6B7280", lineHeight:1.7, marginBottom:20 }}>
                스토리가 담긴 가사를 먼저 쓰고<br />어울리는 사운드를 입힙니다.
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {["이미 쓴 가사 붙여넣기 → 스타일 추출", "키워드로 영감 제공 → 스타일 추출", "7가지 항목으로 가사 직접 생성"].map(f => (
                  <div key={f} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:16, height:16, borderRadius:4, background:`rgba(124,58,237,0.1)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:P, fontWeight:800, flexShrink:0 }}>✓</div>
                    <span style={{ fontSize:12, color:"#374151" }}>{f}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:24, padding:"10px 20px", background:`linear-gradient(135deg,${P},${PINK})`, borderRadius:10, fontSize:13, fontWeight:700, color:"white", textAlign:"center" }}>
                가사 먼저 만들기 →
              </div>
            </button>

            {/* Path B: Style First */}
            <button
              onClick={() => { setAppMode("path-b"); setPathBLyricsShown(false); }}
              className="suno-mode-btn"
              style={{ background:"white", border:"2px solid #E5E7EB", borderRadius:24, padding:"40px 32px", cursor:"pointer", textAlign:"left", transition:"all 0.2s", boxShadow:"0 4px 16px rgba(0,0,0,0.06)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform="translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow="0 16px 40px rgba(0,0,0,0.12)"; (e.currentTarget as HTMLElement).style.borderColor="#9CA3AF"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform="translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow="0 4px 16px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLElement).style.borderColor="#E5E7EB"; }}
            >
              <div style={{ fontSize:40, marginBottom:16 }}>🎛️</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#0F172A", marginBottom:8 }}>스타일 프롬프트 먼저</div>
              <div style={{ fontSize:13, color:"#6B7280", lineHeight:1.7, marginBottom:20 }}>
                먼저 음악의 장르·분위기·사운드를 잡고<br />가사를 스타일에 맞춰 생성합니다.
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {["장르 + 무드 + 보컬 + 어드밴스드 설정", "Suno 스타일 프롬프트 자동 생성", "생성된 스타일 기반으로 가사 제작"].map(f => (
                  <div key={f} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:16, height:16, borderRadius:4, background:"rgba(0,0,0,0.05)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:"#6B7280", fontWeight:800, flexShrink:0 }}>✓</div>
                    <span style={{ fontSize:12, color:"#374151" }}>{f}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:24, padding:"10px 20px", background:"#1F2937", borderRadius:10, fontSize:13, fontWeight:700, color:"white", textAlign:"center" }}>
                스타일 프롬프트 먼저 →
              </div>
            </button>
          </div>

          <div style={{ textAlign:"center", fontSize:12, color:"#9CA3AF" }}>
            Powered by <span style={{ color:P, fontWeight:600 }}>Gemini 2.5 Flash</span> + <span style={{ color:PINK, fontWeight:600 }}>Suno AI</span>
          </div>
        </div>
      </div>
    );
  }

  // ── 간단 모드 화면 ────────────────────────────────────────────────────────────
  if (appMode === "simple") {
    const examples = [
      "비 오는 날 헤어진 연인을 그리는 잔잔한 시티팝",
      "새벽 운동 갈 때 듣는 에너지 넘치는 EDM",
      "첫 출근하는 사회초년생을 응원하는 밝은 어쿠스틱",
      "제주 바다를 달리는 드라이브 록",
    ];
    return (
      <div style={{ minHeight:"100vh", background:"#F8F5FF", fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
        <style>{globalStyle}</style>
        {renderLoginModal()}
        {renderNav()}
        <div style={{ maxWidth:720, margin:"0 auto", padding:"36px 20px 80px" }}>
          <button onClick={() => setAppMode("select")} style={{ background:"none", border:"none", color:"#6B7280", fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:20 }}>← 처음으로</button>

          <div style={{ textAlign:"center", marginBottom:28, animation:"fadeUp 0.4s ease both" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚡</div>
            <h1 style={{ fontSize:28, fontWeight:800, color:"#0F172A", letterSpacing:-0.8, marginBottom:10 }}>간단 모드</h1>
            <p style={{ fontSize:14, color:"#6B7280", lineHeight:1.7 }}>어떤 노래를 원하는지 한 줄로만 적어주세요.<br />장르·무드·보컬은 <b style={{ color:P }}>AI가 알아서</b> 정하고 가사·스타일 프롬프트까지 만들어요.</p>
          </div>

          <div style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", boxShadow:"0 4px 16px rgba(124,58,237,0.08)", padding:24, animation:"fadeUp 0.5s ease both" }}>
            <textarea
              value={simpleIdea}
              onChange={e => setSimpleIdea(e.target.value)}
              placeholder="예: 비 오는 날 헤어진 연인을 그리는 잔잔한 시티팝"
              rows={3}
              style={{ width:"100%", padding:"14px 16px", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:15, fontFamily:"inherit", outline:"none", resize:"vertical", lineHeight:1.6 }}
            />
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:12 }}>
              {examples.map(ex => (
                <button key={ex} onClick={() => setSimpleIdea(ex)} style={{ padding:"6px 12px", background:"#F5F3FF", border:"1px solid #EDE9FE", borderRadius:100, fontSize:12, color:"#6D28D9", cursor:"pointer", fontWeight:600 }}>{ex}</button>
              ))}
            </div>
            <button
              onClick={runSimple}
              disabled={!simpleIdea.trim() || simpleLoading}
              style={{ width:"100%", marginTop:16, padding:"15px", borderRadius:14, border:"none", fontSize:15, fontWeight:700, color:"white", cursor:(!simpleIdea.trim()||simpleLoading)?"not-allowed":"pointer", opacity:(!simpleIdea.trim()||simpleLoading)?0.5:1, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 4px 14px rgba(124,58,237,0.3)" }}
            >
              {simpleLoading ? <><Spin size={16} color="white" /> 생성 중... (10~20초)</> : "✨ 바로 생성"}
            </button>
          </div>

          {/* 결과 */}
          {simpleStyle && !simpleLoading && (
            <div style={{ marginTop:24, display:"flex", flexDirection:"column", gap:20 }}>
              {/* AI 해석 칩 */}
              {simpleMeta && (
                <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#9CA3AF", fontWeight:700 }}>AI 해석</span>
                  {[simpleMeta.genre, simpleMeta.mood, simpleMeta.vocal === "없음" ? "보컬 없음" : "보컬 있음", simpleMeta.language].filter(Boolean).map((v, i) => (
                    <span key={i} style={{ padding:"4px 12px", background:"rgba(124,58,237,0.08)", borderRadius:100, fontSize:12, fontWeight:700, color:"#6D28D9" }}>{v}</span>
                  ))}
                </div>
              )}

              {/* 스타일 프롬프트 */}
              <div style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", overflow:"hidden" }}>
                <div style={{ background:`linear-gradient(135deg,${P},${PINK})`, padding:"14px 22px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ color:"white", fontWeight:700, fontSize:15 }}>스타일 프롬프트{simpleTitle && ` — ${simpleTitle}`}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => copy(simpleStyle, "simple-style")} style={{ padding:"5px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:600 }}>{copiedTarget === "simple-style" ? "✓ 복사됨" : "복사"}</button>
                    <button onClick={saveSimple} style={{ padding:"5px 14px", background:simpleSaved?"rgba(16,185,129,0.85)":"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:700 }}>{simpleSaved ? "✓ 저장됨" : "📚 저장"}</button>
                  </div>
                </div>
                <div style={{ padding:"20px 22px" }}>
                  <div style={{ fontSize:13, color:"#374151", lineHeight:1.8, background:"#FAFAFA", borderRadius:10, padding:16, border:"1px solid #F3F4F6" }}>{simpleStyle}</div>
                  <div style={{ marginTop:8, fontSize:11, color:"#9CA3AF", textAlign:"right" }}>{simpleStyle.length} / 1000자</div>
                </div>
              </div>

              {/* 가사 */}
              {simpleLyrics && (
                <div style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", overflow:"hidden" }}>
                  <div style={{ background:"linear-gradient(135deg,#1E3A5F,#2563EB)", padding:"14px 22px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ color:"white", fontWeight:700, fontSize:15 }}>생성된 가사</div>
                    <button onClick={() => copy(simpleLyrics, "simple-lyrics")} style={{ padding:"5px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:600 }}>{copiedTarget === "simple-lyrics" ? "✓ 복사됨" : "복사"}</button>
                  </div>
                  <div style={{ padding:"20px 22px" }}>
                    <pre style={{ fontSize:13, color:"#374151", lineHeight:1.9, whiteSpace:"pre-wrap", background:"#FAFAFA", borderRadius:10, padding:16, border:"1px solid #F3F4F6", fontFamily:"inherit", margin:0 }}>{simpleLyrics}</pre>
                  </div>
                </div>
              )}

              <div style={{ textAlign:"center" }}>
                <button onClick={() => setAppMode("path-b")} style={{ padding:"10px 20px", background:"white", border:`1.5px solid ${P}`, borderRadius:10, fontSize:13, fontWeight:700, color:P, cursor:"pointer" }}>⚙️ 디테일 모드로 더 세밀하게 →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SHARED: LYRICS FORM (7 items) ────────────────────────────────────────────
  const renderLyricsForm = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:28 }}>
      {/* 1. Core Emotions */}
      <Field label="① 핵심 감정" hint="최대 3개">
        <div className="chip-row" style={{ marginBottom:12 }}>
          {CORE_EMOTIONS.map(e => (
            <Chip key={e} label={e}
              selected={lyricsEmotions.includes(e)}
              onClick={() => {
                if (lyricsEmotions.includes(e)) setLyricsEmotions(prev => prev.filter(x => x !== e));
                else if (lyricsEmotions.length < 3) setLyricsEmotions(prev => [...prev, e]);
              }}
            />
          ))}
        </div>
        <SliderField label="감정 강도" value={emotionIntensity} onChange={setEmotionIntensity} leftLabel="극도로 절제" rightLabel="폭발적" />
      </Field>

      {/* 2. Situation */}
      <Field label="② 상황 · 스토리">
        <div className="chip-row" style={{ marginBottom:12 }}>
          {SITUATIONS.map(s => (
            <Chip key={s} label={s} selected={lyricsSituation === s} onClick={() => setLyricsSituation(prev => prev === s ? "" : s)} />
          ))}
        </div>
        {/* Narrative Structure Preview */}
        {narrative && (
          <div style={{ background:"rgba(124,58,237,0.04)", border:"1.5px solid rgba(124,58,237,0.15)", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:P, letterSpacing:1.5, marginBottom:10 }}>📖 서사 구조 미리보기</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {([["1절", narrative.v1], ["2절", narrative.v2], ["브릿지", narrative.bridge], ["아웃트로", narrative.outro]] as [string, string][]).map(([label, desc]) => (
                <div key={label} style={{ display:"flex", gap:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:P, minWidth:42, paddingTop:1 }}>{label}</div>
                  <div style={{ fontSize:12, color:"#4B5563", lineHeight:1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <input value={situationDetail} onChange={e => setSituationDetail(e.target.value)}
          placeholder="상황을 한 줄로 설명해주세요 (예: 비 오는 날 카페에서 재회한 두 사람)" style={inputStyle} />
      </Field>

      {/* 3. Background Scene */}
      <Field label="③ 배경 · 장면" hint="최대 3개">
        <div className="chip-row">
          {BACKGROUND_SCENES.map(s => (
            <Chip key={s} label={s} selected={backgroundScenes.includes(s)}
              onClick={() => {
                if (backgroundScenes.includes(s)) setBackgroundScenes(prev => prev.filter(x => x !== s));
                else if (backgroundScenes.length < 3) setBackgroundScenes(prev => [...prev, s]);
              }}
            />
          ))}
        </div>
      </Field>

      {/* 4. Symbol Keywords — tag input */}
      <Field label="④ 키워드 · 상징어" hint="3~7개, Enter로 추가">
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:8 }}>
          {symbolKeywords.map(kw => (
            <span key={kw} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 12px", background:`rgba(124,58,237,0.08)`, border:`1.5px solid ${P}`, borderRadius:100, fontSize:12, color:P, fontWeight:600 }}>
              {kw}
              <button onClick={() => setSymbolKeywords(prev => prev.filter(x => x !== kw))}
                style={{ background:"none", border:"none", cursor:"pointer", color:P, fontSize:14, lineHeight:1, padding:0, marginTop:-1 }}>×</button>
            </span>
          ))}
          {symbolKeywords.length < 7 && (
            <input value={symbolInput} onChange={e => setSymbolInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && symbolInput.trim()) {
                  e.preventDefault();
                  setSymbolKeywords(prev => [...prev, symbolInput.trim()]);
                  setSymbolInput("");
                }
              }}
              placeholder={symbolKeywords.length === 0 ? "예: 파도, 창문, 기차..." : "추가..."}
              style={{ ...inputStyle, width:"auto", flex:1, minWidth:120 }} />
          )}
        </div>
        <div style={{ fontSize:10, color:"#9CA3AF" }}>상징어는 가사 전체에 변주되어 반복됩니다. (파도→tide→물결→잠기다)</div>
      </Field>

      {/* 5. Prohibitions */}
      <Field label="⑤ 금지 요소">
        <div className="chip-row" style={{ marginBottom:10 }}>
          {PROHIBITION_CHIPS.map(p => (
            <Chip key={p} label={p} color="#EF4444" selected={lyricProhibitions.includes(p)}
              onClick={() => {
                if (lyricProhibitions.includes(p)) setLyricProhibitions(prev => prev.filter(x => x !== p));
                else setLyricProhibitions(prev => [...prev, p]);
              }}
            />
          ))}
        </div>
        <input value={prohibitionCustom} onChange={e => setProhibitionCustom(e.target.value)}
          placeholder="직접 입력 (예: 계절 묘사 없이, 날씨 언급 금지...)" style={inputStyle} />
      </Field>

      {/* 6. Hook Style */}
      <Field label="⑥ 후킹 스타일" hint="최대 2개">
        <div className="chip-row">
          {HOOK_STYLES_LYRICS.map(h => (
            <Chip key={h} label={h} selected={lyricsHookStyles.includes(h)}
              onClick={() => {
                if (lyricsHookStyles.includes(h)) setLyricsHookStyles(prev => prev.filter(x => x !== h));
                else if (lyricsHookStyles.length < 2) setLyricsHookStyles(prev => [...prev, h]);
              }}
            />
          ))}
        </div>
      </Field>

      {/* 7. Expression Tone + Language */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:20, alignItems:"end" }}>
        <Field label="⑦ 표현 톤">
          <SliderField label="" value={expressionTone} onChange={setExpressionTone} leftLabel="직설적·솔직" rightLabel="시적·은유" />
        </Field>
        <Field label="언어">
          <div style={{ display:"flex", gap:0, borderRadius:10, overflow:"hidden", border:`1.5px solid ${P}` }}>
            {(["한국어", "영어"] as const).map(lng => (
              <button key={lng} onClick={() => setLyricsLanguage(lng)} style={{
                padding:"8px 18px", background:lyricsLanguage === lng ? P : "white",
                color:lyricsLanguage === lng ? "white" : P,
                border:"none", cursor:"pointer", fontSize:13, fontWeight:700, transition:"all 0.15s",
              }}>{lng === "한국어" ? "KOR" : "ENG"}</button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );

  // ── SHARED: STYLE FORM ───────────────────────────────────────────────────────
  const renderStyleForm = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* LyricsContext Banner */}
      {lyricsContext && (
        <div style={{ background:"rgba(124,58,237,0.06)", border:"1.5px solid rgba(124,58,237,0.2)", borderRadius:14, padding:"14px 18px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:P, letterSpacing:1, marginBottom:8 }}>✨ 가사 분석 결과가 반영되었습니다</div>
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"4px 12px", fontSize:12 }}>
            {lyricsContext.genre && <><span style={{ color:"#9CA3AF" }}>장르</span><span style={{ color:"#1F2937", fontWeight:500 }}>{lyricsContext.genre}</span></>}
            {lyricsContext.mood && <><span style={{ color:"#9CA3AF" }}>분위기</span><span style={{ color:"#1F2937", fontWeight:500 }}>{lyricsContext.mood}</span></>}
            {lyricsContext.styleHint && <><span style={{ color:"#9CA3AF" }}>방향</span><span style={{ color:"#1F2937", fontWeight:500 }}>{lyricsContext.styleHint}</span></>}
          </div>
        </div>
      )}

      {/* Project Type */}
      <div style={{ display:"flex", gap:10 }}>
        {(["single","album"] as const).map(pt => (
          <button key={pt} onClick={() => setProjectType(pt)} style={{
            padding:"8px 20px", borderRadius:10, border:`1.5px solid ${projectType===pt?P:"#E5E7EB"}`,
            background:projectType===pt?P:"white", color:projectType===pt?"white":"#374151",
            fontSize:13, fontWeight:600, cursor:"pointer",
          }}>{pt === "single" ? "🎵 싱글" : "💿 앨범"}</button>
        ))}
        {projectType === "album" && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:12, color:"#6B7280" }}>트랙 수</span>
            <select value={trackCount} onChange={e => setTrackCount(Number(e.target.value))} style={{ ...selectStyle, width:60 }}>
              {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Title */}
      <div style={{ display:"flex", gap:10 }}>
        {(["custom","random"] as const).map(tm => (
          <button key={tm} onClick={() => setTitleMode(tm)} style={{
            padding:"6px 14px", borderRadius:8, border:`1.5px solid ${titleMode===tm?P:"#E5E7EB"}`,
            background:titleMode===tm?"rgba(124,58,237,0.08)":"transparent",
            color:titleMode===tm?P:"#6B7280", fontSize:12, fontWeight:600, cursor:"pointer",
          }}>{tm === "custom" ? "직접 입력" : "🎲 AI 추천"}</button>
        ))}
      </div>
      {titleMode === "custom" && (
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="곡 제목" style={inputStyle} />
      )}

      {/* Genre + Mood */}
      <div className="suno-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Field label="장르 1">
          <select value={genre1} onChange={e => setGenre1(e.target.value)} style={selectStyle}>
            {GENRES.map(g => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="장르 2 (선택)">
          <select value={genre2} onChange={e => setGenre2(e.target.value)} style={selectStyle}>
            <option value="">없음</option>
            {GENRES.filter(g => g !== genre1).map(g => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="무드">
          <select value={mood} onChange={e => setMood(e.target.value)} style={selectStyle}>
            {MOODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="강도">
          <select value={intensity} onChange={e => setIntensity(e.target.value)} style={selectStyle}>
            {["랜덤","극도로 강렬한","강한","중간","잔잔한","극도로 부드러운"].map(v => <option key={v}>{v}</option>)}
          </select>
        </Field>
      </div>

      {/* BPM + Vocal */}
      <div className="suno-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Field label="BPM">
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            {(["random","custom"] as const).map(bm => (
              <button key={bm} onClick={() => setBpmMode(bm)} style={{ padding:"5px 12px", borderRadius:7, border:`1.5px solid ${bpmMode===bm?P:"#E5E7EB"}`, background:bpmMode===bm?"rgba(124,58,237,0.08)":"transparent", color:bpmMode===bm?P:"#6B7280", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                {bm === "random" ? "자동" : "직접 입력"}
              </button>
            ))}
          </div>
          {bpmMode === "custom" && <input value={bpm} onChange={e => setBpm(e.target.value)} placeholder="예: 128" style={inputStyle} />}
        </Field>
        <Field label="보컬">
          <select value={vocal} onChange={e => setVocal(e.target.value)} style={selectStyle}>
            {["있음","여성 보컬","남성 보컬","혼성","없음 (인스트루멘탈)"].map(v => <option key={v}>{v}</option>)}
          </select>
        </Field>
      </div>

      {/* Purpose + Topic */}
      <Field label="사용 목적">
        <div className="chip-row">
          {PURPOSES.map(p => (
            <Chip key={p} label={p} selected={purpose===p} onClick={() => setPurpose(p)} />
          ))}
        </div>
      </Field>
      <Field label="주제 / 테마">
        <textarea value={topic} onChange={e => setTopic(e.target.value)}
          placeholder="곡의 주제나 테마를 간단히 적어주세요 (예: 제주 해변에서의 마지막 여름)"
          style={{ ...inputStyle, height:70, resize:"vertical" }} />
      </Field>
      <Field label="추가 요청사항">
        <textarea value={addRequest} onChange={e => setAddRequest(e.target.value)}
          placeholder="특별히 원하는 사운드나 스타일이 있으면 적어주세요"
          style={{ ...inputStyle, height:60, resize:"vertical" }} />
      </Field>

      {/* Advanced Toggle */}
      <div>
        <button onClick={() => setAdvancedMode(!advancedMode)} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", background:advancedMode?"rgba(124,58,237,0.08)":"white", border:`1.5px solid ${advancedMode?P:"#E5E7EB"}`, borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600, color:advancedMode?P:"#374151" }}>
          <span style={{ fontSize:14 }}>⚙️</span>
          고급 사운드 설정 {advancedMode?"▲":"▼"}
        </button>
        {advancedMode && (
          <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:20, padding:"20px", background:"rgba(124,58,237,0.03)", border:"1.5px solid rgba(124,58,237,0.12)", borderRadius:14 }}>
            {/* Presets */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"#6B21A8", letterSpacing:1.2, marginBottom:10 }}>빠른 프리셋</div>
              <div className="chip-row">
                {PRESETS.map(pr => (
                  <button key={pr.name} onClick={() => { applyPreset(pr.set); setAdvancedMode(true); }} style={{ padding:"6px 14px", borderRadius:100, border:"1.5px solid #E5E7EB", background:"white", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                    {pr.emoji} {pr.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="suno-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {[["보컬 방향", vocalDirection, setVocalDirection, VOCAL_DIRECTIONS],["공간/장소", venueMood, setVenueMood, VENUE_MOODS],["에너지 커브", energyCurve, setEnergyCurve, ENERGY_CURVES],["BPM 질감", bpmFeel, setBpmFeel, BPM_FEELS],["보컬 프로덕션", vocalProduction, setVocalProduction, VOCAL_PRODUCTION]].map(([label, val, setter, opts]) => (
                <Field key={label as string} label={label as string}>
                  <select value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} style={selectStyle}>
                    {(opts as string[]).map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
              ))}
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"#6B21A8", letterSpacing:1.2, marginBottom:10 }}>악기 설정</div>
              <div className="suno-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[["기타", instGuitar, setInstGuitar, INSTRUMENT_GUITAR],["드럼", instDrums, setInstDrums, INSTRUMENT_DRUMS],["베이스", instBass, setInstBass, INSTRUMENT_BASS],["신스", instSynth, setInstSynth, INSTRUMENT_SYNTH]].map(([label, val, setter, opts]) => (
                  <Field key={label as string} label={label as string}>
                    <select value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} style={selectStyle}>
                      {(opts as string[]).map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── SHARED: RESULTS PANEL ─────────────────────────────────────────────────────
  const renderResultsPanel = () => {
    if (!results.length && !lyricsResult) return null;
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
        {/* Style Prompt Results */}
        {results.map((r, i) => (
          <div key={i} style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", overflow:"hidden", animation:"fadeUp 0.4s ease both" }}>
            <div style={{ background:`linear-gradient(135deg,${P},${PINK})`, padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ color:"white", fontWeight:700, fontSize:15 }}>
                {results.length > 1 ? `트랙 ${i + 1}` : "스타일 프롬프트"} {r.suggestedTitle && `— ${r.suggestedTitle}`}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => copy(r.stylePrompt, `style-${i}`)} style={{ padding:"5px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                  {copiedTarget === `style-${i}` ? "✓ 복사됨" : "복사"}
                </button>
                <button onClick={() => saveResultToLibrary(i)} style={{ padding:"5px 14px", background:savedIndices.has(i)?"rgba(16,185,129,0.85)":"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                  {savedIndices.has(i) ? "✓ 저장됨" : "📚 저장"}
                </button>
              </div>
            </div>
            <div style={{ padding:"20px 24px" }}>
              <div style={{ fontSize:13, color:"#374151", lineHeight:1.8, background:"#FAFAFA", borderRadius:10, padding:"16px", border:"1px solid #F3F4F6" }}>
                {r.stylePrompt}
              </div>
              <div style={{ marginTop:8, fontSize:11, color:"#9CA3AF", textAlign:"right" }}>
                {r.stylePrompt.length} / 1000자
              </div>
            </div>
          </div>
        ))}

        {/* Lyrics Result */}
        {lyricsResult && (
          <div style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", overflow:"hidden", animation:"fadeUp 0.4s ease both" }}>
            <div style={{ background:"linear-gradient(135deg,#1E3A5F,#2563EB)", padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ color:"white", fontWeight:700, fontSize:15 }}>생성된 가사</div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => copy(lyricsResult.lyrics, "lyrics-gen")} style={{ padding:"5px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                  {copiedTarget === "lyrics-gen" ? "✓ 복사됨" : "복사"}
                </button>
                <button onClick={saveLyricsToLibrary} style={{ padding:"5px 14px", background:lyricsSaved?"rgba(16,185,129,0.85)":"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                  {lyricsSaved ? "✓ 저장됨" : "📚 저장"}
                </button>
              </div>
            </div>
            <div style={{ padding:"20px 24px" }}>
              {lyricsResult.hookLine && (
                <div style={{ background:"rgba(37,99,235,0.06)", border:"1.5px solid rgba(37,99,235,0.15)", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:14, fontWeight:700, color:"#1E3A5F" }}>
                  🎯 핵심 라인: &quot;{lyricsResult.hookLine}&quot;
                </div>
              )}
              <pre style={{ fontSize:13, color:"#374151", lineHeight:1.9, whiteSpace:"pre-wrap", background:"#FAFAFA", borderRadius:10, padding:"16px", border:"1px solid #F3F4F6", fontFamily:"inherit", margin:0 }}>
                {lyricsResult.lyrics}
              </pre>
              {lyricsResult.symbolVariations?.length > 0 && (
                <div style={{ marginTop:14, fontSize:12, color:"#6B7280" }}>
                  <span style={{ fontWeight:600 }}>상징어 변주: </span>
                  {lyricsResult.symbolVariations.join(" · ")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── PATH A: LYRICS FIRST ─────────────────────────────────────────────────────
  if (appMode === "path-a") {
    return (
      <div style={{ minHeight:"100vh", background:"#F8F5FF", fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
        <style>{globalStyle}</style>
        {renderLoginModal()}
        {renderNav()}

        {/* Step indicator */}
        <div className="suno-step-bar" style={{ background:"white", borderBottom:"1px solid #EDE9FE", padding:"12px 40px" }}>
          <div style={{ maxWidth:780, margin:"0 auto", display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={() => setAppMode("select")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF", padding:0 }}>← 처음으로</button>
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              {[{ step:"choose", label:"가사 입력" }, { step:"create", label:"가사 생성" }, { step:"style", label:"스타일 프롬프트" }].map(({ step, label }, idx) => {
                const stepOrder = { choose:0, paste:0, create:1, style:2 };
                const currentOrder = stepOrder[pathAStep as keyof typeof stepOrder];
                const isActive = stepOrder[step as keyof typeof stepOrder] === currentOrder;
                const isDone = stepOrder[step as keyof typeof stepOrder] < currentOrder;
                return (
                  <div key={step} style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:isDone?"#10B981":isActive?P:"#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:isDone||isActive?"white":"#9CA3AF", fontWeight:700 }}>
                      {isDone ? "✓" : idx + 1}
                    </div>
                    <span style={{ fontSize:12, fontWeight:isActive?700:500, color:isActive?P:isDone?"#10B981":"#9CA3AF" }}>{label}</span>
                    {idx < 2 && <div style={{ width:24, height:1, background:"#E5E7EB" }} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="suno-page-pad" style={{ maxWidth:780, margin:"0 auto", padding:"40px 40px 80px" }}>
          {/* STEP: choose */}
          {pathAStep === "choose" && (
            <div style={{ animation:"fadeUp 0.4s ease both" }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"#0F172A", marginBottom:8 }}>가사를 어떻게 준비하셨나요?</h2>
              <p style={{ fontSize:14, color:"#6B7280", marginBottom:32 }}>준비된 가사가 있으면 붙여넣고, 없으면 직접 만들어드릴게요.</p>
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <button onClick={() => setPathAStep("paste")} style={{ padding:"24px 28px", background:"white", border:`2px solid ${P}`, borderRadius:18, cursor:"pointer", textAlign:"left", transition:"all 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow=`0 8px 24px rgba(124,58,237,0.15)`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow="none"; }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>📋</div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#0F172A", marginBottom:4 }}>이미 가사가 있어요</div>
                  <div style={{ fontSize:13, color:"#6B7280" }}>완성된 가사 또는 키워드/영감 구절을 붙여넣어 스타일을 추출합니다.</div>
                </button>
                <button onClick={() => setPathAStep("create")} style={{ padding:"24px 28px", background:"white", border:"2px solid #E5E7EB", borderRadius:18, cursor:"pointer", textAlign:"left", transition:"all 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor="#9CA3AF"; (e.currentTarget as HTMLElement).style.boxShadow="0 8px 24px rgba(0,0,0,0.08)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor="#E5E7EB"; (e.currentTarget as HTMLElement).style.boxShadow="none"; }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>✍️</div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#0F172A", marginBottom:4 }}>가사를 새로 만들게요</div>
                  <div style={{ fontSize:13, color:"#6B7280" }}>7가지 항목을 입력하면 AI가 스토리가 있는 가사를 만들어드립니다.</div>
                </button>
              </div>
            </div>
          )}

          {/* STEP: paste */}
          {pathAStep === "paste" && (
            <div style={{ animation:"fadeUp 0.4s ease both" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
                <button onClick={() => setPathAStep("choose")} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:13 }}>← 뒤로</button>
                <h2 style={{ fontSize:22, fontWeight:800, color:"#0F172A", margin:0 }}>가사 / 영감 붙여넣기</h2>
              </div>
              <div style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", padding:"24px" }}>
                {/* Type toggle */}
                <div style={{ display:"flex", gap:0, borderRadius:10, overflow:"hidden", border:`1.5px solid ${P}`, width:"fit-content", marginBottom:16 }}>
                  {(["full","keywords"] as const).map(t => (
                    <button key={t} onClick={() => setLyricsInputType(t)} style={{ padding:"8px 20px", background:lyricsInputType===t?P:"white", color:lyricsInputType===t?"white":P, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, transition:"all 0.15s" }}>
                      {t === "full" ? "완성된 가사" : "키워드 / 영감 구절"}
                    </button>
                  ))}
                </div>
                <textarea
                  value={lyricsRawText} onChange={e => setLyricsRawText(e.target.value)}
                  placeholder={lyricsInputType === "full"
                    ? "가사 전문을 붙여넣어 주세요. AI가 분위기·장르·스타일을 분석합니다."
                    : "영감이 되는 구절이나 키워드를 자유롭게 적어주세요.\n예: '빗소리, 창문, 혼자인 새벽, 보내야 한다는 걸 알면서도'"}
                  style={{ ...inputStyle, height:200, resize:"vertical", marginBottom:16 }} />
                <button onClick={analyzeLyrics} disabled={!lyricsRawText.trim() || analyzingLyrics} style={{
                  width:"100%", padding:"14px", background:lyricsRawText.trim()?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB",
                  border:"none", borderRadius:12, fontSize:14, fontWeight:700,
                  color:lyricsRawText.trim()?"white":"#9CA3AF", cursor:lyricsRawText.trim()?"pointer":"not-allowed",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}>
                  {analyzingLyrics ? <><Spin size={14} color="white" /> 분석 중...</> : "🔍 분석하고 스타일로 →"}
                </button>
              </div>
            </div>
          )}

          {/* STEP: create (lyrics form) */}
          {pathAStep === "create" && (
            <div style={{ animation:"fadeUp 0.4s ease both" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
                <button onClick={() => setPathAStep("choose")} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:13 }}>← 뒤로</button>
                <h2 style={{ fontSize:22, fontWeight:800, color:"#0F172A", margin:0 }}>가사 생성하기</h2>
              </div>
              <SectionCard num="✍" title="가사 생성 설정">
                {renderLyricsForm()}
              </SectionCard>
              <div style={{ marginTop:24 }}>
                <button onClick={generateLyrics} disabled={generatingLyrics} style={{
                  width:"100%", padding:"16px", background:`linear-gradient(135deg,${P},${PINK})`,
                  border:"none", borderRadius:14, fontSize:15, fontWeight:800, color:"white",
                  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                  boxShadow:`0 8px 24px rgba(124,58,237,0.35)`,
                }}>
                  {generatingLyrics ? <><Spin size={16} color="white" /> 가사 생성 중...</> : "✍️ 가사 생성하기"}
                </button>
              </div>

              {/* Lyrics Result + Continue to Style */}
              {lyricsResult && (
                <div style={{ marginTop:32, display:"flex", flexDirection:"column", gap:20, animation:"fadeUp 0.4s ease both" }}>
                  <div style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", overflow:"hidden" }}>
                    <div style={{ background:"linear-gradient(135deg,#1E3A5F,#2563EB)", padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ color:"white", fontWeight:700, fontSize:15 }}>생성된 가사</div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => copy(lyricsResult.lyrics, "lyrics-a")} style={{ padding:"5px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                          {copiedTarget === "lyrics-a" ? "✓ 복사됨" : "복사"}
                        </button>
                        <button onClick={saveLyricsToLibrary} style={{ padding:"5px 14px", background:lyricsSaved?"rgba(16,185,129,0.85)":"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                          {lyricsSaved ? "✓ 저장됨" : "📚 저장"}
                        </button>
                      </div>
                    </div>
                    <div style={{ padding:"20px 24px" }}>
                      {lyricsResult.hookLine && (
                        <div style={{ background:"rgba(37,99,235,0.06)", border:"1.5px solid rgba(37,99,235,0.15)", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:14, fontWeight:700, color:"#1E3A5F" }}>
                          🎯 핵심 라인: &quot;{lyricsResult.hookLine}&quot;
                        </div>
                      )}
                      <pre style={{ fontSize:13, color:"#374151", lineHeight:1.9, whiteSpace:"pre-wrap", background:"#FAFAFA", borderRadius:10, padding:"16px", border:"1px solid #F3F4F6", fontFamily:"inherit", margin:0 }}>
                        {lyricsResult.lyrics}
                      </pre>
                    </div>
                  </div>
                  <button onClick={() => setPathAStep("style")} style={{
                    width:"100%", padding:"16px", background:`linear-gradient(135deg,${P},${PINK})`,
                    border:"none", borderRadius:14, fontSize:15, fontWeight:800, color:"white",
                    cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                    boxShadow:`0 8px 24px rgba(124,58,237,0.35)`,
                  }}>
                    🎛️ 스타일 프롬프트 만들기 →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP: style (Path A) */}
          {pathAStep === "style" && (
            <div style={{ animation:"fadeUp 0.4s ease both" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
                <button onClick={() => setPathAStep(lyricsResult ? "create" : "paste")} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:13 }}>← 뒤로</button>
                <h2 style={{ fontSize:22, fontWeight:800, color:"#0F172A", margin:0 }}>스타일 프롬프트 생성</h2>
              </div>
              <SectionCard num="🎛" title="스타일 설정">
                {renderStyleForm()}
              </SectionCard>
              <div style={{ marginTop:24 }}>
                <button onClick={generate} disabled={loading} style={{
                  width:"100%", padding:"16px", background:`linear-gradient(135deg,${P},${PINK})`,
                  border:"none", borderRadius:14, fontSize:15, fontWeight:800, color:"white",
                  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                  boxShadow:`0 8px 24px rgba(124,58,237,0.35)`,
                }}>
                  {loading ? <><Spin size={16} color="white" /> 스타일 프롬프트 생성 중...</> : "✨ Suno 스타일 프롬프트 생성"}
                </button>
              </div>
              {results.length > 0 && (
                <div style={{ marginTop:32 }}>
                  {renderResultsPanel()}
                </div>
              )}
              {/* Audio + Publishing (shared bottom) */}
              {renderSharedBottom()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PATH B: STYLE FIRST ──────────────────────────────────────────────────────
  if (appMode === "path-b") {
    return (
      <div style={{ minHeight:"100vh", background:"#F8F5FF", fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
        <style>{globalStyle}</style>
        {renderLoginModal()}
        {renderNav()}

        {/* Step indicator */}
        <div className="suno-step-bar" style={{ background:"white", borderBottom:"1px solid #EDE9FE", padding:"12px 40px" }}>
          <div style={{ maxWidth:780, margin:"0 auto", display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={() => setAppMode("select")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF", padding:0 }}>← 처음으로</button>
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              {[{ label:"스타일 설정" }, { label:"가사 생성" }, { label:"완성" }].map(({ label }, idx) => {
                const current = !results.length ? 0 : !lyricsResult ? 1 : 2;
                const isActive = idx === current, isDone = idx < current;
                return (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:isDone?"#10B981":isActive?P:"#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:isDone||isActive?"white":"#9CA3AF", fontWeight:700 }}>
                      {isDone ? "✓" : idx + 1}
                    </div>
                    <span style={{ fontSize:12, fontWeight:isActive?700:500, color:isActive?P:isDone?"#10B981":"#9CA3AF" }}>{label}</span>
                    {idx < 2 && <div style={{ width:24, height:1, background:"#E5E7EB" }} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="suno-page-pad" style={{ maxWidth:780, margin:"0 auto", padding:"40px 40px 80px" }}>
          {/* Style Form */}
          <SectionCard num="🎛" title="스타일 설정">
            {renderStyleForm()}
          </SectionCard>
          <div style={{ marginTop:24 }}>
            <button onClick={generate} disabled={loading} style={{
              width:"100%", padding:"16px", background:`linear-gradient(135deg,${P},${PINK})`,
              border:"none", borderRadius:14, fontSize:15, fontWeight:800, color:"white",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10,
              boxShadow:`0 8px 24px rgba(124,58,237,0.35)`,
            }}>
              {loading ? <><Spin size={16} color="white" /> 스타일 프롬프트 생성 중...</> : "✨ Suno 스타일 프롬프트 생성"}
            </button>
          </div>

          {/* Style Prompt Result */}
          {results.length > 0 && (
            <div style={{ marginTop:32, display:"flex", flexDirection:"column", gap:24, animation:"fadeUp 0.4s ease both" }}>
              {results.map((r, i) => (
                <div key={i} style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", overflow:"hidden" }}>
                  <div style={{ background:`linear-gradient(135deg,${P},${PINK})`, padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ color:"white", fontWeight:700, fontSize:15 }}>
                      {results.length > 1 ? `트랙 ${i + 1}` : "스타일 프롬프트"} {r.suggestedTitle && `— ${r.suggestedTitle}`}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={() => copy(r.stylePrompt, `style-b-${i}`)} style={{ padding:"5px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                        {copiedTarget === `style-b-${i}` ? "✓ 복사됨" : "복사"}
                      </button>
                      <button onClick={() => saveResultToLibrary(i)} style={{ padding:"5px 14px", background:savedIndices.has(i)?"rgba(16,185,129,0.85)":"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                        {savedIndices.has(i) ? "✓ 저장됨" : "📚 저장"}
                      </button>
                    </div>
                  </div>
                  <div style={{ padding:"20px 24px" }}>
                    <div style={{ fontSize:13, color:"#374151", lineHeight:1.8, background:"#FAFAFA", borderRadius:10, padding:"16px", border:"1px solid #F3F4F6" }}>
                      {r.stylePrompt}
                    </div>
                    <div style={{ marginTop:8, fontSize:11, color:"#9CA3AF", textAlign:"right" }}>{r.stylePrompt.length} / 1000자</div>
                  </div>
                </div>
              ))}

              {/* Lyrics Confirmation Banner + Form */}
              <div ref={lyricsTopRef} style={{ background:"linear-gradient(135deg,rgba(124,58,237,0.06),rgba(236,72,153,0.04))", border:`1.5px solid ${P}`, borderRadius:20, overflow:"hidden", animation:"fadeUp 0.4s ease 0.2s both" }}>
                <div style={{ background:`linear-gradient(135deg,${P},${PINK})`, padding:"16px 24px", display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:20 }}>✨</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:"white" }}>스타일 프롬프트를 기반으로 이대로 가사를 생성할까요?</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", marginTop:2 }}>설정을 조정하거나 바로 가사 생성하기를 누르세요</div>
                  </div>
                  <button onClick={() => setPathBLyricsShown(!pathBLyricsShown)} style={{ marginLeft:"auto", padding:"6px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                    {pathBLyricsShown ? "접기 ▲" : "설정 보기 ▼"}
                  </button>
                </div>

                <div style={{ padding:"24px" }}>
                  {/* Always-visible: KOR/ENG toggle + direct generate */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: pathBLyricsShown ? 24 : 0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <span style={{ fontSize:13, color:"#374151", fontWeight:600 }}>가사 언어</span>
                      <div style={{ display:"flex", gap:0, borderRadius:10, overflow:"hidden", border:`1.5px solid ${P}` }}>
                        {(["한국어","영어"] as const).map(lng => (
                          <button key={lng} onClick={() => setLyricsLanguage(lng)} style={{ padding:"7px 16px", background:lyricsLanguage===lng?P:"white", color:lyricsLanguage===lng?"white":P, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, transition:"all 0.15s" }}>
                            {lng === "한국어" ? "KOR" : "ENG"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={generateLyrics} disabled={generatingLyrics} style={{
                      padding:"12px 28px", background:`linear-gradient(135deg,${P},${PINK})`,
                      border:"none", borderRadius:12, fontSize:14, fontWeight:800, color:"white",
                      cursor:"pointer", display:"flex", alignItems:"center", gap:8,
                      boxShadow:`0 6px 20px rgba(124,58,237,0.3)`,
                    }}>
                      {generatingLyrics ? <><Spin size={14} color="white" /> 생성 중...</> : "✍️ 가사 생성하기"}
                    </button>
                  </div>

                  {pathBLyricsShown && (
                    <div style={{ marginTop:8, borderTop:"1px solid #EDE9FE", paddingTop:24 }}>
                      {renderLyricsForm()}
                    </div>
                  )}
                </div>
              </div>

              {/* Lyrics Result */}
              {lyricsResult && (
                <div style={{ background:"white", borderRadius:20, border:"1px solid #EDE9FE", overflow:"hidden", animation:"fadeUp 0.4s ease both" }}>
                  <div style={{ background:"linear-gradient(135deg,#1E3A5F,#2563EB)", padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ color:"white", fontWeight:700, fontSize:15 }}>생성된 가사</div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={() => copy(lyricsResult.lyrics, "lyrics-b")} style={{ padding:"5px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                        {copiedTarget === "lyrics-b" ? "✓ 복사됨" : "복사"}
                      </button>
                      <button onClick={saveLyricsToLibrary} style={{ padding:"5px 14px", background:lyricsSaved?"rgba(16,185,129,0.85)":"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:8, color:"white", fontSize:12, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                        {lyricsSaved ? "✓ 저장됨" : "📚 저장"}
                      </button>
                    </div>
                  </div>
                  <div style={{ padding:"20px 24px" }}>
                    {lyricsResult.hookLine && (
                      <div style={{ background:"rgba(37,99,235,0.06)", border:"1.5px solid rgba(37,99,235,0.15)", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:14, fontWeight:700, color:"#1E3A5F" }}>
                        🎯 핵심 라인: &quot;{lyricsResult.hookLine}&quot;
                      </div>
                    )}
                    <pre style={{ fontSize:13, color:"#374151", lineHeight:1.9, whiteSpace:"pre-wrap", background:"#FAFAFA", borderRadius:10, padding:"16px", border:"1px solid #F3F4F6", fontFamily:"inherit", margin:0 }}>
                      {lyricsResult.lyrics}
                    </pre>
                    {lyricsResult.symbolVariations?.length > 0 && (
                      <div style={{ marginTop:14, fontSize:12, color:"#6B7280" }}>
                        <span style={{ fontWeight:600 }}>상징어 변주: </span>
                        {lyricsResult.symbolVariations.join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {renderSharedBottom()}
        </div>
      </div>
    );
  }

  return null;
}
