"use client";

import { useRouter } from "next/navigation";

const TOOLS = [
  {
    id: "storyboard",
    icon: "🎬",
    name: "Storyboard Generator",
    nameKo: "스토리보드 제너레이터",
    desc: "영상 기획부터 컷 분할, 퍼스트프레임 이미지까지",
    features: [
      "Claude AI 기반 멀티레벨 스토리보드",
      "L3 마이크로 비트보드 자동 분해",
      "Gemini 퍼스트프레임 이미지 생성",
      "Kling / Veo / Sora / Runway 최적화",
    ],
    gradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    accentGrad: "linear-gradient(135deg, #FBBf24, #F59E0B)",
    accent: "#FBBf24",
    border: "rgba(251,191,36,0.25)",
    cardBg: "#0D0D1A",
    href: "/storyboard",
    badge: "LIVE",
    badgeColor: "#10B981",
    textColor: "white",
    featureColor: "rgba(255,255,255,0.65)",
    ctaText: "🎬 스토리보드 시작",
  },
  {
    id: "suno",
    icon: "🎵",
    name: "Suno Music Maker",
    nameKo: "수노 뮤직 메이커",
    desc: "AI 프롬프트 생성부터 마스터링, 퍼블리싱까지",
    features: [
      "Suno 최적화 프롬프트 자동 생성",
      "BPM · LUFS · Peak 오디오 분석",
      "플랫폼 기준 마스터링 자동 적용",
      "DistroKid · TuneCore 퍼블리싱 패키지",
    ],
    gradient: "linear-gradient(135deg, #7C3AED 0%, #A855F7 50%, #EC4899 100%)",
    accentGrad: "linear-gradient(135deg, #7C3AED, #EC4899)",
    accent: "#7C3AED",
    border: "rgba(124,58,237,0.25)",
    cardBg: "#FAFBFF",
    href: "/suno",
    badge: "NEW",
    badgeColor: "#7C3AED",
    textColor: "white",
    featureColor: "rgba(255,255,255,0.75)",
    ctaText: "🎵 음악 만들기",
  },
  {
    id: "detail",
    icon: "🛍️",
    name: "Detail Page Maker",
    nameKo: "상세페이지 메이커",
    desc: "Style DNA 기반 쇼핑몰 상세페이지 자동 제작",
    features: [
      "Style DNA 비주얼 일관성 시스템",
      "9개 섹션 AI 리서치 · 카피 · 이미지",
      "스마트스토어 · 쿠팡 · 와디즈 최적화",
      "누적 레퍼런스 프롬프트 잠금 시스템",
    ],
    gradient: "linear-gradient(135deg, #0F4C9A 0%, #1D6EBF 50%, #2563EB 100%)",
    accentGrad: "linear-gradient(135deg, #2563EB, #0EA5E9)",
    accent: "#2563EB",
    border: "rgba(37,99,235,0.25)",
    cardBg: "#F0F6FF",
    href: "/detail",
    badge: "NEW",
    badgeColor: "#2563EB",
    textColor: "white",
    featureColor: "rgba(255,255,255,0.75)",
    ctaText: "🛍️ 상세페이지 시작",
  },
  {
    id: "library",
    icon: "📚",
    name: "My Library",
    nameKo: "마이 라이브러리",
    desc: "생성한 콘텐츠와 음악 파일을 한곳에서 관리",
    features: [
      "Suno 스타일 프롬프트·가사 자동 저장",
      "Suno에서 받아온 음악 파일 업로드",
      "상세페이지 프로젝트 통합 관리",
      "검색·필터·태그로 빠른 탐색",
    ],
    gradient: "linear-gradient(135deg, #064E3B 0%, #047857 50%, #10B981 100%)",
    accentGrad: "linear-gradient(135deg, #10B981, #059669)",
    accent: "#10B981",
    border: "rgba(16,185,129,0.25)",
    cardBg: "#F0FDF4",
    href: "/library",
    badge: "NEW",
    badgeColor: "#10B981",
    textColor: "white",
    featureColor: "rgba(255,255,255,0.75)",
    ctaText: "📚 라이브러리 열기",
  },
];

export default function MainHub() {
  const router = useRouter();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F4F6FA",
      fontFamily: "'Noto Sans KR', -apple-system, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) }
          50%       { transform: translateY(-6px) }
        }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{
        background: "white",
        borderBottom: "1px solid #E5E7EB",
        padding: "0 48px",
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: "linear-gradient(135deg, #7C3AED, #EC4899)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "white",
            boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
          }}>✦</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", letterSpacing: -0.3 }}>
              AI Studio
            </div>
            <div style={{ fontSize: 9, color: "#9CA3AF", letterSpacing: 2, fontWeight: 600 }}>
              CREATIVE TOOLKIT
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#10B981",
            boxShadow: "0 0 0 3px rgba(16,185,129,0.2)",
          }} />
          <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>4 tools active</span>
        </div>
      </header>

      {/* ── HERO ── */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "72px 40px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 56, animation: "fadeUp 0.5s ease both" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 16px",
            background: "rgba(124,58,237,0.07)",
            border: "1px solid rgba(124,58,237,0.15)",
            borderRadius: 100,
            fontSize: 11, fontWeight: 700, color: "#7C3AED",
            letterSpacing: 1.5, marginBottom: 24,
          }}>
            ✦ AI CREATIVE TOOLS
          </div>

          <h1 style={{
            fontSize: 52, fontWeight: 800, color: "#0F172A",
            lineHeight: 1.15, letterSpacing: -1.5, marginBottom: 18,
          }}>
            콘텐츠 제작의<br />
            <span style={{
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>새로운 방식</span>
          </h1>

          <p style={{ fontSize: 17, color: "#6B7280", lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
            영상 스토리보드부터 음악 마스터링까지 —<br />
            AI가 프로의 워크플로우를 자동화합니다
          </p>
        </div>

        {/* ── TOOL CARDS ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, paddingBottom: 80 }}>
          {TOOLS.map((tool, i) => (
            <div
              key={tool.id}
              onClick={() => router.push(tool.href)}
              style={{
                borderRadius: 24,
                border: `1px solid ${tool.border}`,
                overflow: "hidden",
                cursor: "pointer",
                transition: "transform 0.25s ease, box-shadow 0.25s ease",
                animation: `fadeUp 0.5s ease ${0.1 + i * 0.12}s both`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = "translateY(-5px)";
                el.style.boxShadow = "0 24px 48px rgba(0,0,0,0.12)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
              }}
            >
              {/* Card Header */}
              <div style={{
                background: tool.gradient,
                padding: "32px 32px 28px",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Decorative circles */}
                <div style={{
                  position: "absolute", right: -20, top: -20,
                  width: 120, height: 120, borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                }} />
                <div style={{
                  position: "absolute", right: 20, bottom: -30,
                  width: 80, height: 80, borderRadius: "50%",
                  background: "rgba(255,255,255,0.04)",
                }} />

                {/* Badge */}
                <div style={{
                  position: "absolute", top: 20, right: 20,
                  padding: "4px 12px",
                  background: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(4px)",
                  borderRadius: 100,
                  fontSize: 10, fontWeight: 800, color: "white",
                  letterSpacing: 1.5,
                }}>{tool.badge}</div>

                <div style={{ fontSize: 40, marginBottom: 14, animation: "float 3s ease-in-out infinite" }}>
                  {tool.icon}
                </div>
                <div style={{ fontSize: 21, fontWeight: 800, color: "white", marginBottom: 6, letterSpacing: -0.5 }}>
                  {tool.name}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                  {tool.desc}
                </div>
              </div>

              {/* Card Body */}
              <div style={{ background: "white", padding: "24px 32px 28px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
                  {tool.features.map((f, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        background: `rgba(${tool.id === "storyboard" ? "251,191,36" : tool.id === "suno" ? "124,58,237" : tool.id === "library" ? "16,185,129" : "37,99,235"},0.1)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, color: tool.accent, fontWeight: 800, marginTop: 1,
                      }}>✓</div>
                      <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{f}</span>
                    </div>
                  ))}
                </div>

                <button style={{
                  width: "100%",
                  padding: "13px",
                  background: tool.accentGrad,
                  border: "none",
                  borderRadius: 12,
                  fontSize: 14, fontWeight: 700, color: "white",
                  cursor: "pointer",
                  letterSpacing: 0.3,
                  boxShadow: `0 4px 14px rgba(${tool.id === "storyboard" ? "251,191,36" : tool.id === "suno" ? "124,58,237" : tool.id === "library" ? "16,185,129" : "37,99,235"},0.35)`,
                  transition: "opacity 0.15s",
                }}>
                  {tool.ctaText} →
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", paddingBottom: 40, fontSize: 12, color: "#9CA3AF" }}>
          Powered by&nbsp;
          <span style={{ color: "#D97706", fontWeight: 600 }}>Claude</span> ·&nbsp;
          <span style={{ color: "#7C3AED", fontWeight: 600 }}>Gemini</span> ·&nbsp;
          <span style={{ color: "#F97316", fontWeight: 600 }}>Firebase</span>
        </div>
      </div>
    </div>
  );
}
