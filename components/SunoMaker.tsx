"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";

// ── CONSTANTS ──────────────────────────────────────────────────────────────
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
  { id: "spotify",  label: "Spotify",      lufs: -14, color: "#1DB954" },
  { id: "apple",    label: "Apple Music",  lufs: -16, color: "#FC3C44" },
  { id: "youtube",  label: "YouTube",      lufs: -14, color: "#FF0000" },
  { id: "soundcloud", label: "SoundCloud", lufs: -8,  color: "#FF5500" },
];

// ── STYLES ─────────────────────────────────────────────────────────────────
const P = "#7C3AED";
const PINK = "#EC4899";

// ── AUDIO UTILS ────────────────────────────────────────────────────────────
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
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
    }
  }
  return Math.round(20 * Math.log10(peak || 0.0001) * 10) / 10;
}

function detectBPM(buffer: AudioBuffer): number {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const winSamples = Math.floor(sr * 0.1); // 100ms windows
  const maxWin = Math.min(Math.floor(ch.length / winSamples), 300); // first 30s
  const energies: number[] = [];
  for (let i = 0; i < maxWin; i++) {
    let e = 0;
    for (let j = 0; j < winSamples; j++) e += ch[i * winSamples + j] ** 2;
    energies.push(e / winSamples);
  }
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const peaks: number[] = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > mean * 1.4 && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
      peaks.push(i);
    }
  }
  if (peaks.length < 2) return 120;
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = 60 / (avg * 0.1);
  return Math.max(60, Math.min(220, Math.round(bpm)));
}

async function applyMastering(
  audioBuffer: AudioBuffer,
  targetLUFS: number,
  gainSlider: number, // 0-100 clarity adjustment
): Promise<AudioBuffer> {
  const currentLUFS = calculateLUFS(audioBuffer);
  const gainDb = targetLUFS - currentLUFS;
  const gainLinear = Math.pow(10, gainDb / 20) * (0.7 + gainSlider * 0.006);
  const peak = getPeak(audioBuffer);
  const maxGain = Math.pow(10, (-1 - peak) / 20); // True peak -1 dBTP
  const safeGain = Math.min(gainLinear, maxGain);

  const offline = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  const gain = offline.createGain();
  gain.gain.value = safeGain;
  src.connect(gain);
  gain.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

function encodeWAV(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const numSamples = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const blockAlign = numCh * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const ws = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); view.setUint32(4, 36 + dataSize, true);
  ws(8, "WAVE"); ws(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, bitsPerSample, true);
  ws(36, "data"); view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

// ── SMALL UI COMPONENTS ────────────────────────────────────────────────────
function Spin({ size = 16, color = P }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      border: `2px solid rgba(124,58,237,0.15)`,
      borderTop: `2px solid ${color}`,
      animation: "spin 0.8s linear infinite",
    }} />
  );
}

function SectionCard({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 20,
      border: "1px solid #EDE9FE",
      overflow: "hidden",
      boxShadow: "0 2px 8px rgba(124,58,237,0.06)",
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${P}, ${PINK})`,
        padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800, color: "white",
        }}>{num}</div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "white" }}>{title}</span>
      </div>
      <div style={{ padding: "24px" }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B21A8", letterSpacing: 1.2, marginBottom: 7 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  background: "#FAFAFA", border: "1.5px solid #EDE9FE",
  borderRadius: 10, fontSize: 13, color: "#1A1A2E",
  fontFamily: "inherit", outline: "none",
  transition: "border-color 0.15s",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer", appearance: "none",
};

function Slider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6B21A8" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: P }}>{value}%</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: P, height: 4 }}
      />
    </div>
  );
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function SunoMaker() {
  // ─ Project
  const [projectType,  setProjectType]  = useState<"single" | "album">("single");
  const [trackCount,   setTrackCount]   = useState(1);
  const [titleMode,    setTitleMode]    = useState<"custom" | "random">("custom");
  const [title,        setTitle]        = useState("");

  // ─ Song Content
  const [topic,        setTopic]        = useState("");
  const [hookLyrics,   setHookLyrics]   = useState("");
  const [structure,    setStructure]    = useState<string[]>(STRUCTURES);
  const [lyricDensity, setLyricDensity] = useState("중");
  const [hookStrength, setHookStrength] = useState("보통");
  const [rhymeStyle,   setRhymeStyle]   = useState("자연스러운 라임");
  const [avoidEl,      setAvoidEl]      = useState("");
  const [addRequest,   setAddRequest]   = useState("");

  // ─ Style
  const [genre1,       setGenre1]       = useState("K-Pop");
  const [genre2,       setGenre2]       = useState("");
  const [purpose,      setPurpose]      = useState("일반 릴리즈");
  const [mood,         setMood]         = useState("감성적인 / Emotional");
  const [intensity,    setIntensity]    = useState("랜덤");

  // ─ Technical
  const [bpmMode,      setBpmMode]      = useState<"random" | "custom">("random");
  const [bpm,          setBpm]          = useState("");
  const [duration,     setDuration]     = useState("3분");
  const [vocal,        setVocal]        = useState("있음");
  const [language,     setLanguage]     = useState("한국어");
  const [promptLang,   setPromptLang]   = useState("영어");

  // ─ Mastering
  const [platform,     setPlatform]     = useState("spotify");
  const [clarity,      setClarity]      = useState(70);
  const [bassWeight,   setBassWeight]   = useState(60);
  const [stereoWidth,  setStereoWidth]  = useState(65);
  const [silenceTrim,  setSilenceTrim]  = useState(true);
  const [volNorm,      setVolNorm]      = useState(false);

  // ─ Publishing
  const [artistName,   setArtistName]   = useState("");
  const [albumName,    setAlbumName]    = useState("");
  const [releaseDate,  setReleaseDate]  = useState("");
  const [copyright,    setCopyright]    = useState("");
  const [coverArt,     setCoverArt]     = useState<string | null>(null);
  const [genCover,     setGenCover]     = useState(false);

  // ─ Results
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [copiedIdx,        setCopiedIdx]        = useState<number | null>(null);

  // ─ Audio
  const [audioFile,     setAudioFile]     = useState<File | null>(null);
  const [audioBuffer,   setAudioBuffer]   = useState<AudioBuffer | null>(null);
  const [analysis,      setAnalysis]      = useState<{ bpm: number; lufs: number; peak: number; duration: number } | null>(null);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [mastering,     setMastering]     = useState(false);
  const [masterDone,    setMasterDone]    = useState(false);
  const [dragOver,      setDragOver]      = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterBlobRef = useRef<Blob | null>(null);

  // ─ Generate Suno Prompts
  const generate = async () => {
    setLoading(true);
    setGeneratedPrompts([]);
    setMasterDone(false);

    const count = projectType === "album" ? trackCount : 1;
    const prompts: string[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const res = await fetch("/api/suno-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectType, trackCount, trackIndex: i + 1,
            title: titleMode === "random" ? "" : title,
            topic, hookLyrics, songStructure: structure.join("-"),
            lyricDensity, hookStrength, rhymeStyle,
            avoidElements: avoidEl, additionalRequests: addRequest,
            genre1, genre2, purpose, mood, intensity,
            bpmMode, bpm, duration, vocal, language, promptLanguage: promptLang,
          }),
        });
        const data = await res.json();
        prompts.push(data.prompt || "생성 실패");
      } catch {
        prompts.push("생성 실패 — 다시 시도해주세요.");
      }
    }

    setGeneratedPrompts(prompts);
    setLoading(false);
  };

  const copyPrompt = (idx: number) => {
    navigator.clipboard.writeText(generatedPrompts[idx]);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  // ─ Audio Analysis
  const analyzeFile = useCallback(async (file: File) => {
    setAudioFile(file);
    setAnalyzing(true);
    setAnalysis(null);
    setMasterDone(false);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
      setAnalysis({
        bpm: detectBPM(decoded),
        lufs: calculateLUFS(decoded),
        peak: getPeak(decoded),
        duration: Math.round(decoded.duration),
      });
    } catch { /* silent */ }
    setAnalyzing(false);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("audio/") || file.name.match(/\.(mp3|wav|flac|aac|ogg)$/i))) {
      analyzeFile(file);
    }
  };

  // ─ Master & Export
  const handleMaster = async () => {
    if (!audioBuffer) return;
    setMastering(true);
    try {
      const plt = PLATFORMS.find(p => p.id === platform)!;
      const mastered = await applyMastering(audioBuffer, plt.lufs, clarity);
      const wav = encodeWAV(mastered);
      masterBlobRef.current = wav;
      setMasterDone(true);
    } catch { /* silent */ }
    setMastering(false);
  };

  const downloadMastered = () => {
    if (!masterBlobRef.current) return;
    const url = URL.createObjectURL(masterBlobRef.current);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mastered"}_mastered.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─ Cover Art
  const generateCover = async () => {
    setGenCover(true);
    try {
      const prompt = `Album cover art for a ${genre1} ${mood} music track titled "${title || "Untitled"}". ${topic}. Professional music album cover, high quality digital art, 1:1 square format.`;
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.imageUrl) setCoverArt(data.imageUrl);
    } catch { /* silent */ }
    setGenCover(false);
  };

  const targetLUFS = PLATFORMS.find(p => p.id === platform)?.lufs ?? -14;
  const currentPlatform = PLATFORMS.find(p => p.id === platform)!;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F8F5FF", fontFamily: "'Noto Sans KR', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        input[type=range]::-webkit-slider-thumb { width:16px; height:16px; border-radius:50%; background:${P}; cursor:pointer; -webkit-appearance:none; box-shadow:0 2px 6px rgba(124,58,237,0.4); }
        input[type=range]::-webkit-slider-runnable-track { height:4px; border-radius:2px; background:#EDE9FE; }
        select option { background: white; color: #1A1A2E; }
        input:focus, textarea:focus, select:focus { border-color: ${P} !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{
        background: `linear-gradient(135deg, ${P}, ${PINK})`,
        padding: "0 40px",
        height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{
            width: 32, height: 32, borderRadius: 9,
            background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, color: "white", textDecoration: "none",
            transition: "background 0.15s",
          }}>←</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🎵</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "white", letterSpacing: -0.3 }}>Suno Music Maker</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: 2 }}>PROMPT · MASTER · PUBLISH</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["①", "프롬프트"], ["②", "마스터링"], ["③", "퍼블리싱"]].map(([n, l]) => (
            <div key={n} style={{
              padding: "4px 12px",
              background: "rgba(255,255,255,0.15)",
              borderRadius: 20, fontSize: 11, fontWeight: 600, color: "white",
            }}>{n} {l}</div>
          ))}
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 28px 100px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── 01 PROJECT ── */}
        <div style={{ animation: "fadeUp 0.4s ease 0.05s both" }}>
          <SectionCard num="01" title="프로젝트 기본">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <Field label="생성 분류">
                <div style={{ display: "flex", gap: 8 }}>
                  {(["single", "album"] as const).map(t => (
                    <button key={t} onClick={() => setProjectType(t)} style={{
                      flex: 1, padding: "9px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                      background: projectType === t ? P : "#F3F0FF",
                      color: projectType === t ? "white" : "#6B21A8",
                      border: `1.5px solid ${projectType === t ? P : "#EDE9FE"}`,
                      cursor: "pointer",
                    }}>
                      {t === "single" ? "싱글" : "앨범"}
                    </button>
                  ))}
                </div>
              </Field>
              {projectType === "album" && (
                <Field label="곡 수 (1~30)">
                  <input
                    type="number" min={1} max={30} value={trackCount}
                    onChange={e => setTrackCount(Math.min(30, Math.max(1, Number(e.target.value))))}
                    style={inputStyle}
                  />
                </Field>
              )}
              <Field label="제목">
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {(["custom", "random"] as const).map(m => (
                    <button key={m} onClick={() => setTitleMode(m)} style={{
                      flex: 1, padding: "7px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: titleMode === m ? P : "#F3F0FF",
                      color: titleMode === m ? "white" : "#6B21A8",
                      border: `1.5px solid ${titleMode === m ? P : "#EDE9FE"}`,
                      cursor: "pointer",
                    }}>
                      {m === "custom" ? "직접입력" : "AI 랜덤"}
                    </button>
                  ))}
                </div>
                {titleMode === "custom" && (
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="곡 제목..." style={inputStyle} />
                )}
              </Field>
            </div>
          </SectionCard>
        </div>

        {/* ── 02 SONG CONTENT ── */}
        <div style={{ animation: "fadeUp 0.4s ease 0.1s both" }}>
          <SectionCard num="02" title="곡 구조 · 내용">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="곡 주제">
                <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={2}
                  placeholder="곡의 주제나 이야기 (비우면 AI가 자동 생성)..."
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="후킹 가사 (핵심 훅)">
                  <textarea value={hookLyrics} onChange={e => setHookLyrics(e.target.value)} rows={2}
                    placeholder="기억에 남을 핵심 가사 (비우면 AI 생성)..."
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                </Field>
                <Field label="피하고 싶은 요소">
                  <textarea value={avoidEl} onChange={e => setAvoidEl(e.target.value)} rows={2}
                    placeholder="예: 어두운 가사, 욕설, 특정 악기..."
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                </Field>
              </div>

              {/* Structure */}
              <Field label="곡 구성 (클릭으로 포함/제외)">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {STRUCTURES.map(s => {
                    const active = structure.includes(s);
                    return (
                      <button key={s} onClick={() => setStructure(prev =>
                        active ? prev.filter(x => x !== s) : [...prev, s]
                      )} style={{
                        padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: active ? P : "#F3F0FF",
                        color: active ? "white" : "#6B21A8",
                        border: `1.5px solid ${active ? P : "#EDE9FE"}`,
                        cursor: "pointer", transition: "all 0.15s",
                      }}>{s}</button>
                    );
                  })}
                </div>
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <Field label="가사 밀도">
                  <select value={lyricDensity} onChange={e => setLyricDensity(e.target.value)} style={selectStyle}>
                    {["저", "중", "고"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="훅 강조">
                  <select value={hookStrength} onChange={e => setHookStrength(e.target.value)} style={selectStyle}>
                    {["약함", "보통", "강함"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="라임 스타일">
                  <select value={rhymeStyle} onChange={e => setRhymeStyle(e.target.value)} style={selectStyle}>
                    {["자연스러운 라임", "강한 반복", "없음"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="추가 요청사항">
                <input value={addRequest} onChange={e => setAddRequest(e.target.value)}
                  placeholder="예: 2절은 영어로, 브릿지에서 조바꿈..."
                  style={inputStyle} />
              </Field>
            </div>
          </SectionCard>
        </div>

        {/* ── 03 STYLE ── */}
        <div style={{ animation: "fadeUp 0.4s ease 0.15s both" }}>
          <SectionCard num="03" title="음악 스타일">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
              <Field label="장르 1">
                <select value={genre1} onChange={e => setGenre1(e.target.value)} style={selectStyle}>
                  {GENRES.map(g => <option key={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="장르 2 (보조)">
                <select value={genre2} onChange={e => setGenre2(e.target.value)} style={selectStyle}>
                  <option value="">없음</option>
                  {GENRES.map(g => <option key={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="분위기">
                <select value={mood} onChange={e => setMood(e.target.value)} style={selectStyle}>
                  {MOODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="곡 강도">
                <select value={intensity} onChange={e => setIntensity(e.target.value)} style={selectStyle}>
                  {["랜덤", "약", "중", "강"].map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="곡의 용도">
                <select value={purpose} onChange={e => setPurpose(e.target.value)} style={selectStyle}>
                  {PURPOSES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>
        </div>

        {/* ── 04 TECHNICAL ── */}
        <div style={{ animation: "fadeUp 0.4s ease 0.2s both" }}>
          <SectionCard num="04" title="기술 파라미터">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 16 }}>
              <Field label="BPM">
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {(["random", "custom"] as const).map(m => (
                    <button key={m} onClick={() => setBpmMode(m)} style={{
                      flex: 1, padding: "6px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: bpmMode === m ? P : "#F3F0FF",
                      color: bpmMode === m ? "white" : "#6B21A8",
                      border: `1.5px solid ${bpmMode === m ? P : "#EDE9FE"}`,
                      cursor: "pointer",
                    }}>{m === "random" ? "랜덤" : "직접"}</button>
                  ))}
                </div>
                {bpmMode === "custom" && (
                  <input type="number" min={60} max={220} value={bpm}
                    onChange={e => setBpm(e.target.value)}
                    placeholder="60~220" style={inputStyle} />
                )}
              </Field>
              <Field label="곡 길이">
                <select value={duration} onChange={e => setDuration(e.target.value)} style={selectStyle}>
                  {["1분", "2분", "3분", "4분"].map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="보컬">
                <select value={vocal} onChange={e => setVocal(e.target.value)} style={selectStyle}>
                  {["있음", "없음 (인스트루멘탈)", "남성", "여성", "듀엣"].map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="언어">
                <select value={language} onChange={e => setLanguage(e.target.value)} style={selectStyle}>
                  {["한국어", "영어", "한영 혼합", "없음"].map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="프롬프트 언어">
                <select value={promptLang} onChange={e => setPromptLang(e.target.value)} style={selectStyle}>
                  {["영어", "한국어"].map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>
        </div>

        {/* ── GENERATE BUTTON ── */}
        <button onClick={generate} disabled={loading} style={{
          width: "100%", padding: "17px",
          background: loading ? "rgba(124,58,237,0.4)" : `linear-gradient(135deg, ${P}, ${PINK})`,
          border: "none", borderRadius: 16,
          fontSize: 16, fontWeight: 800, color: "white",
          cursor: loading ? "wait" : "pointer",
          boxShadow: loading ? "none" : "0 8px 24px rgba(124,58,237,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          transition: "all 0.3s", letterSpacing: 0.5,
          animation: "fadeUp 0.4s ease 0.25s both",
        }}>
          {loading ? (
            <><Spin size={18} /><span>AI가 {projectType === "album" ? `${trackCount}곡` : "프롬프트"} 생성 중...</span></>
          ) : (
            `🎵 Suno 프롬프트 생성 — ${projectType === "album" ? `앨범 ${trackCount}곡` : "싱글"}`
          )}
        </button>

        {/* ── GENERATED PROMPTS ── */}
        {generatedPrompts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp 0.4s ease" }}>
            {generatedPrompts.map((prompt, i) => (
              <div key={i} style={{
                background: "white", borderRadius: 20,
                border: "1px solid #EDE9FE",
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(124,58,237,0.06)",
              }}>
                <div style={{
                  background: "#F3F0FF", padding: "12px 20px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: "1px solid #EDE9FE",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: P }}>
                    🎵 {projectType === "album" ? `Track ${i + 1}` : title || "Suno Prompt"}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => copyPrompt(i)} style={{
                      padding: "6px 14px", borderRadius: 8,
                      background: copiedIdx === i ? "rgba(16,185,129,0.12)" : P,
                      border: "none", fontSize: 11, fontWeight: 700,
                      color: copiedIdx === i ? "#10B981" : "white",
                      cursor: "pointer",
                    }}>
                      {copiedIdx === i ? "✓ 복사됨" : "📋 복사"}
                    </button>
                    <a
                      href="https://suno.com" target="_blank" rel="noopener noreferrer"
                      onClick={() => navigator.clipboard.writeText(prompt)}
                      style={{
                        padding: "6px 14px", borderRadius: 8,
                        background: `linear-gradient(135deg, ${P}, ${PINK})`,
                        border: "none", fontSize: 11, fontWeight: 700,
                        color: "white", cursor: "pointer", textDecoration: "none",
                        display: "inline-flex", alignItems: "center",
                      }}
                    >
                      🌐 Suno 열기
                    </a>
                  </div>
                </div>
                <pre style={{
                  margin: 0, padding: "20px",
                  fontSize: 12, lineHeight: 1.8, color: "#374151",
                  fontFamily: "'Space Mono', monospace",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  maxHeight: 400, overflowY: "auto",
                  background: "white",
                }}>{prompt}</pre>
              </div>
            ))}

            {/* Pipeline indicator */}
            <div style={{
              background: "white", borderRadius: 14, padding: "14px 20px",
              border: "1px solid #EDE9FE",
              display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
            }}>
              <span style={{ fontSize: 10, color: "#9CA3AF", letterSpacing: 1.5, marginRight: 4 }}>PIPELINE</span>
              {["① 설정 완료 ✓", "② 프롬프트 생성 ✓", "③ Suno에서 생성 후 WAV 다운로드", "④ 아래에 Import → 마스터링", "⑤ 퍼블리싱 패키지"].map((s, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: "4px 11px", borderRadius: 20,
                  background: i < 2 ? "rgba(16,185,129,0.12)" : "rgba(124,58,237,0.07)",
                  color: i < 2 ? "#10B981" : P,
                  border: `1px solid ${i < 2 ? "rgba(16,185,129,0.25)" : "#EDE9FE"}`,
                  fontWeight: 600,
                }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── 05 AUDIO IMPORT ── */}
        <div style={{ animation: "fadeUp 0.4s ease 0.3s both" }}>
          <SectionCard num="05" title="오디오 Import · 분석">
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? P : "#C4B5FD"}`,
                borderRadius: 16, padding: "40px 24px",
                textAlign: "center", cursor: "pointer",
                background: dragOver ? "rgba(124,58,237,0.05)" : "#FAFBFF",
                transition: "all 0.2s",
                marginBottom: audioFile ? 20 : 0,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>
                {analyzing ? <Spin size={36} /> : "🎧"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: P, marginBottom: 6 }}>
                {analyzing ? "분석 중..." : audioFile ? audioFile.name : "WAV / MP3 / FLAC 드래그 또는 클릭"}
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                Suno에서 생성한 파일을 여기에 Import하세요
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: "none" }}
              onChange={e => { if (e.target.files?.[0]) analyzeFile(e.target.files[0]); }} />

            {/* Analysis Results */}
            {analysis && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
                animation: "fadeUp 0.35s ease",
              }}>
                {[
                  { label: "BPM", value: analysis.bpm, unit: "bpm", icon: "🥁" },
                  { label: "Integrated", value: analysis.lufs, unit: "LUFS", icon: "📊" },
                  { label: "True Peak", value: analysis.peak, unit: "dBTP", icon: "📈" },
                  { label: "Duration", value: `${Math.floor(analysis.duration/60)}:${String(analysis.duration%60).padStart(2,"0")}`, unit: "", icon: "⏱" },
                ].map(({ label, value, unit, icon }) => (
                  <div key={label} style={{
                    background: "#F3F0FF", borderRadius: 12, padding: "14px 16px",
                    border: "1px solid #EDE9FE", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: P, lineHeight: 1 }}>
                      {value}
                    </div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{unit || " "}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#6B21A8", letterSpacing: 1, marginTop: 4 }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── 06 MASTERING ── */}
        <div style={{ animation: "fadeUp 0.4s ease 0.35s both" }}>
          <SectionCard num="06" title="마스터링">
            {/* Platform selector */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6B21A8", letterSpacing: 1.2, marginBottom: 12 }}>
                타겟 플랫폼
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {PLATFORMS.map(plt => (
                  <button key={plt.id} onClick={() => setPlatform(plt.id)} style={{
                    padding: "10px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                    background: platform === plt.id ? plt.color : "#F3F0FF",
                    color: platform === plt.id ? "white" : "#6B21A8",
                    border: `1.5px solid ${platform === plt.id ? plt.color : "#EDE9FE"}`,
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                    {plt.label}
                    <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 6 }}>{plt.lufs} LUFS</span>
                  </button>
                ))}
              </div>
              <div style={{
                marginTop: 12, padding: "10px 16px", background: "#F3F0FF",
                borderRadius: 10, fontSize: 12, color: "#6B21A8",
              }}>
                타겟: <strong>{currentPlatform.label}</strong> 기준 <strong>{targetLUFS} LUFS</strong> · True Peak <strong>-1 dBTP</strong>
                {analysis && (
                  <span style={{ marginLeft: 12, color: analysis.lufs > targetLUFS ? "#EF4444" : "#10B981" }}>
                    현재 {analysis.lufs} LUFS → {targetLUFS > analysis.lufs ? "+" : ""}{Math.round((targetLUFS - analysis.lufs) * 10) / 10} dB 조정 필요
                  </span>
                )}
              </div>
            </div>

            {/* Sliders */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <Slider label="톤 선명도 / Clarity" value={clarity} onChange={setClarity} />
              <Slider label="저역 무게감 / Bass" value={bassWeight} onChange={setBassWeight} />
              <Slider label="스테레오 폭 / Width" value={stereoWidth} onChange={setStereoWidth} />
            </div>

            {/* Checkboxes */}
            <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
              {[
                { label: "앞뒤 무음 정리", val: silenceTrim, set: setSilenceTrim },
                { label: "앨범 단위 볼륨 통일", val: volNorm, set: setVolNorm },
              ].map(({ label, val, set }) => (
                <label key={label} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                    style={{ accentColor: P, width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                </label>
              ))}
            </div>

            {/* Master button */}
            <button onClick={handleMaster} disabled={!audioBuffer || mastering} style={{
              width: "100%", padding: "14px",
              background: !audioBuffer ? "rgba(124,58,237,0.3)" : mastering ? "rgba(124,58,237,0.5)" : `linear-gradient(135deg, ${P}, ${PINK})`,
              border: "none", borderRadius: 14,
              fontSize: 14, fontWeight: 800, color: "white",
              cursor: !audioBuffer || mastering ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: audioBuffer && !mastering ? "0 6px 20px rgba(124,58,237,0.3)" : "none",
            }}>
              {mastering ? (
                <><Spin size={16} color="white" /> 마스터링 처리 중...</>
              ) : (
                "⚡ 마스터링 적용 & WAV 내보내기"
              )}
            </button>

            {masterDone && (
              <button onClick={downloadMastered} style={{
                width: "100%", padding: "13px", marginTop: 10,
                background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
                borderRadius: 14, fontSize: 14, fontWeight: 700,
                color: "#10B981", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                ✓ 마스터링 완료 — WAV 다운로드
              </button>
            )}
          </SectionCard>
        </div>

        {/* ── 07 PUBLISHING ── */}
        <div style={{ animation: "fadeUp 0.4s ease 0.4s both" }}>
          <SectionCard num="07" title="퍼블리싱 패키지">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <Field label="아티스트명">
                <input value={artistName} onChange={e => setArtistName(e.target.value)}
                  placeholder="아티스트 이름" style={inputStyle} />
              </Field>
              <Field label="앨범명">
                <input value={albumName} onChange={e => setAlbumName(e.target.value)}
                  placeholder="앨범 또는 싱글 제목" style={inputStyle} />
              </Field>
              <Field label="릴리즈 날짜">
                <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)}
                  style={inputStyle} />
              </Field>
              <Field label="저작권자">
                <input value={copyright} onChange={e => setCopyright(e.target.value)}
                  placeholder="© 2025 Artist Name" style={inputStyle} />
              </Field>
            </div>

            {/* Cover Art */}
            <Field label="커버아트">
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{
                  width: 140, height: 140, borderRadius: 14,
                  border: "2px dashed #C4B5FD",
                  background: "#F3F0FF",
                  overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {coverArt ? (
                    <img src={coverArt} alt="cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : genCover ? (
                    <Spin size={28} />
                  ) : (
                    <span style={{ fontSize: 32 }}>🎨</span>
                  )}
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={generateCover} disabled={genCover} style={{
                    padding: "10px 16px",
                    background: genCover ? "rgba(124,58,237,0.3)" : `linear-gradient(135deg, ${P}, ${PINK})`,
                    border: "none", borderRadius: 10,
                    fontSize: 12, fontWeight: 700, color: "white",
                    cursor: genCover ? "wait" : "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    {genCover ? <><Spin size={12} color="white" /> 생성 중...</> : "✦ AI 커버아트 생성"}
                  </button>
                  <label style={{
                    padding: "10px 16px",
                    background: "#F3F0FF", border: "1.5px solid #EDE9FE",
                    borderRadius: 10, fontSize: 12, fontWeight: 700,
                    color: P, cursor: "pointer", textAlign: "center",
                  }}>
                    📁 이미지 업로드
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { const url = URL.createObjectURL(f); setCoverArt(url); }
                      }} />
                  </label>
                  <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>
                    권장: 3000×3000px, JPG/PNG<br />
                    DistroKid · TuneCore 기준
                  </div>
                </div>
              </div>
            </Field>

            {/* Distribution targets */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6B21A8", letterSpacing: 1.2, marginBottom: 10 }}>
                배포 플랫폼
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {["DistroKid", "TuneCore", "기타 배포사"].map(d => (
                  <div key={d} style={{
                    padding: "8px 16px", borderRadius: 10,
                    background: "#F3F0FF", border: "1.5px solid #EDE9FE",
                    fontSize: 12, fontWeight: 600, color: "#6B21A8",
                  }}>{d}</div>
                ))}
              </div>
            </div>

            {/* Download package */}
            <button
              onClick={() => {
                const meta = {
                  title: title || "Untitled",
                  artist: artistName, album: albumName,
                  releaseDate, copyright,
                  genre: genre1, mood, platform: currentPlatform.label,
                  targetLUFS,
                };
                const blob = new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `${title || "release"}_metadata.json`;
                a.click(); URL.revokeObjectURL(url);
              }}
              style={{
                width: "100%", padding: "13px", marginTop: 20,
                background: `linear-gradient(135deg, ${P}, ${PINK})`,
                border: "none", borderRadius: 14,
                fontSize: 14, fontWeight: 800, color: "white",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: "0 6px 20px rgba(124,58,237,0.3)",
              }}
            >
              📦 퍼블리싱 패키지 다운로드 (메타데이터 JSON)
            </button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
