"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const O = "#EA580C";
const O2 = "#F97316";
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com";

interface Strategy {
  target?: string; problem?: string; values?: string[];
  trigger?: string; tone?: string; color?: string;
}
interface Scene {
  section: string; sectionKo: string;
  width: number; height: number; size: string; hasModel: boolean;
  mainCopy: string; subCopy: string; points: string[]; trust: string; imagePrompt: string;
  image?: string; generating?: boolean; error?: boolean; inCanvas?: boolean;
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
  const [category, setCategory] = useState("");
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

  const generateScenes = async () => {
    if (!brand.trim() && !features.trim()) return;
    setGenLoading(true); setStrategy(null); setScenes([]);
    try {
      const res = await fetch("/api/detail2", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, features, category, extra, model: { gender, age, ageRange, mood, situation } }),
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
      if (data.imageUrl) setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, image: data.imageUrl, generating: false, inCanvas: true } : s));
      else setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, generating: false, error: true } : s));
    } catch {
      setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, generating: false, error: true } : s));
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
        <Link href="/detail" style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textDecoration: "none" }}>← 상세페이지 1</Link>
      </nav>

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap", maxWidth: 1500, margin: "0 auto", padding: "20px 18px 60px" }}>

        {/* ── 좌측: 입력 ── */}
        <div style={{ flex: "1 1 300px", minWidth: 280, maxWidth: 360, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "white", borderRadius: 16, border: "1px solid #FEE4D3", padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>📥 상품 정보</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 14 }}>입력만 하면 12장 설득 구조로 설계돼요</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>브랜드명 / 상품명</label><input value={brand} onChange={e => setBrand(e.target.value)} placeholder="예: 인터뷰어 토마토즙" style={inputStyle} /></div>
              <div><label style={labelStyle}>카테고리 (선택)</label><input value={category} onChange={e => setCategory(e.target.value)} placeholder="예: 건강식품 / 토마토즙" style={inputStyle} /></div>
              <div><label style={labelStyle}>주요 특징 (줄바꿈으로 여러 개)</label><textarea value={features} onChange={e => setFeatures(e.target.value)} rows={6} placeholder={"예:\n국산 토마토 100%\nNFC 착즙\n무첨가\n스파우트 파우치"} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} /></div>
              <div><label style={labelStyle}>추가 요청 (선택)</label><input value={extra} onChange={e => setExtra(e.target.value)} placeholder="강조하고 싶은 포인트 등" style={inputStyle} /></div>
            </div>
          </div>

          <div style={{ background: "white", borderRadius: 16, border: "1px solid #E5E7EB", padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 12 }}>👤 모델 설정</div>
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
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>🖼️ 장면 {scenes.length}장 · 생성 {generatedCount}/{scenes.length}</div>
                <button onClick={generateAll} disabled={seqRunning} style={{ padding: "9px 16px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, color: "white", cursor: seqRunning ? "not-allowed" : "pointer", background: seqRunning ? "#9CA3AF" : `linear-gradient(135deg,${O},${O2})`, display: "flex", alignItems: "center", gap: 7 }}>
                  {seqRunning ? <><Spin s={14} /> 순차 생성 중...</> : "⚡ 전체 순차 생성"}
                </button>
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
                      {s.error && <span style={{ marginLeft: 8, fontSize: 11, color: "#DC2626" }}>생성 실패</span>}
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
    </div>
  );
}
