"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  upsertDetail2Project,
  deleteDetail2Project,
  subscribeToDetail2Projects,
  type CloudDetail2Project,
} from "@/lib/firestoreHelpers";
import { uploadImageDataUrl } from "@/lib/firebaseStorage";

const SESSION_KEY = "detail2_session_v1";

const O = "#EA580C";
const O2 = "#F97316";
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com";

// 카테고리 표준 프리셋 (서버 키와 일치)
const CATEGORY_OPTS: { key: string; label: string; persona: "with" | "product" }[] = [
  { key: "auto",    label: "🪄 자동 판단",          persona: "with" },
  { key: "food",    label: "🥤 식품 · 건강식품",     persona: "with" },
  { key: "beauty",  label: "💄 뷰티 · 화장품",       persona: "with" },
  { key: "fashion", label: "👗 패션 · 의류 · 잡화",   persona: "with" },
  { key: "digital", label: "🔌 전자 · 가전 · 디지털", persona: "product" },
  { key: "living",  label: "🛋 리빙 · 생활 · 기타",   persona: "product" },
];

interface Strategy {
  target?: string; problem?: string; values?: string[];
  trigger?: string; tone?: string; color?: string;
}
interface Scene {
  section: string; sectionKo: string;
  width: number; height: number; size: string; hasModel: boolean;
  mainCopy: string; subCopy: string; points: string[]; trust: string; imagePrompt: string;
  image?: string; generating?: boolean; error?: boolean; errorMsg?: string; inCanvas?: boolean;
}

function Spin({ s = 16, c = "white" }: { s?: number; c?: string }) {
  return <span style={{ width: s, height: s, border: `2px solid ${c}40`, borderTopColor: c, borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />;
}

export default function DetailPage2() {
  const { user, loading: authLoading, signIn } = useAuth();
  const isAdmin = !!user && !!ADMIN_EMAIL && user.email === ADMIN_EMAIL;
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");

  // 입력
  const [brand, setBrand]       = useState("");
  const [features, setFeatures] = useState("");
  const [categoryKey, setCategoryKey] = useState("auto");
  const [modelMode, setModelMode]     = useState<"auto" | "with" | "without">("auto");
  const [extra, setExtra]       = useState("");
  // 모델 설정
  const [gender, setGender]     = useState("여성");
  const [age, setAge]           = useState("30");
  const [ageRange, setAgeRange] = useState("30대");
  const [mood, setMood]         = useState("따뜻하고 신뢰감 있는");
  const [situation, setSituation] = useState("");

  const [genLoading, setGenLoading] = useState(false);
  const [strategy, setStrategy]     = useState<Strategy | null>(null);
  const [scenes, setScenes]         = useState<Scene[]>([]);
  const [seqRunning, setSeqRunning] = useState(false);
  const [stitching, setStitching]   = useState(false);
  const [copiedIdx, setCopiedIdx]   = useState<number | null>(null);
  const [hydrated, setHydrated]     = useState(false);
  const [savedAt, setSavedAt]       = useState<number | null>(null);

  // ── 복원 (마운트 시 1회) ──
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (d) {
        setBrand(d.brand ?? ""); setFeatures(d.features ?? "");
        setCategoryKey(d.categoryKey ?? "auto"); setModelMode(d.modelMode ?? "auto");
        setExtra(d.extra ?? "");
        setGender(d.gender ?? "여성"); setAge(d.age ?? "30"); setAgeRange(d.ageRange ?? "30대");
        setMood(d.mood ?? "따뜻하고 신뢰감 있는"); setSituation(d.situation ?? "");
        setStrategy(d.strategy ?? null);
        if (Array.isArray(d.scenes)) setScenes(d.scenes);
        if (d.savedAt) setSavedAt(d.savedAt);
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // ── 자동 저장 (복원 후) ──
  useEffect(() => {
    if (!hydrated) return;
    const now = Date.now();
    const base = { brand, features, categoryKey, modelMode, extra, gender, age, ageRange, mood, situation, strategy, savedAt: now };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...base, scenes }));
    } catch {
      // 용량 초과 → 이미지(base64) 빼고 프롬프트만 저장
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...base, scenes: scenes.map(s => ({ ...s, image: undefined, inCanvas: false })) })); } catch { /* give up */ }
    }
    setSavedAt(now);
  }, [hydrated, brand, features, categoryKey, modelMode, extra, gender, age, ageRange, mood, situation, strategy, scenes]);

  const resetSession = () => {
    if (!window.confirm("현재 작업을 비우고 새 프로젝트를 시작할까요? (저장된 프로젝트는 그대로 보존돼요)")) return;
    setScenes([]); setStrategy(null); setProjectId("");
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  };

  // ── 클라우드 프로젝트 저장 ──
  const [projectId, setProjectId]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [cloudSaved, setCloudSaved] = useState(false);
  const [projects, setProjects]     = useState<CloudDetail2Project[]>([]);
  const [showProjects, setShowProjects] = useState(false);

  useEffect(() => {
    if (!user) { setProjects([]); return; }
    return subscribeToDetail2Projects(user.uid, setProjects);
  }, [user]);

  const saveProject = async () => {
    if (!user) return;
    if (!scenes.length) { alert("먼저 12장 프롬프트를 설계해주세요."); return; }
    setSaving(true); setCloudSaved(false);
    try {
      const pid = projectId || crypto.randomUUID();
      // base64 이미지는 스토리지로 업로드 → URL로 치환
      const outScenes = await Promise.all(scenes.map(async (s, idx) => {
        if (s.image && s.image.startsWith("data:")) {
          try {
            const { url } = await uploadImageDataUrl(user.uid, `detail2/${pid}`, `scene${idx}.png`, s.image);
            return { ...s, image: url };
          } catch { return { ...s, image: undefined, inCanvas: false }; }
        }
        return s;
      }));
      const cover = outScenes.find(s => s.image)?.image || null;
      const data = JSON.stringify({ brand, features, categoryKey, modelMode, extra, model: { gender, age, ageRange, mood, situation }, strategy, scenes: outScenes });
      await upsertDetail2Project(user.uid, {
        id: pid, title: brand.trim() || "제목 없음", coverUrl: cover ?? null,
        sceneCount: outScenes.length, generatedCount: outScenes.filter(s => s.image).length,
        data, createdAt: Date.now(),
      });
      setScenes(outScenes); // 업로드된 URL 반영(재저장 시 재업로드 방지)
      setProjectId(pid);
      setCloudSaved(true);
      setTimeout(() => setCloudSaved(false), 2500);
    } catch { alert("저장 실패 — 잠시 후 다시 시도해주세요."); }
    setSaving(false);
  };

  const loadProject = (p: CloudDetail2Project) => {
    try {
      const dd = JSON.parse(p.data);
      setBrand(dd.brand || ""); setFeatures(dd.features || "");
      setCategoryKey(dd.categoryKey || "auto"); setModelMode(dd.modelMode || "auto");
      setExtra(dd.extra || "");
      const mm = dd.model || {};
      setGender(mm.gender || "여성"); setAge(mm.age || "30"); setAgeRange(mm.ageRange || "30대");
      setMood(mm.mood || "따뜻하고 신뢰감 있는"); setSituation(mm.situation || "");
      setStrategy(dd.strategy || null);
      setScenes(Array.isArray(dd.scenes) ? dd.scenes.map((s: Scene) => ({ ...s, inCanvas: !!s.image })) : []);
      setProjectId(p.id);
      setShowProjects(false);
    } catch { alert("불러오기 실패"); }
  };

  const removeProject = (p: CloudDetail2Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (!window.confirm(`'${p.title}' 프로젝트를 삭제할까요?`)) return;
    deleteDetail2Project(user.uid, p.id).catch(() => {});
    if (projectId === p.id) setProjectId("");
  };

  const generateScenes = async () => {
    if (!brand.trim() && !features.trim()) return;
    setGenLoading(true); setStrategy(null); setScenes([]);
    try {
      const res = await fetch("/api/detail2", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, features, categoryKey, modelMode, extra, model: { gender, age, ageRange, mood, situation } }),
      });
      const data = await res.json();
      if (Array.isArray(data.scenes)) { setScenes(data.scenes); setStrategy(data.strategy || null); }
      else alert(data.error || "생성 실패");
    } catch { alert("생성 실패 — 다시 시도해주세요."); }
    setGenLoading(false);
  };

  const generateImage = async (i: number, scene: Scene) => {
    if (!scene.imagePrompt || scene.generating) return;
    setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, generating: true, error: false } : s));
    try {
      const res = await fetch("/api/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: scene.imagePrompt, size: scene.size, quality }),
      });
      const data = await res.json();
      if (data.imageUrl) setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, image: data.imageUrl, generating: false, error: false, errorMsg: undefined, inCanvas: true } : s));
      else setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, generating: false, error: true, errorMsg: String(data.error || "생성 실패") } : s));
    } catch (e) {
      setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, generating: false, error: true, errorMsg: "네트워크 오류: " + String(e) } : s));
    }
  };

  const generateAll = async () => {
    setSeqRunning(true);
    const snapshot = scenes;
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i].image) continue;
      await generateImage(i, snapshot[i]);
    }
    setSeqRunning(false);
  };

  const copy = (text: string, idx: number) => {
    navigator.clipboard?.writeText(text).then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(c => c === idx ? null : c), 1500); }).catch(() => {});
  };

  const toggleCanvas = (i: number) => setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, inCanvas: !s.inCanvas } : s));

  const stitchAndDownload = async () => {
    const imgs = scenes.filter(s => s.inCanvas && s.image);
    if (!imgs.length) return;
    setStitching(true);
    try {
      const loaded = await Promise.all(imgs.map(s => new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = s.image!;
      })));
      const W = 860;
      const heights = loaded.map(im => Math.round(im.naturalHeight * (W / im.naturalWidth)));
      const total = heights.reduce((a, b) => a + b, 0);
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = total;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, total);
      let y = 0;
      loaded.forEach((im, idx) => { ctx.drawImage(im, 0, y, W, heights[idx]); y += heights[idx]; });
      canvas.toBlob(blob => {
        if (!blob) { alert("이미지가 너무 커서 합치기에 실패했어요. 일부만 선택해 다시 시도해보세요."); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${brand || "detail"}_상세페이지.png`; a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch { alert("합치기 실패"); }
    setStitching(false);
  };

  // ── 로그인 게이트 ──
  if (!authLoading && !user) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Noto Sans KR',-apple-system,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;800&display=swap');* { box-sizing:border-box; margin:0; padding:0; }`}</style>
        <div style={{ background: "white", borderRadius: 24, padding: "44px 36px", maxWidth: 380, width: "100%", textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 46, marginBottom: 14 }}>🔒</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>로그인이 필요해요</div>
          <div style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, marginBottom: 26 }}>상세페이지 2는 로그인 후 이용할 수 있어요.</div>
          <button onClick={signIn} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${O},${O2})`, color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Google로 로그인</button>
          <Link href="/" style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>← 홈으로</Link>
        </div>
      </div>
    );
  }

  const catPersona = CATEGORY_OPTS.find(c => c.key === categoryKey)?.persona ?? "with";
  const peopleLikely = modelMode === "without" ? false : modelMode === "with" ? true : catPersona === "with";
  const inCanvasImgs = scenes.filter(s => s.inCanvas && s.image);
  const generatedCount = scenes.filter(s => s.image).length;
  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none" };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .d2-scroll { scrollbar-width:thin; scrollbar-color:#CBD5E1 transparent; }
        .d2-scroll::-webkit-scrollbar { width:8px; }
        .d2-scroll::-webkit-scrollbar-thumb { background:#CBD5E1; border-radius:100px; }
        textarea, input, select { font-family:inherit; }
      `}</style>

      {/* Nav */}
      <nav style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 24px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${O},${O2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "white", fontWeight: 800 }}>🧱</div>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>AI Studio</span>
          </Link>
          <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: O }}>🧱 상세페이지 2</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowProjects(true)} style={{ padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${O}`, background: "white", color: O, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📂 내 프로젝트{projects.length ? ` (${projects.length})` : ""}</button>
          <Link href="/detail" style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textDecoration: "none" }}>← 상세페이지 1</Link>
        </div>
      </nav>

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap", maxWidth: 1500, margin: "0 auto", padding: "20px 18px 60px" }}>

        {/* ── 좌측: 입력 ── */}
        <div style={{ flex: "1 1 300px", minWidth: 280, maxWidth: 360, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "white", borderRadius: 16, border: "1px solid #FEE4D3", padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>📥 상품 정보</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 14 }}>입력만 하면 12장 설득 구조로 설계돼요</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>브랜드명 / 상품명</label><input value={brand} onChange={e => setBrand(e.target.value)} placeholder="예: 인터뷰어 토마토즙" style={inputStyle} /></div>
              <div>
                <label style={labelStyle}>카테고리</label>
                <select value={categoryKey} onChange={e => { const k = e.target.value; setCategoryKey(k); }} style={inputStyle}>
                  {CATEGORY_OPTS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 5, lineHeight: 1.5 }}>카테고리에 맞춰 상세정보 항목·톤이 자동 조정돼요</div>
              </div>
              <div>
                <label style={labelStyle}>인물(모델) 포함</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {([["auto", "자동"], ["with", "포함"], ["without", "제외"]] as const).map(([k, lb]) => (
                    <button key={k} type="button" onClick={() => setModelMode(k)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1.5px solid ${modelMode === k ? O : "#E5E7EB"}`, fontSize: 12, fontWeight: 700, cursor: "pointer", background: modelMode === k ? "#FFF7ED" : "white", color: modelMode === k ? O : "#6B7280" }}>{lb}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 5, lineHeight: 1.5 }}>
                  {modelMode === "without" ? "사람 없이 제품 단독·클로즈업 중심으로 생성" : modelMode === "with" ? "모든 적합 장면에 모델 등장" : "카테고리 기본값(전자·생활용품은 제품 중심)"}
                </div>
              </div>
              <div><label style={labelStyle}>주요 특징 (줄바꿈으로 여러 개)</label><textarea value={features} onChange={e => setFeatures(e.target.value)} rows={6} placeholder={"예:\n국산 토마토 100%\nNFC 착즙\n무첨가\n스파우트 파우치"} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} /></div>
              <div><label style={labelStyle}>추가 요청 (선택)</label><input value={extra} onChange={e => setExtra(e.target.value)} placeholder="강조하고 싶은 포인트 등" style={inputStyle} /></div>
            </div>
          </div>

          <div style={{ background: "white", borderRadius: 16, border: "1px solid #E5E7EB", padding: 18, opacity: peopleLikely ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>👤 모델 설정</span>
              {!peopleLikely && <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", background: "#F3F4F6", padding: "2px 7px", borderRadius: 100 }}>인물 미포함 — 미적용</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>성별</label>
                  <select value={gender} onChange={e => setGender(e.target.value)} style={inputStyle}>
                    {["여성", "남성", "혼합/가족"].map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}><label style={labelStyle}>나이</label><input value={age} onChange={e => setAge(e.target.value)} placeholder="30" style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>연령대</label>
                <select value={ageRange} onChange={e => setAgeRange(e.target.value)} style={inputStyle}>
                  {["10대", "20대", "30대", "40대", "50대 이상", "전 연령"].map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>분위기 / 표정</label><input value={mood} onChange={e => setMood(e.target.value)} placeholder="예: 따뜻하고 신뢰감 있는" style={inputStyle} /></div>
              <div><label style={labelStyle}>사용 상황 (선택)</label><input value={situation} onChange={e => setSituation(e.target.value)} placeholder="예: 아침 식탁, 출근 전" style={inputStyle} /></div>
            </div>
          </div>

          {isAdmin && (
            <div style={{ background: "#FFF7ED", borderRadius: 16, border: "1px solid #FED7AA", padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#9A3412", marginBottom: 4 }}>🔧 어드민 — 이미지 품질</div>
              <div style={{ fontSize: 11, color: "#C2410C", marginBottom: 10 }}>gpt-image-2 생성 품질 (테스트용)</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["low", "medium", "high"] as const).map(qv => (
                  <button key={qv} onClick={() => setQuality(qv)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1.5px solid ${quality === qv ? O : "#FED7AA"}`, fontSize: 12, fontWeight: 700, cursor: "pointer", background: quality === qv ? O : "white", color: quality === qv ? "white" : "#9A3412" }}>
                    {qv === "low" ? "Low" : qv === "medium" ? "Mid" : "High"}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, lineHeight: 1.5 }}>Low=빠름·저렴 / High=느림·디테일↑</div>
            </div>
          )}

          <button onClick={generateScenes} disabled={genLoading || (!brand.trim() && !features.trim())}
            style={{ padding: "14px", borderRadius: 14, border: "none", fontSize: 14, fontWeight: 800, color: "white", cursor: (genLoading || (!brand.trim() && !features.trim())) ? "not-allowed" : "pointer", opacity: (genLoading || (!brand.trim() && !features.trim())) ? 0.5 : 1, background: `linear-gradient(135deg,${O},${O2})`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(234,88,12,0.3)" }}>
            {genLoading ? <><Spin /> 설계 중... (20~40초)</> : "🧱 12장 프롬프트 설계"}
          </button>

          {strategy && (
            <div style={{ background: "white", borderRadius: 16, border: "1px solid #E5E7EB", padding: 16, fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
              <div style={{ fontWeight: 800, color: "#0F172A", marginBottom: 8, fontSize: 13 }}>🎯 전략 분석</div>
              {strategy.target && <div><b>타겟</b> · {strategy.target}</div>}
              {strategy.problem && <div><b>핵심문제</b> · {strategy.problem}</div>}
              {strategy.trigger && <div><b>구매트리거</b> · {strategy.trigger}</div>}
              {strategy.tone && <div><b>톤</b> · {strategy.tone}</div>}
              {strategy.color && <div><b>컬러</b> · {strategy.color}</div>}
            </div>
          )}
        </div>

        {/* ── 중앙: 장면 프롬프트 ── */}
        <div style={{ flex: "2 1 460px", minWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>
          {scenes.length === 0 ? (
            <div style={{ background: "white", borderRadius: 16, border: "2px dashed #E5E7EB", padding: "60px 24px", textAlign: "center", color: "#9CA3AF" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧱</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>상품 정보를 입력하고 설계를 시작하세요</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Hook → 문제공감 → 해결 → 핵심가치5 → 신뢰 → 상세 → 체크 → CTA</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: "12px 16px", position: "sticky", top: 70, zIndex: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>🖼️ 장면 {scenes.length}장 · 생성 {generatedCount}/{scenes.length}</span>
                  {savedAt && <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>💾 자동 저장됨</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={resetSession} style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "white", fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>🗑 새로</button>
                  <button onClick={saveProject} disabled={saving} style={{ padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${cloudSaved ? "#10B981" : O}`, background: cloudSaved ? "#ECFDF5" : "white", fontSize: 13, fontWeight: 700, color: cloudSaved ? "#10B981" : O, cursor: saving ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    {saving ? <><Spin s={13} c={O} /> 저장 중...</> : cloudSaved ? "✓ 저장됨" : "💾 프로젝트 저장"}
                  </button>
                  <button onClick={generateAll} disabled={seqRunning} style={{ padding: "9px 16px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, color: "white", cursor: seqRunning ? "not-allowed" : "pointer", background: seqRunning ? "#9CA3AF" : `linear-gradient(135deg,${O},${O2})`, display: "flex", alignItems: "center", gap: 7 }}>
                    {seqRunning ? <><Spin s={14} /> 순차 생성 중...</> : "⚡ 전체 순차 생성"}
                  </button>
                </div>
              </div>

              {scenes.map((s, i) => (
                <div key={i} style={{ background: "white", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", animation: "fadeUp 0.3s ease both" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: `linear-gradient(135deg,${O},${O2})`, color: "white", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{s.sectionKo}</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{s.size}</span>
                    {s.hasModel && <span style={{ fontSize: 10, fontWeight: 700, color: O, background: "#FFF7ED", padding: "2px 7px", borderRadius: 100 }}>모델</span>}
                  </div>

                  <div style={{ display: "flex", gap: 14, padding: 16, flexWrap: "wrap" }}>
                    {/* 카피 + 프롬프트 */}
                    <div style={{ flex: "1 1 280px", minWidth: 240 }}>
                      {s.mainCopy && <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", lineHeight: 1.4, marginBottom: 4 }}>{s.mainCopy}</div>}
                      {s.subCopy && <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6, marginBottom: 8 }}>{s.subCopy}</div>}
                      {s.points?.length > 0 && (
                        <ul style={{ margin: "0 0 8px", paddingLeft: 16, fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
                          {s.points.map((p, k) => <li key={k}>{p}</li>)}
                        </ul>
                      )}
                      {s.trust && <div style={{ fontSize: 11, color: "#059669", background: "#F0FDF4", borderRadius: 8, padding: "5px 10px", display: "inline-block", fontWeight: 600 }}>✓ {s.trust}</div>}

                      <div style={{ marginTop: 10, background: "#FAFAFA", border: "1px solid #F3F4F6", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", letterSpacing: 0.5 }}>IMAGE 2 PROMPT</span>
                          <button onClick={() => copy(s.imagePrompt, i)} style={{ fontSize: 11, fontWeight: 700, color: O, background: "none", border: "none", cursor: "pointer" }}>{copiedIdx === i ? "✓ 복사됨" : "복사"}</button>
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.6, maxHeight: 84, overflow: "auto" }} className="d2-scroll">{s.imagePrompt}</div>
                      </div>

                      <button onClick={() => generateImage(i, s)} disabled={s.generating || !s.imagePrompt}
                        style={{ marginTop: 10, padding: "9px 16px", borderRadius: 9, border: `1.5px solid ${O}`, background: s.image ? "white" : `linear-gradient(135deg,${O},${O2})`, color: s.image ? O : "white", fontSize: 12, fontWeight: 700, cursor: s.generating ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        {s.generating ? <><Spin s={13} c={O} /> 생성 중...</> : s.image ? "🔄 다시 생성" : "🎨 이미지 생성"}
                      </button>
                      {s.error && <div style={{ marginTop: 8, fontSize: 11, color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "7px 10px", lineHeight: 1.5, wordBreak: "break-all", maxHeight: 90, overflow: "auto" }} className="d2-scroll">⚠️ {s.errorMsg || "생성 실패"}</div>}
                    </div>

                    {/* 이미지 미리보기 */}
                    {s.image && (
                      <div style={{ flex: "0 0 130px" }}>
                        <img src={s.image} alt="" style={{ width: 130, borderRadius: 10, border: "1px solid #E5E7EB", display: "block" }} />
                        <button onClick={() => toggleCanvas(i)} style={{ marginTop: 6, width: 130, padding: "5px", borderRadius: 7, border: "none", background: s.inCanvas ? "#FEE2E2" : "#FFF7ED", color: s.inCanvas ? "#DC2626" : O, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {s.inCanvas ? "− 캔버스에서 빼기" : "+ 캔버스 추가"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── 우측: 롱 캔버스 ── */}
        <div style={{ flex: "1 1 300px", minWidth: 280, maxWidth: 380, position: "sticky", top: 70 }}>
          <div style={{ background: "white", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>📜 롱 캔버스</div>
              <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>{inCanvasImgs.length}장</span>
            </div>
            <div className="d2-scroll" style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto", background: "#F3F4F6", padding: inCanvasImgs.length ? 10 : 0 }}>
              {inCanvasImgs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 20px", color: "#9CA3AF", fontSize: 12 }}>
                  이미지를 생성하면<br />여기에 순서대로 쌓여요
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
                  {inCanvasImgs.map((s, k) => <img key={k} src={s.image} alt="" style={{ width: "100%", display: "block" }} />)}
                </div>
              )}
            </div>
            <div style={{ padding: 14 }}>
              <button onClick={stitchAndDownload} disabled={stitching || inCanvasImgs.length === 0}
                style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800, color: "white", cursor: (stitching || inCanvasImgs.length === 0) ? "not-allowed" : "pointer", opacity: (stitching || inCanvasImgs.length === 0) ? 0.5 : 1, background: `linear-gradient(135deg,${O},${O2})`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {stitching ? <><Spin /> 합치는 중...</> : "⬇ 하나의 이미지로 합치기 (PNG)"}
              </button>
              <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>860px 폭으로 세로 결합해 다운로드돼요</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 내 프로젝트 모달 ── */}
      {showProjects && (
        <div onClick={() => setShowProjects(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 22, width: "100%", maxWidth: 760, maxHeight: "86vh", overflowY: "auto", padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }} className="d2-scroll">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>📂 내 프로젝트</div>
                <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 3 }}>저장한 상세페이지 프로젝트 {projects.length}개</div>
              </div>
              <button onClick={() => setShowProjects(false)} style={{ width: 36, height: 36, borderRadius: "50%", background: "#F3F4F6", border: "none", color: "#6B7280", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            {projects.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: "#9CA3AF" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>저장된 프로젝트가 없어요</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>설계 후 “💾 프로젝트 저장”을 누르면 여기에 모여요</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
                {projects.map(p => (
                  <div key={p.id} onClick={() => loadProject(p)} style={{ border: `1.5px solid ${projectId === p.id ? O : "#E5E7EB"}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", background: "white", position: "relative" }}>
                    <div style={{ width: "100%", aspectRatio: "3 / 2", background: "#F3F4F6", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.coverUrl ? <img src={p.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 30 }}>🧱</span>}
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>이미지 {p.generatedCount}/{p.sceneCount} · {new Date(p.updatedAt).toLocaleDateString("ko-KR")}</div>
                    </div>
                    <button onClick={e => removeProject(p, e)} style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 8, background: "rgba(0,0,0,0.55)", border: "none", color: "white", fontSize: 13, cursor: "pointer", backdropFilter: "blur(4px)" }} title="삭제">🗑</button>
                    {projectId === p.id && <div style={{ position: "absolute", top: 8, left: 8, padding: "2px 8px", borderRadius: 7, background: O, color: "white", fontSize: 10, fontWeight: 700 }}>열림</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
