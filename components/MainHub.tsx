"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthButton from "@/components/AuthButton";

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
    accentRgb: "251,191,36",
    border: "rgba(251,191,36,0.25)",
    href: "/storyboard",
    badge: "LIVE",
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
    accentRgb: "124,58,237",
    border: "rgba(124,58,237,0.25)",
    href: "/suno",
    badge: "NEW",
    ctaText: "🎵 음악 만들기",
  },
  {
    id: "metaprompt",
    icon: "✦",
    name: "MetaPrompt Engine",
    nameKo: "메타 프롬프트",
    desc: "막연한 아이디어를 AI 인터뷰로 완벽한 프롬프트로",
    features: [
      "이미지 · 영상 · 음악 · 텍스트 범용 지원",
      "AI가 질문으로 아이디어 구체화",
      "단계별 진행 상황 실시간 표시",
      "추론 과정 투명하게 공개",
    ],
    gradient: "linear-gradient(135deg, #1a0533 0%, #2d1b69 50%, #0f2744 100%)",
    accentGrad: "linear-gradient(135deg, #7C3AED, #EC4899, #F97316)",
    accent: "#7C3AED",
    accentRgb: "124,58,237",
    border: "rgba(124,58,237,0.25)",
    href: "/metaprompt",
    badge: "NEW",
    ctaText: "✦ 프롬프트 만들기",
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
    accentRgb: "37,99,235",
    border: "rgba(37,99,235,0.25)",
    href: "/detail",
    badge: "NEW",
    ctaText: "🛍️ 상세페이지 시작",
  },
  {
    id: "detail2",
    icon: "🧱",
    name: "Detail Page Maker 2",
    nameKo: "상세페이지 2",
    desc: "입력만 하면 12장 설득 구조 프롬프트 + gpt-image-2 이미지 + 롱 캔버스 합치기",
    features: [
      "브랜드·특징·모델(나이·성별) 입력 필드화",
      "8단 설득 구조로 12장 프롬프트 자동 설계",
      "장면별 860×고정높이 이미지 즉시 생성",
      "세로로 이어붙여 하나의 긴 상세페이지 PNG",
    ],
    gradient: "linear-gradient(135deg, #7C2D12 0%, #C2410C 50%, #F97316 100%)",
    accentGrad: "linear-gradient(135deg, #EA580C, #F97316)",
    accent: "#EA580C",
    accentRgb: "234,88,12",
    border: "rgba(234,88,12,0.25)",
    href: "/detail2",
    badge: "NEW",
    ctaText: "🧱 상세페이지 2 시작",
  },
  {
    id: "heic",
    icon: "🖼️",
    name: "HEIC to JPG Converter",
    nameKo: "HEIC JPG 변환기",
    desc: "아이폰 HEIC 사진을 JPG로 무료 변환 — 설치 없이, 한 번에 5장",
    features: [
      "아이폰 HEIC/HEIF → JPG 변환",
      "한 번에 최대 5장 일괄 처리",
      "서버 업로드 없이 기기 내 변환(안전)",
      "설치·회원가입 불필요 · 무료",
    ],
    gradient: "linear-gradient(135deg, #0C4A6E 0%, #0EA5E9 50%, #2563EB 100%)",
    accentGrad: "linear-gradient(135deg, #0EA5E9, #2563EB)",
    accent: "#0EA5E9",
    accentRgb: "14,165,233",
    border: "rgba(14,165,233,0.25)",
    href: "/heic",
    badge: "NEW",
    ctaText: "🖼️ HEIC 변환하기",
  },
  {
    id: "autocut",
    icon: "✂️",
    name: "AutoCut Editor",
    nameKo: "자동 컷편집",
    desc: "영상 업로드 한 번으로 초벌편집 + 자막 완성",
    features: [
      "Whisper AI 음성인식 자동 변환",
      "Gemini 핵심 구간 자동 추출",
      "FFmpeg 컷편집 + 자막 자동 삽입",
      "5분 내외 영상 즉시 처리",
    ],
    gradient: "linear-gradient(135deg, #4C1D95 0%, #7C3AED 50%, #EC4899 100%)",
    accentGrad: "linear-gradient(135deg, #7C3AED, #EC4899)",
    accent: "#7C3AED",
    accentRgb: "124,58,237",
    border: "rgba(124,58,237,0.25)",
    href: "/autocut",
    badge: "BETA",
    ctaText: "✂️ 자동 컷편집",
  },
  {
    id: "srt",
    icon: "📝",
    name: "SRT Subtitle Maker",
    nameKo: "SRT 자막 생성기",
    desc: "대본·스크립트를 붙여넣으면 타임코드 자막 완성",
    features: [
      "대본 → SRT 자동 타이밍 변환",
      "한국어 읽기 속도 최적화",
      "txt·srt 파일 업로드 지원",
      ".srt 다운로드 + 복사",
    ],
    gradient: "linear-gradient(135deg, #0C4A6E 0%, #0EA5E9 50%, #7C3AED 100%)",
    accentGrad: "linear-gradient(135deg, #0EA5E9, #7C3AED)",
    accent: "#0EA5E9",
    accentRgb: "14,165,233",
    border: "rgba(14,165,233,0.25)",
    href: "/srt",
    badge: "NEW",
    ctaText: "📝 자막 만들기",
  },
  {
    id: "url",
    icon: "🔗",
    name: "URL Shortener",
    nameKo: "URL 단축기",
    desc: "복잡한 주소를 study.funjeju.com/{slug}로 즉시 단축",
    features: [
      "커스텀 slug 직접 입력 가능",
      "클릭 수 실시간 추적",
      "외부 프로젝트 API 연동 지원",
      "관리자 대시보드 제공",
    ],
    gradient: "linear-gradient(135deg, #064E3B 0%, #065F46 50%, #059669 100%)",
    accentGrad: "linear-gradient(135deg, #059669, #34D399)",
    accent: "#059669",
    accentRgb: "5,150,105",
    border: "rgba(5,150,105,0.25)",
    href: "/url",
    badge: "NEW",
    ctaText: "🔗 URL 단축하기",
  },
  {
    id: "thumbnail",
    icon: "🖼️",
    name: "YouTube Thumbnail Maker",
    nameKo: "유튜브 썸네일 메이커",
    desc: "CTR을 높이는 AI 음악·범용 썸네일 프롬프트 자동 생성",
    features: [
      "수노 스타일 프롬프트 + 가사 감성 분석",
      "유튜브 CTR 강화 요소 자동 적용",
      "Midjourney · Flux · Ideogram · GPT Image 지원",
      "플레이리스트 브랜딩 + 텍스트 오버레이 제안",
    ],
    gradient: "linear-gradient(135deg, #7C2D12 0%, #9A3412 50%, #C2410C 100%)",
    accentGrad: "linear-gradient(135deg, #C2410C, #F97316)",
    accent: "#C2410C",
    accentRgb: "194,65,12",
    border: "rgba(194,65,12,0.25)",
    href: "/thumbnail",
    badge: "NEW",
    ctaText: "🖼️ 썸네일 만들기",
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
        .hub-header { padding: 0 48px !important; }
        .hub-hero { padding: 48px 20px 0 !important; }
        .hub-h1 { font-size: 52px !important; }
        .hub-grid { grid-template-columns: repeat(4,1fr) !important; gap: 20px !important; }
        @media (max-width: 1100px) {
          .hub-grid { grid-template-columns: repeat(3,1fr) !important; }
        }
        @media (max-width: 900px) {
          .hub-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 768px) {
          .hub-header { padding: 0 16px !important; height: auto !important; min-height: 56px !important; flex-wrap: wrap !important; gap: 8px !important; padding-top: 8px !important; padding-bottom: 8px !important; }
          .hub-hero { padding: 36px 16px 0 !important; }
          .hub-h1 { font-size: 32px !important; letter-spacing: -0.5px !important; }
          .hub-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <header className="hub-header" style={{
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
          <div style={{ width: 1, height: 28, background: "#E5E7EB", margin: "0 4px" }} />
          <Link
            href="/actionboard"
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 16px", background:"rgba(124,58,237,0.07)", border:"1.5px solid rgba(124,58,237,0.2)", borderRadius:10, textDecoration:"none", fontSize:13, fontWeight:700, color:"#7C3AED" }}
          >
            📋 액션보드
          </Link>
          <Link
            href="/feed"
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 16px", background:"rgba(236,72,153,0.07)", border:"1.5px solid rgba(236,72,153,0.2)", borderRadius:10, textDecoration:"none", fontSize:13, fontWeight:700, color:"#EC4899" }}
          >
            🌐 피드
          </Link>
          <Link
            href="/url"
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 16px", background:"rgba(5,150,105,0.07)", border:"1.5px solid rgba(5,150,105,0.2)", borderRadius:10, textDecoration:"none", fontSize:13, fontWeight:700, color:"#059669" }}
          >
            🔗 URL 단축
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: "#10B981",
              boxShadow: "0 0 0 3px rgba(16,185,129,0.2)",
            }} />
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>7 tools active</span>
          </div>
          <AuthButton />
        </div>
      </header>

      {/* ── HERO ── */}
      <div className="hub-hero" style={{ maxWidth: 1440, margin: "0 auto", padding: "72px 40px 0" }}>
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

        {/* ── TOOL CARDS — 최대 4열, 초과 시 다음 줄 ── */}
        <div className="hub-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 20,
          paddingBottom: 80,
        }}>
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
                el.style.transform = "translateY(-6px)";
                el.style.boxShadow = "0 28px 56px rgba(0,0,0,0.13)";
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
                padding: "28px 24px 24px",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Decorative circles */}
                <div style={{
                  position: "absolute", right: -24, top: -24,
                  width: 140, height: 140, borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                }} />
                <div style={{
                  position: "absolute", right: 24, bottom: -36,
                  width: 90, height: 90, borderRadius: "50%",
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

                <div style={{ fontSize: 36, marginBottom: 12, animation: "float 3s ease-in-out infinite" }}>
                  {tool.icon}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 6, letterSpacing: -0.5, lineHeight: 1.25 }}>
                  {tool.nameKo}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.55 }}>
                  {tool.desc}
                </div>
              </div>

              {/* Card Body */}
              <div style={{ background: "white", padding: "22px 24px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
                  {tool.features.map((f, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        background: `rgba(${tool.accentRgb},0.1)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, color: tool.accent, fontWeight: 800, marginTop: 1,
                      }}>✓</div>
                      <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{f}</span>
                    </div>
                  ))}
                </div>

                <button style={{
                  width: "100%",
                  padding: "12px",
                  background: tool.accentGrad,
                  border: "none",
                  borderRadius: 12,
                  fontSize: 13, fontWeight: 700, color: "white",
                  cursor: "pointer",
                  letterSpacing: 0.3,
                  boxShadow: `0 4px 16px rgba(${tool.accentRgb},0.35)`,
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
