"use client";
import { aiFetch } from "@/lib/aiClient";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const P = "#7C3AED";
const PINK = "#EC4899";
const RED = "#EF4444";

type Mode = "music" | "general";

const CONTENT_TYPES = [
  "브이로그", "튜토리얼 / 강의", "리뷰 / 언박싱", "게임",
  "먹방", "여행", "뷰티 / 패션", "운동 / 헬스",
  "요리", "뉴스 / 시사", "동기부여", "코미디 / 엔터",
];
const CHANNEL_VIBES = [
  "감성적인", "전문적인", "유머러스한", "미니멀한",
  "에너지 넘치는", "따뜻한", "세련된", "귀여운",
];
const MOODS = [
  "궁금증 유발", "공감 자극", "이상향 제시", "충격/놀라움",
  "따뜻함", "긴박감", "설렘", "공포/스릴",
];
const MUSIC_TARGETS = [
  "10-20대 여성", "20-30대 여성", "30-40대 여성",
  "10-20대 남성", "20-30대 남성", "30-40대 남성",
  "공부하는 학생", "직장인 (출퇴근)", "전체 연령",
];
const PLAYLIST_SERIES = [
  "없음", "공부음악 시리즈", "감성음악 시리즈",
  "새벽음악 시리즈", "카페음악 시리즈", "드라이브 시리즈",
  "힐링음악 시리즈", "운동음악 시리즈",
];

interface AnalysisResult {
  analysis: {
    genre?: string;
    content_type?: string;
    emotion?: string;
    hook?: string;
    visual_keywords: string[];
    season_time?: string;
    color_palette: string[];
    ctr_elements: string[];
    concept: string;
  };
  prompts: {
    midjourney: string;
    flux: string;
    ideogram: string;
    gpt_image: string;
  };
  text_overlay: {
    main: string;
    sub?: string;
  };
  branding_tip: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ padding:"5px 12px", background:copied?"#059669":"white", border:`1.5px solid ${copied?"#059669":"#D1D5DB"}`, borderRadius:8, fontSize:11, fontWeight:700, color:copied?"white":"#374151", cursor:"pointer", transition:"all 0.2s", whiteSpace:"nowrap", flexShrink:0 }}
    >
      {copied ? "✓ 복사됨" : "📋 복사"}
    </button>
  );
}

function PromptCard({ label, icon, color, prompt }: { label: string; icon: string; color: string; prompt: string }) {
  return (
    <div style={{ border:`1.5px solid ${color}30`, borderRadius:14, overflow:"hidden" }}>
      <div style={{ background:`${color}10`, padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${color}20` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>{icon}</span>
          <span style={{ fontSize:13, fontWeight:700, color }}>{label}</span>
        </div>
        <CopyButton text={prompt} />
      </div>
      <div style={{ padding:"14px 16px", background:"white" }}>
        <p style={{ fontSize:12, color:"#374151", lineHeight:1.7, whiteSpace:"pre-wrap", fontFamily:"'Courier New', monospace" }}>{prompt}</p>
      </div>
    </div>
  );
}

function Tag({ label, color }: { label: string; color?: string }) {
  return (
    <span style={{ display:"inline-block", padding:"3px 10px", background:`${color ?? P}14`, border:`1px solid ${color ?? P}30`, borderRadius:100, fontSize:11, fontWeight:600, color: color ?? P }}>
      {label}
    </span>
  );
}

export default function ThumbnailMaker() {
  const { user, signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("music");

  // Music mode state
  const [musicTitle, setMusicTitle]     = useState("");
  const [stylePrompt, setStylePrompt]   = useState("");
  const [lyrics, setLyrics]             = useState("");
  const [musicTarget, setMusicTarget]   = useState(MUSIC_TARGETS[1]);
  const [playlist, setPlaylist]         = useState(PLAYLIST_SERIES[0]);
  const [mainColor, setMainColor]       = useState("");

  // General mode state
  const [genTitle, setGenTitle]         = useState("");
  const [description, setDescription]   = useState("");
  const [contentType, setContentType]   = useState("");
  const [genTarget, setGenTarget]       = useState("");
  const [channelVibe, setChannelVibe]   = useState("");
  const [mood, setMood]                 = useState("");

  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<AnalysisResult | null>(null);
  const [error, setError]       = useState("");

  const canSubmit = mode === "music"
    ? musicTitle.trim() && stylePrompt.trim() && lyrics.trim()
    : genTitle.trim() && description.trim();

  const handleGenerate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const body = mode === "music"
        ? { mode, title: musicTitle, stylePrompt, lyrics, target: musicTarget, playlist, mainColor }
        : { mode, title: genTitle, description, contentType, target: genTarget, channelVibe, mood };

      const res = await aiFetch("/api/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("API error");
      const data: AnalysisResult = await res.json();
      setResult(data);
    } catch {
      setError("생성 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F0F2F8", fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        textarea:focus, input:focus, select:focus { outline:none; border-color:${P}!important; box-shadow:0 0 0 3px rgba(124,58,237,0.1); }
        .chip-btn { transition:all 0.15s; cursor:pointer; }
        .chip-btn:hover { border-color:${P}!important; color:${P}!important; }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 32px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none" }}>
            <div style={{ width:34, height:34, borderRadius:10, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:"white", fontWeight:800 }}>✦</div>
            <span style={{ fontSize:13, color:"#6B7280", fontWeight:600 }}>← AI Studio</span>
          </Link>
          <div style={{ width:1, height:16, background:"#E5E7EB" }} />
          <span style={{ fontSize:14, fontWeight:800, color:"#111827" }}>🖼️ 유튜브 썸네일 메이커</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {user ? (
            <>
              <img src={user.photoURL ?? ""} alt="" style={{ width:30, height:30, borderRadius:"50%", objectFit:"cover" }} />
              <span style={{ fontSize:13, color:"#374151", fontWeight:600 }}>{user.displayName}</span>
            </>
          ) : (
            <button onClick={signIn} style={{ padding:"7px 16px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:9, fontSize:12, fontWeight:700, color:"white", cursor:"pointer" }}>로그인</button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"40px 24px 80px", animation:"fadeUp 0.4s ease both" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 14px", background:"rgba(124,58,237,0.07)", border:"1px solid rgba(124,58,237,0.15)", borderRadius:100, fontSize:11, fontWeight:700, color:P, letterSpacing:1.5, marginBottom:16 }}>
            🖼️ CTR 최적화 썸네일 AI
          </div>
          <h1 style={{ fontSize:28, fontWeight:800, color:"#0F172A", letterSpacing:-0.5, marginBottom:10, lineHeight:1.3 }}>
            클릭하게 만드는<br />
            <span style={{ background:`linear-gradient(135deg,${P},${PINK})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>AI 썸네일 프롬프트</span>
          </h1>
          <p style={{ fontSize:13, color:"#6B7280", lineHeight:1.7 }}>
            단순히 예쁜 이미지가 아니라 — 유튜브에서 실제로 클릭되는 썸네일을 만들어드립니다
          </p>
        </div>

        {/* Mode selector */}
        <div style={{ display:"flex", gap:10, marginBottom:28, background:"white", padding:6, borderRadius:16, boxShadow:"0 1px 6px rgba(0,0,0,0.07)" }}>
          {([["music","🎵 음악 전용","수노 스타일 프롬프트 + 가사 분석"], ["general","📺 범용","영상 주제 기반 CTR 썸네일"]] as [Mode,string,string][]).map(([m, label, desc]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setResult(null); setError(""); }}
              style={{ flex:1, padding:"14px 20px", borderRadius:12, border:"none", background: mode===m ? `linear-gradient(135deg,${P},${PINK})` : "transparent", color: mode===m ? "white" : "#6B7280", cursor:"pointer", transition:"all 0.2s", textAlign:"left" }}
            >
              <div style={{ fontSize:14, fontWeight:800, marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:11, opacity:0.8 }}>{desc}</div>
            </button>
          ))}
        </div>

        {/* Input panel */}
        <div style={{ background:"white", borderRadius:20, padding:"28px 28px", boxShadow:"0 2px 12px rgba(0,0,0,0.07)", marginBottom:24 }}>

          {mode === "music" ? (
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:20 }}>🎵</span>
                <span style={{ fontSize:16, fontWeight:800, color:"#111827" }}>음악 정보 입력</span>
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>음악 제목 *</label>
                <input
                  value={musicTitle}
                  onChange={e => setMusicTitle(e.target.value)}
                  placeholder="예: 새벽 세 시, 너를 생각하다"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit" }}
                />
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>수노 스타일 프롬프트 *</label>
                <textarea
                  value={stylePrompt}
                  onChange={e => setStylePrompt(e.target.value)}
                  placeholder="예: emotional korean ballad, piano, melancholic, rainy night, slow tempo, female vocal, cinematic strings..."
                  rows={3}
                  style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", resize:"vertical" }}
                />
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>가사 *</label>
                <textarea
                  value={lyrics}
                  onChange={e => setLyrics(e.target.value)}
                  placeholder="가사를 붙여넣으세요..."
                  rows={6}
                  style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", resize:"vertical" }}
                />
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>타겟 청취자</label>
                  <select value={musicTarget} onChange={e => setMusicTarget(e.target.value)} style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", background:"white", cursor:"pointer" }}>
                    {MUSIC_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>플레이리스트 시리즈</label>
                  <select value={playlist} onChange={e => setPlaylist(e.target.value)} style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", background:"white", cursor:"pointer" }}>
                    {PLAYLIST_SERIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>채널 메인 컬러 <span style={{ fontWeight:400, color:"#9CA3AF" }}>(선택 — 브랜딩 일관성)</span></label>
                <input
                  value={mainColor}
                  onChange={e => setMainColor(e.target.value)}
                  placeholder="예: 딥퍼플, 네이비, 크림, #1a1a2e ..."
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit" }}
                />
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:20 }}>📺</span>
                <span style={{ fontSize:16, fontWeight:800, color:"#111827" }}>영상 정보 입력</span>
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>영상 제목 *</label>
                <input
                  value={genTitle}
                  onChange={e => setGenTitle(e.target.value)}
                  placeholder="예: 월 200만원 버는 프리랜서의 하루 루틴"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit" }}
                />
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>영상 내용 / 핵심 메시지 *</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="영상에서 다루는 내용, 핵심 포인트, 시청자에게 주고 싶은 감정이나 메시지를 입력하세요."
                  rows={4}
                  style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", resize:"vertical" }}
                />
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>콘텐츠 유형</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {CONTENT_TYPES.map(t => (
                    <button key={t} onClick={() => setContentType(contentType===t?"":t)} className="chip-btn"
                      style={{ padding:"5px 12px", borderRadius:100, border:`1.5px solid ${contentType===t?P:"#E5E7EB"}`, background:contentType===t?`rgba(124,58,237,0.07)`:"white", fontSize:12, fontWeight:600, color:contentType===t?P:"#6B7280" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>타겟 시청자</label>
                  <input
                    value={genTarget}
                    onChange={e => setGenTarget(e.target.value)}
                    placeholder="예: 20대 취준생, 육아맘, 사무직..."
                    style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>채널 분위기</label>
                  <select value={channelVibe} onChange={e => setChannelVibe(e.target.value)} style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", background:"white", cursor:"pointer" }}>
                    <option value="">자동 선택</option>
                    {CHANNEL_VIBES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>클릭 유도 전략</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {MOODS.map(m => (
                    <button key={m} onClick={() => setMood(mood===m?"":m)} className="chip-btn"
                      style={{ padding:"5px 12px", borderRadius:100, border:`1.5px solid ${mood===m?PINK:"#E5E7EB"}`, background:mood===m?`rgba(236,72,153,0.07)`:"white", fontSize:12, fontWeight:600, color:mood===m?PINK:"#6B7280" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Generate button */}
          <div style={{ marginTop:24 }}>
            <button
              onClick={handleGenerate}
              disabled={loading || !canSubmit}
              style={{ width:"100%", padding:"15px", background:canSubmit?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:14, fontSize:15, fontWeight:800, color:canSubmit?"white":"#9CA3AF", cursor:canSubmit?"pointer":"default", boxShadow:canSubmit?`0 4px 20px rgba(124,58,237,0.35)`:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:10, transition:"all 0.2s" }}
            >
              {loading ? (
                <>
                  <div style={{ width:18, height:18, border:"2.5px solid rgba(255,255,255,0.3)", borderTopColor:"white", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                  분석 중... CTR 최적화 프롬프트 생성 중
                </>
              ) : (
                "🖼️ 썸네일 프롬프트 생성"
              )}
            </button>
            {!canSubmit && <p style={{ textAlign:"center", fontSize:11, color:"#9CA3AF", marginTop:8 }}>
              {mode === "music" ? "제목, 스타일 프롬프트, 가사를 모두 입력하세요" : "제목과 영상 내용을 입력하세요"}
            </p>}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:"#FEF2F2", border:"1.5px solid #FECACA", borderRadius:12, padding:"14px 18px", marginBottom:20, fontSize:13, color:RED }}>
            ⚠️ {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ display:"flex", flexDirection:"column", gap:18, animation:"fadeUp 0.4s ease both" }}>

            {/* Analysis */}
            <div style={{ background:"white", borderRadius:20, padding:"24px 28px", boxShadow:"0 2px 12px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#111827", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                <span>🔍</span> 감성 분석 결과
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:18 }}>
                {result.analysis.genre && (
                  <div style={{ background:"#F8F9FF", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:6, letterSpacing:0.5 }}>GENRE</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{result.analysis.genre}</div>
                  </div>
                )}
                {result.analysis.content_type && (
                  <div style={{ background:"#F8F9FF", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:6, letterSpacing:0.5 }}>CONTENT TYPE</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{result.analysis.content_type}</div>
                  </div>
                )}
                <div style={{ background:"#F8F9FF", borderRadius:12, padding:"14px 16px" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:6, letterSpacing:0.5 }}>EMOTION</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{result.analysis.emotion}</div>
                </div>
                {result.analysis.season_time && (
                  <div style={{ background:"#F8F9FF", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:6, letterSpacing:0.5 }}>TIME / SEASON</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{result.analysis.season_time}</div>
                  </div>
                )}
                {result.analysis.hook && (
                  <div style={{ background:"rgba(236,72,153,0.05)", borderRadius:12, padding:"14px 16px", gridColumn:"span 2", border:"1px solid rgba(236,72,153,0.15)" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:PINK, marginBottom:6, letterSpacing:0.5 }}>CLICK HOOK</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{result.analysis.hook}</div>
                  </div>
                )}
              </div>

              {/* Concept */}
              <div style={{ background:`linear-gradient(135deg,rgba(124,58,237,0.07),rgba(236,72,153,0.05))`, borderRadius:12, padding:"14px 18px", marginBottom:14, border:`1px solid rgba(124,58,237,0.12)` }}>
                <div style={{ fontSize:11, fontWeight:700, color:P, marginBottom:5, letterSpacing:0.5 }}>🎯 썸네일 콘셉트</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{result.analysis.concept}</div>
              </div>

              {/* Keywords */}
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:7, letterSpacing:0.5 }}>시각 키워드</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {result.analysis.visual_keywords.map((k, i) => <Tag key={i} label={k} color={P} />)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:7, letterSpacing:0.5 }}>색상 팔레트</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {result.analysis.color_palette.map((c, i) => <Tag key={i} label={c} color="#374151" />)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:7, letterSpacing:0.5 }}>CTR 강화 요소</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {result.analysis.ctr_elements.map((c, i) => <Tag key={i} label={c} color={RED} />)}
                  </div>
                </div>
              </div>
            </div>

            {/* Text Overlay */}
            <div style={{ background:"white", borderRadius:20, padding:"24px 28px", boxShadow:"0 2px 12px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#111827", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                <span>✍️</span> 썸네일 텍스트 오버레이
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ background:"#0F172A", borderRadius:12, padding:"18px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", marginBottom:5 }}>MAIN TEXT</div>
                    <div style={{ fontSize:22, fontWeight:800, color:"white", letterSpacing:-0.5 }}>{result.text_overlay.main}</div>
                  </div>
                  <CopyButton text={result.text_overlay.main} />
                </div>
                {result.text_overlay.sub && (
                  <div style={{ background:"#F8F9FF", borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:5 }}>SUB TEXT</div>
                      <div style={{ fontSize:15, fontWeight:600, color:"#374151" }}>{result.text_overlay.sub}</div>
                    </div>
                    <CopyButton text={result.text_overlay.sub} />
                  </div>
                )}
              </div>
            </div>

            {/* Image generation prompts */}
            <div style={{ background:"white", borderRadius:20, padding:"24px 28px", boxShadow:"0 2px 12px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#111827", marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
                <span>🤖</span> AI 이미지 생성 프롬프트
              </div>
              <p style={{ fontSize:12, color:"#6B7280", marginBottom:18 }}>아래 프롬프트를 각 AI 도구에 붙여넣어 바로 사용하세요</p>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <PromptCard label="Midjourney" icon="🎨" color="#5865F2" prompt={result.prompts.midjourney} />
                <PromptCard label="Flux / Stable Diffusion" icon="⚡" color="#F59E0B" prompt={result.prompts.flux} />
                <PromptCard label="Ideogram" icon="🔤" color="#10B981" prompt={result.prompts.ideogram} />
                <PromptCard label="GPT Image / DALL·E" icon="✨" color="#374151" prompt={result.prompts.gpt_image} />
              </div>
            </div>

            {/* Branding tip */}
            <div style={{ background:`linear-gradient(135deg,rgba(124,58,237,0.05),rgba(236,72,153,0.04))`, border:"1.5px solid rgba(124,58,237,0.15)", borderRadius:16, padding:"18px 22px" }}>
              <div style={{ fontSize:13, fontWeight:800, color:P, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                💡 채널 브랜딩 팁
              </div>
              <p style={{ fontSize:13, color:"#374151", lineHeight:1.7 }}>{result.branding_tip}</p>
            </div>

            {/* Regenerate */}
            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{ padding:"13px", background:"white", border:`1.5px solid ${P}`, borderRadius:14, fontSize:13, fontWeight:700, color:P, cursor:"pointer" }}
            >
              🔄 다시 생성하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
