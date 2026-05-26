"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StyleDNA {
  primaryColors: string[];
  secondaryColors: string[];
  lighting: string;
  background: string;
  composition: string;
  mood: string;
  aesthetic: string;
  overallTone: string;
  promptBase: string;
}

interface Section {
  id: string;
  type: SectionType;
  label: string;
  icon: string;
  research: Record<string, unknown> | null;
  copy: Record<string, unknown> | null;
  imagePrompt: string;
  imageUrl: string;
  locked: boolean;
  researchLoading: boolean;
  copyLoading: boolean;
  promptLoading: boolean;
  imageLoading: boolean;
}

type SectionType =
  | "hook" | "usp" | "problemSolution" | "specs"
  | "lifestyle" | "options" | "reviews" | "faq" | "cta";

type Tone = "premium" | "friendly" | "urgent" | "informative" | "emotional" | "playful";
type Platform = "smartstore" | "coupang" | "wadiz" | "shopify" | "cafe24" | "instagram";

interface ProductInfo {
  name: string;
  category: string;
  price: string;
  targetAudience: string;
  keyFeatures: string;
  brandVoice: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_TEMPLATES: { type: SectionType; label: string; icon: string }[] = [
  { type: "hook", label: "훅 (Hook)", icon: "⚡" },
  { type: "usp", label: "핵심 차별점 (USP)", icon: "✨" },
  { type: "problemSolution", label: "문제해결", icon: "💡" },
  { type: "specs", label: "제품 사양", icon: "📊" },
  { type: "lifestyle", label: "라이프스타일", icon: "🌟" },
  { type: "options", label: "옵션 & 혜택", icon: "🎁" },
  { type: "reviews", label: "고객 후기", icon: "💬" },
  { type: "faq", label: "FAQ", icon: "❓" },
  { type: "cta", label: "구매하기 (CTA)", icon: "🛒" },
];

const TONES: { value: Tone; label: string; desc: string }[] = [
  { value: "premium", label: "프리미엄", desc: "고급스럽고 권위있는" },
  { value: "friendly", label: "친근한", desc: "따뜻하고 대화체" },
  { value: "urgent", label: "긴박감", desc: "FOMO·한정성 강조" },
  { value: "informative", label: "정보형", desc: "데이터·사실 중심" },
  { value: "emotional", label: "감성적", desc: "스토리텔링·공감" },
  { value: "playful", label: "유쾌한", desc: "위트·트렌디" },
];

const PLATFORMS: { value: Platform; label: string; icon: string }[] = [
  { value: "smartstore", label: "스마트스토어", icon: "🟢" },
  { value: "coupang", label: "쿠팡", icon: "🟡" },
  { value: "wadiz", label: "와디즈", icon: "🟠" },
  { value: "shopify", label: "Shopify", icon: "🟣" },
  { value: "cafe24", label: "카페24", icon: "🔵" },
  { value: "instagram", label: "인스타그램", icon: "🌸" },
];

const STEP_LABELS = ["제품 정보", "스타일 DNA", "섹션 편집", "내보내기"];

// ─── API helpers ──────────────────────────────────────────────────────────────

async function callApi(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`${path} ${res.status}: ${errBody.error || JSON.stringify(errBody)}`);
  }
  return res.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DetailPageMaker() {
  const [step, setStep] = useState(0);

  // Step 0 — Product Info
  const [productInfo, setProductInfo] = useState<ProductInfo>({
    name: "", category: "", price: "", targetAudience: "", keyFeatures: "", brandVoice: "",
  });
  const [tone, setTone] = useState<Tone>("friendly");
  const [platform, setPlatform] = useState<Platform>("smartstore");

  // Step 1 — Style DNA
  const [refImages, setRefImages] = useState<string[]>([]);
  const [styleDNA, setStyleDNA] = useState<StyleDNA | null>(null);
  const [dnaLoading, setDnaLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2 — Sections
  const [sections, setSections] = useState<Section[]>(() =>
    SECTION_TEMPLATES.map((t, i) => ({
      id: `sec-${i}`,
      ...t,
      research: null,
      copy: null,
      imagePrompt: "",
      imageUrl: "",
      locked: false,
      researchLoading: false,
      copyLoading: false,
      promptLoading: false,
      imageLoading: false,
    }))
  );
  const [activeSection, setActiveSection] = useState<string | null>("sec-0");

  // ── Step 1: Upload ref images ──────────────────────────────────────────────

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        setRefImages(prev => prev.length < 5 ? [...prev, dataUrl] : prev);
      };
      reader.readAsDataURL(file);
    });
  };

  const extractDNA = async () => {
    if (!refImages.length) return;
    setDnaLoading(true);
    try {
      const { dna } = await callApi("/api/style-dna", { images: refImages });
      setStyleDNA(dna);
    } catch (e) {
      alert("Style DNA 추출 실패: " + String(e));
    } finally {
      setDnaLoading(false);
    }
  };

  // ── Section helpers ────────────────────────────────────────────────────────

  const updateSection = useCallback((id: string, patch: Partial<Section>) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const getLockedPrompts = useCallback((beforeId: string) => {
    const idx = sections.findIndex(s => s.id === beforeId);
    return sections
      .slice(0, idx)
      .filter(s => s.locked && s.imagePrompt)
      .map(s => `[${s.label}] ${s.imagePrompt}`);
  }, [sections]);

  const doResearch = async (sec: Section) => {
    updateSection(sec.id, { researchLoading: true });
    try {
      const { research } = await callApi("/api/research", {
        sectionType: sec.type,
        productInfo,
      });
      updateSection(sec.id, { research, researchLoading: false });
    } catch (e) {
      updateSection(sec.id, { researchLoading: false });
      alert("리서치 실패: " + String(e));
    }
  };

  const doCopy = async (sec: Section) => {
    updateSection(sec.id, { copyLoading: true });
    try {
      const { copy } = await callApi("/api/copy-gen", {
        sectionType: sec.type,
        tone,
        productInfo,
        research: sec.research,
        platform,
      });
      updateSection(sec.id, { copy, copyLoading: false });
    } catch (e) {
      updateSection(sec.id, { copyLoading: false });
      alert("카피 생성 실패: " + String(e));
    }
  };

  const doPrompt = async (sec: Section) => {
    updateSection(sec.id, { promptLoading: true });
    try {
      const { prompt } = await callApi("/api/img-prompt", {
        sectionType: sec.type,
        productInfo,
        styleDNA,
        lockedSectionPrompts: getLockedPrompts(sec.id),
        copy: sec.copy,
      });
      updateSection(sec.id, { imagePrompt: prompt, promptLoading: false });
    } catch (e) {
      updateSection(sec.id, { promptLoading: false });
      alert("프롬프트 생성 실패: " + String(e));
    }
  };

  const doImage = async (sec: Section) => {
    if (!sec.imagePrompt) return;
    updateSection(sec.id, { imageLoading: true });
    try {
      const fullPrompt = styleDNA
        ? `${sec.imagePrompt} Style: ${styleDNA.promptBase}`
        : sec.imagePrompt;
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        updateSection(sec.id, { imageLoading: false });
        alert("이미지 생성 실패: " + (data.error || `HTTP ${res.status}`));
        return;
      }
      updateSection(sec.id, { imageUrl: data.imageUrl, imageLoading: false });
    } catch (e) {
      updateSection(sec.id, { imageLoading: false });
      alert("이미지 생성 실패: " + String(e));
    }
  };

  const handleSectionImageUpload = (sec: Section, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      updateSection(sec.id, { imageUrl: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const toggleLock = (sec: Section) => {
    updateSection(sec.id, { locked: !sec.locked });
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportJSON = () => {
    const data = {
      productInfo,
      tone,
      platform,
      styleDNA,
      sections: sections.map(s => ({
        type: s.type,
        label: s.label,
        copy: s.copy,
        imagePrompt: s.imagePrompt,
        imageUrl: s.imageUrl ? "[image data]" : "",
        locked: s.locked,
      })),
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `detail-page-${productInfo.name || "product"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const activeSec = sections.find(s => s.id === activeSection);

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FF", fontFamily: "'Noto Sans KR', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0;transform:translateY(16px) } to { opacity:1;transform:translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .btn { cursor:pointer; border:none; border-radius:10px; font-weight:700; transition:opacity 0.15s; }
        .btn:hover { opacity:0.85; }
        .btn:disabled { opacity:0.4; cursor:not-allowed; }
        textarea { resize:vertical; }
      `}</style>

      {/* Top Nav */}
      <nav style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 32px", height: 44, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 101,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        {/* 로고 + 홈 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{
            display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "white",
            }}>✦</div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>AI Studio</span>
          </a>
          <div style={{ width: 1, height: 16, background: "#E5E7EB" }} />
          {/* Tool Links */}
          {[
            { href: "/storyboard", icon: "🎬", label: "Storyboard" },
            { href: "/suno", icon: "🎵", label: "Suno Maker" },
            { href: "/detail", icon: "🛍️", label: "Detail Page" },
          ].map(tool => (
            <a key={tool.href} href={tool.href} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 8, textDecoration: "none",
              background: tool.href === "/detail" ? "#EFF6FF" : "transparent",
              border: tool.href === "/detail" ? "1px solid #BFDBFE" : "1px solid transparent",
              fontSize: 12, fontWeight: 600,
              color: tool.href === "/detail" ? "#2563EB" : "#6B7280",
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 13 }}>{tool.icon}</span>
              {tool.label}
            </a>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>
          Powered by <span style={{ color: "#2563EB", fontWeight: 700 }}>Gemini</span>
        </div>
      </nav>

      {/* Header */}
      <header style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 40px", height: 52, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 44, zIndex: 100,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: "linear-gradient(135deg, #2563EB, #7C3AED)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14,
          }}>🛍️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>Detail Page Maker</div>
            <div style={{ fontSize: 9, color: "#9CA3AF", letterSpacing: 2, fontWeight: 600 }}>SHOPPING MALL AI</div>
          </div>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 20,
                background: i === step ? "linear-gradient(135deg, #2563EB, #7C3AED)" : i < step ? "#EEF2FF" : "#F3F4F6",
                cursor: i <= step ? "pointer" : "default",
              }} onClick={() => i <= step && setStep(i)}>
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: i === step ? "rgba(255,255,255,0.25)" : i < step ? "#2563EB" : "#D1D5DB",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, color: i < step ? "white" : i === step ? "white" : "#9CA3AF",
                }}>{i < step ? "✓" : i + 1}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: i === step ? "white" : i < step ? "#2563EB" : "#9CA3AF" }}>
                  {label}
                </span>
              </div>
              {i < 3 && <div style={{ width: 16, height: 1, background: "#E5E7EB" }} />}
            </div>
          ))}
        </div>
      </header>

      {/* ── STEP 0: Product Info ── */}
      {step === 0 && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>제품 정보 입력</h2>
            <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>AI가 맞춤 상세페이지를 제작합니다</p>

            <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                {[
                  { key: "name", label: "제품명 *", placeholder: "예) 프리미엄 라탄 책상 의자" },
                  { key: "category", label: "카테고리", placeholder: "예) 가구·인테리어" },
                  { key: "price", label: "판매가", placeholder: "예) 189,000원" },
                  { key: "targetAudience", label: "타겟 고객", placeholder: "예) 30대 재택근무 직장인" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{label}</label>
                    <input
                      value={productInfo[key as keyof ProductInfo]}
                      onChange={e => setProductInfo(p => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{
                        width: "100%", padding: "10px 14px", borderRadius: 10,
                        border: "1.5px solid #E5E7EB", fontSize: 13, color: "#111827",
                        outline: "none",
                      }}
                    />
                  </div>
                ))}
              </div>

              {[
                { key: "keyFeatures", label: "핵심 특징 / 셀링포인트", placeholder: "예) 인체공학 설계, 통기성 라탄 소재, 360° 회전, 높이조절 가능", rows: 3 },
                { key: "brandVoice", label: "브랜드 보이스 / 참고 톤", placeholder: "예) 자연친화적, 미니멀, 실용적. 인스타그램 느낌보다 블로그 감성.", rows: 2 },
              ].map(({ key, label, placeholder, rows }) => (
                <div key={key} style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{label}</label>
                  <textarea
                    value={productInfo[key as keyof ProductInfo]}
                    onChange={e => setProductInfo(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={rows}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10,
                      border: "1.5px solid #E5E7EB", fontSize: 13, color: "#111827",
                      outline: "none", fontFamily: "inherit",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Tone */}
            <div style={{ background: "white", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>카피 톤 선택</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {TONES.map(t => (
                  <div
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    style={{
                      padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                      border: `2px solid ${tone === t.value ? "#2563EB" : "#E5E7EB"}`,
                      background: tone === t.value ? "#EFF6FF" : "white",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: tone === t.value ? "#2563EB" : "#374151" }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div style={{ background: "white", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 32 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>플랫폼 선택</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {PLATFORMS.map(p => (
                  <div
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    style={{
                      padding: "8px 16px", borderRadius: 20, cursor: "pointer",
                      border: `2px solid ${platform === p.value ? "#2563EB" : "#E5E7EB"}`,
                      background: platform === p.value ? "#EFF6FF" : "white",
                      fontSize: 13, fontWeight: 600,
                      color: platform === p.value ? "#2563EB" : "#374151",
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "all 0.15s",
                    }}
                  >
                    {p.icon} {p.label}
                  </div>
                ))}
              </div>
            </div>

            <button
              className="btn"
              onClick={() => setStep(1)}
              disabled={!productInfo.name}
              style={{
                width: "100%", padding: "14px",
                background: "linear-gradient(135deg, #2563EB, #7C3AED)",
                color: "white", fontSize: 15, borderRadius: 14,
              }}
            >
              다음: 스타일 DNA 설정 →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 1: Style DNA ── */}
      {step === 1 && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>스타일 DNA</h2>
            <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>레퍼런스 이미지 업로드 → AI가 일관된 비주얼 스타일 추출</p>

            <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: "2px dashed #C7D2FE", borderRadius: 16,
                  padding: "32px", textAlign: "center", cursor: "pointer",
                  background: "#F5F7FF", marginBottom: 20,
                  transition: "border-color 0.15s",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#4338CA", marginBottom: 4 }}>
                  레퍼런스 이미지 업로드
                </div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>최대 5장 · 원하는 스타일의 제품 사진</div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleRefImageUpload} />
              </div>

              {refImages.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                  {refImages.map((img, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={img} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} />
                      <button
                        onClick={() => setRefImages(p => p.filter((_, j) => j !== i))}
                        style={{
                          position: "absolute", top: -6, right: -6,
                          width: 20, height: 20, borderRadius: "50%",
                          background: "#EF4444", border: "none",
                          color: "white", fontSize: 11, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              <button
                className="btn"
                onClick={extractDNA}
                disabled={!refImages.length || dnaLoading}
                style={{
                  width: "100%", padding: "12px",
                  background: "linear-gradient(135deg, #2563EB, #7C3AED)",
                  color: "white", fontSize: 14, borderRadius: 12,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {dnaLoading
                  ? <><span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> 분석 중...</>
                  : "🧬 Style DNA 추출"}
              </button>
            </div>

            {styleDNA && (
              <div style={{ background: "white", borderRadius: 20, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24, animation: "fadeUp 0.3s ease" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🧬</span> 추출된 Style DNA
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                  {[
                    { label: "조명", value: styleDNA.lighting },
                    { label: "배경", value: styleDNA.background },
                    { label: "무드", value: styleDNA.mood },
                    { label: "구도", value: styleDNA.composition },
                    { label: "미학", value: styleDNA.aesthetic },
                    { label: "전체 톤", value: styleDNA.overallTone },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "#F8FAFF", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginBottom: 3, letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
                      <div style={{ fontSize: 12, color: "#374151" }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {[...styleDNA.primaryColors, ...styleDNA.secondaryColors].map((c, i) => (
                    <div key={i} style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: c, border: "2px solid rgba(0,0,0,0.1)",
                    }} title={c} />
                  ))}
                </div>

                <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#2563EB", marginBottom: 4 }}>BASE PROMPT</div>
                  <div style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.6 }}>{styleDNA.promptBase}</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn" onClick={() => setStep(0)} style={{ flex: 1, padding: "12px", background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>
                ← 이전
              </button>
              <button
                className="btn"
                onClick={() => setStep(2)}
                style={{ flex: 2, padding: "12px", background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 14, borderRadius: 12 }}
              >
                {styleDNA ? "섹션 편집 시작 →" : "DNA 없이 계속 →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Section Editor ── */}
      {step === 2 && (
        <div style={{ display: "flex", height: "calc(100vh - 96px)" }}>
          {/* Sidebar */}
          <div style={{
            width: 220, background: "white", borderRight: "1px solid #E5E7EB",
            overflowY: "auto", padding: "16px 12px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: 1, marginBottom: 12, padding: "0 4px" }}>
              섹션 목록
            </div>
            {sections.map(sec => (
              <div
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                style={{
                  padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                  background: activeSection === sec.id ? "#EFF6FF" : "transparent",
                  border: `1.5px solid ${activeSection === sec.id ? "#2563EB" : "transparent"}`,
                  marginBottom: 4,
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 16 }}>{sec.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: activeSection === sec.id ? "#2563EB" : "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {sec.label}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                    {sec.research && <span style={{ fontSize: 9, background: "#D1FAE5", color: "#065F46", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>R</span>}
                    {sec.copy && <span style={{ fontSize: 9, background: "#DBEAFE", color: "#1E40AF", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>C</span>}
                    {sec.imagePrompt && <span style={{ fontSize: 9, background: "#EDE9FE", color: "#5B21B6", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>P</span>}
                    {sec.imageUrl && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>I</span>}
                    {sec.locked && <span style={{ fontSize: 9, background: "#F0FDF4", color: "#14532D", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>🔒</span>}
                  </div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 16, padding: "0 4px" }}>
              <button className="btn" onClick={() => setStep(3)} style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 12, borderRadius: 10 }}>
                내보내기 →
              </button>
            </div>
          </div>

          {/* Main Editor */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", background: "#F0F4FF" }}>
            {activeSec ? (
              <SectionEditor
                sec={activeSec}
                onResearch={() => doResearch(activeSec)}
                onCopy={() => doCopy(activeSec)}
                onPrompt={() => doPrompt(activeSec)}
                onImage={() => doImage(activeSec)}
                onImageUpload={(e) => handleSectionImageUpload(activeSec, e)}
                onToggleLock={() => toggleLock(activeSec)}
                onUpdatePrompt={(p) => updateSection(activeSec.id, { imagePrompt: p })}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9CA3AF" }}>
                왼쪽에서 섹션을 선택하세요
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: Export ── */}
      {step === 3 && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>내보내기</h2>
            <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>플랫폼에 맞는 형식으로 내보냅니다</p>

            <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 20 }}>완성된 섹션</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {sections.map(sec => (
                  <div key={sec.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 12,
                    background: sec.copy ? "#F0FDF4" : "#F9FAFB",
                    border: `1.5px solid ${sec.copy ? "#BBF7D0" : "#E5E7EB"}`,
                  }}>
                    <span style={{ fontSize: 20 }}>{sec.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{sec.label}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {sec.research && <span style={{ fontSize: 11, background: "#D1FAE5", color: "#065F46", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>리서치</span>}
                      {sec.copy && <span style={{ fontSize: 11, background: "#DBEAFE", color: "#1E40AF", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>카피</span>}
                      {sec.imageUrl && <span style={{ fontSize: 11, background: "#FEF3C7", color: "#92400E", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>이미지</span>}
                      {sec.locked && <span style={{ fontSize: 11, background: "#F0FDF4", color: "#14532D", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>🔒 완성</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  { label: "📦 JSON 내보내기", desc: "전체 데이터 패키지", onClick: exportJSON, primary: true },
                  { label: "📋 카피 텍스트", desc: "섹션별 텍스트만", onClick: () => {
                    const txt = sections.filter(s => s.copy).map(s => `=== ${s.label} ===\n${JSON.stringify(s.copy, null, 2)}`).join("\n\n");
                    navigator.clipboard.writeText(txt);
                    alert("클립보드에 복사됐어요!");
                  }, primary: false },
                  { label: "🖼️ 이미지 프롬프트", desc: "전체 프롬프트 모음", onClick: () => {
                    const txt = sections.filter(s => s.imagePrompt).map(s => `=== ${s.label} ===\n${s.imagePrompt}`).join("\n\n");
                    navigator.clipboard.writeText(txt);
                    alert("클립보드에 복사됐어요!");
                  }, primary: false },
                ].map(({ label, desc, onClick, primary }) => (
                  <button
                    key={label}
                    className="btn"
                    onClick={onClick}
                    style={{
                      padding: "16px", borderRadius: 14, textAlign: "left",
                      background: primary ? "linear-gradient(135deg, #2563EB, #7C3AED)" : "white",
                      border: primary ? "none" : "1.5px solid #E5E7EB",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: primary ? "white" : "#374151", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 12, color: primary ? "rgba(255,255,255,0.75)" : "#9CA3AF" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button className="btn" onClick={() => setStep(2)} style={{ padding: "12px 24px", background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>
              ← 섹션 편집으로
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SectionEditor sub-component ──────────────────────────────────────────────

function SectionEditor({
  sec,
  onResearch,
  onCopy,
  onPrompt,
  onImage,
  onImageUpload,
  onToggleLock,
  onUpdatePrompt,
}: {
  sec: Section;
  onResearch: () => void;
  onCopy: () => void;
  onPrompt: () => void;
  onImage: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleLock: () => void;
  onUpdatePrompt: (p: string) => void;
}) {
  const imgUploadRef = useRef<HTMLInputElement>(null);

  const EXTERNAL_TOOLS = [
    { name: "Midjourney", url: "https://www.midjourney.com", icon: "🎨" },
    { name: "Flux", url: "https://fal.ai/models/fal-ai/flux/dev", icon: "⚡" },
    { name: "Firefly", url: "https://firefly.adobe.com", icon: "🔥" },
    { name: "DALL-E", url: "https://labs.openai.com", icon: "🤖" },
  ];

  return (
    <div style={{ maxWidth: 680, animation: "fadeUp 0.3s ease" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 28 }}>{sec.icon}</span>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{sec.label}</h3>
          <div style={{ fontSize: 12, color: "#9CA3AF" }}>Section #{sec.type}</div>
        </div>
        <button
          onClick={onToggleLock}
          style={{
            padding: "8px 16px", borderRadius: 20, border: "none", cursor: "pointer",
            background: sec.locked ? "#D1FAE5" : "#F3F4F6",
            color: sec.locked ? "#065F46" : "#6B7280",
            fontSize: 12, fontWeight: 700,
          }}
        >
          {sec.locked ? "🔒 완성 (잠금)" : "잠금 해제"}
        </button>
      </div>

      {/* ① Research */}
      <Card title="① AI 리서치" done={!!sec.research}>
        <button
          className="btn"
          onClick={onResearch}
          disabled={sec.researchLoading || sec.locked}
          style={{ padding: "10px 20px", background: "#D1FAE5", color: "#065F46", fontSize: 13, borderRadius: 10, marginBottom: 12 }}
        >
          {sec.researchLoading ? <Spinner /> : "🔍 리서치 시작"}
        </button>
        {sec.research && (
          <pre style={{ fontSize: 11, background: "#F8FAF8", borderRadius: 8, padding: 12, overflow: "auto", maxHeight: 200, color: "#374151", lineHeight: 1.6 }}>
            {JSON.stringify(sec.research, null, 2)}
          </pre>
        )}
      </Card>

      {/* ② Copy */}
      <Card title="② 카피 생성" done={!!sec.copy}>
        <button
          className="btn"
          onClick={onCopy}
          disabled={sec.copyLoading || sec.locked}
          style={{ padding: "10px 20px", background: "#DBEAFE", color: "#1E40AF", fontSize: 13, borderRadius: 10, marginBottom: 12 }}
        >
          {sec.copyLoading ? <Spinner /> : "✍️ 카피 생성"}
        </button>
        {sec.copy && (
          <div>
            <pre style={{ fontSize: 11, background: "#F0F8FF", borderRadius: 8, padding: 12, overflow: "auto", maxHeight: 200, color: "#374151", lineHeight: 1.6 }}>
              {JSON.stringify(sec.copy, null, 2)}
            </pre>
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(sec.copy, null, 2))}
              style={{ marginTop: 8, padding: "6px 12px", background: "#EFF6FF", border: "none", borderRadius: 8, fontSize: 11, color: "#2563EB", cursor: "pointer", fontWeight: 600 }}
            >
              📋 카피 복사
            </button>
          </div>
        )}
      </Card>

      {/* ③ Image Prompt */}
      <Card title="③ 이미지 프롬프트" done={!!sec.imagePrompt}>
        <button
          className="btn"
          onClick={onPrompt}
          disabled={sec.promptLoading || sec.locked}
          style={{ padding: "10px 20px", background: "#EDE9FE", color: "#5B21B6", fontSize: 13, borderRadius: 10, marginBottom: 12 }}
        >
          {sec.promptLoading ? <Spinner /> : "🎯 프롬프트 생성"}
        </button>
        {sec.imagePrompt && (
          <div>
            <textarea
              value={sec.imagePrompt}
              onChange={e => onUpdatePrompt(e.target.value)}
              disabled={sec.locked}
              rows={4}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                border: "1.5px solid #DDD6FE", fontSize: 12, color: "#374151",
                background: "#FAF5FF", outline: "none", fontFamily: "monospace",
                lineHeight: 1.6,
              }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button
                onClick={() => navigator.clipboard.writeText(sec.imagePrompt)}
                style={{ padding: "6px 12px", background: "#EDE9FE", border: "none", borderRadius: 8, fontSize: 11, color: "#5B21B6", cursor: "pointer", fontWeight: 600 }}
              >
                📋 복사
              </button>
              {EXTERNAL_TOOLS.map(t => (
                <a
                  key={t.name}
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: "6px 12px", background: "#F3F4F6", borderRadius: 8, fontSize: 11, color: "#374151", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  {t.icon} {t.name}
                </a>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ④ Image */}
      <Card title="④ 이미지" done={!!sec.imageUrl}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            className="btn"
            onClick={onImage}
            disabled={!sec.imagePrompt || sec.imageLoading || sec.locked}
            style={{ padding: "10px 18px", background: "#FEF3C7", color: "#92400E", fontSize: 13, borderRadius: 10 }}
          >
            {sec.imageLoading ? <Spinner /> : "✨ Gemini로 생성"}
          </button>
          <button
            className="btn"
            onClick={() => imgUploadRef.current?.click()}
            disabled={sec.locked}
            style={{ padding: "10px 18px", background: "#F3F4F6", color: "#374151", fontSize: 13, borderRadius: 10 }}
          >
            📤 이미지 업로드
          </button>
          <input ref={imgUploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onImageUpload} />
        </div>
        {sec.imageUrl && (
          <div style={{ position: "relative", display: "inline-block" }}>
            <img
              src={sec.imageUrl}
              alt={sec.label}
              style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12, border: "2px solid #E5E7EB" }}
            />
            <a
              href={sec.imageUrl}
              download={`${sec.type}-image.png`}
              style={{
                position: "absolute", bottom: 10, right: 10,
                padding: "6px 12px", background: "rgba(0,0,0,0.6)", borderRadius: 8,
                fontSize: 11, color: "white", textDecoration: "none", fontWeight: 600,
              }}
            >
              💾 저장
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ title, done, children }: { title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 20,
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: 16,
      border: `1.5px solid ${done ? "#BBF7D0" : "#E5E7EB"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: done ? "#D1FAE5" : "#F3F4F6",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: done ? "#065F46" : "#9CA3AF",
        }}>{done ? "✓" : "·"}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#374151",
      borderRadius: "50%", animation: "spin 0.8s linear infinite",
    }} />
  );
}
