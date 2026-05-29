"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { upsertDetailProject, getDetailProject } from "@/lib/firestoreHelpers";

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

type SectionType =
  | "hook" | "usp" | "problemSolution" | "specs"
  | "lifestyle" | "options" | "reviews" | "faq" | "cta";

interface Section {
  id: string;
  type: SectionType;
  label: string;
  icon: string;
  copy: Record<string, unknown> | null;
  imagePrompt: string;
  imageUrl: string;
  locked: boolean;
  copyLoading: boolean;
  promptLoading: boolean;
  imageLoading: boolean;
}

interface Thumbnail {
  imagePrompt: string;
  imageUrl: string;
  promptLoading: boolean;
  imageLoading: boolean;
}

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

interface ProjectState {
  id: string;
  productInfo: ProductInfo;
  tone: Tone;
  platform: Platform;
  refImages: string[];
  styleDNA: StyleDNA | null;
  overallResearch: Record<string, unknown> | null;
  thumbnail: Thumbnail;
  sections: Section[];
  updatedAt: number;
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

const STEP_LABELS = ["제품 정보", "스타일 DNA", "콘텐츠 생성", "내보내기"];

const PROJECTS_KEY = "dpm_projects_v1";
const CURRENT_KEY = "dpm_current_project_v1";

// ─── Project storage helpers ──────────────────────────────────────────────────

function loadProjectsIndex(): { id: string; name: string; updatedAt: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveProjectsIndex(index: { id: string; name: string; updatedAt: number }[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(index));
}

function saveProject(state: ProjectState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`dpm_project_${state.id}`, JSON.stringify(state));
    const index = loadProjectsIndex().filter(p => p.id !== state.id);
    index.unshift({ id: state.id, name: state.productInfo.name || "(이름 없음)", updatedAt: state.updatedAt });
    saveProjectsIndex(index.slice(0, 50));
    localStorage.setItem(CURRENT_KEY, state.id);
  } catch (e) {
    console.warn("Save failed", e);
  }
}

function loadProject(id: string): ProjectState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`dpm_project_${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function deleteProject(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`dpm_project_${id}`);
  saveProjectsIndex(loadProjectsIndex().filter(p => p.id !== id));
}

function newProjectState(): ProjectState {
  return {
    id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productInfo: { name: "", category: "", price: "", targetAudience: "", keyFeatures: "", brandVoice: "" },
    tone: "friendly",
    platform: "smartstore",
    refImages: [],
    styleDNA: null,
    overallResearch: null,
    thumbnail: { imagePrompt: "", imageUrl: "", promptLoading: false, imageLoading: false },
    sections: SECTION_TEMPLATES.map((t, i) => ({
      id: `sec-${i}`,
      ...t,
      copy: null,
      imagePrompt: "",
      imageUrl: "",
      locked: false,
      copyLoading: false,
      promptLoading: false,
      imageLoading: false,
    })),
    updatedAt: Date.now(),
  };
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function callApi<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`${path} ${res.status}: ${err.error || JSON.stringify(err)}`);
  }
  return res.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DetailPageMaker() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(0);
  const [project, setProject] = useState<ProjectState>(() => newProjectState());
  const [projectIndex, setProjectIndex] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ active: boolean; done: number; total: number; label: string }>({ active: false, done: 0, total: 0, label: "" });
  const [researchLoading, setResearchLoading] = useState(false);
  const [dnaLoading, setDnaLoading] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load index + last-edited project on mount (or from ?load= query param)
  useEffect(() => {
    setProjectIndex(loadProjectsIndex());
    const loadId = searchParams?.get("load");
    if (loadId && user) {
      // Try to load from Firestore
      getDetailProject(user.uid, loadId).then(cloud => {
        if (cloud) {
          try {
            const parsed: ProjectState = JSON.parse(cloud.projectData);
            setProject(parsed);
            setStep(parsed.styleDNA ? 2 : parsed.productInfo.name ? 1 : 0);
          } catch { /* fall through to localStorage */ }
        }
      }).catch(() => {});
    } else {
      const currentId = localStorage.getItem(CURRENT_KEY);
      if (currentId) {
        const loaded = loadProject(currentId);
        if (loaded) setProject(loaded);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave (localStorage + Firestore)
  useEffect(() => {
    const t = setTimeout(() => {
      const toSave = { ...project, updatedAt: Date.now() };
      saveProject(toSave);
      setProjectIndex(loadProjectsIndex());

      // Cloud sync when logged in
      if (user) {
        const completedSections = project.sections.filter(s => s.copy !== null).length;
        const totalSections = project.sections.length;
        const status = completedSections === totalSections ? "completed" as const : "in-progress" as const;
        setCloudSyncing(true);
        upsertDetailProject(user.uid, {
          id: project.id,
          productName: project.productInfo.name || "(이름 없음)",
          platform: project.platform,
          tone: project.tone,
          status,
          completedSections,
          totalSections,
          createdAt: project.updatedAt,
          updatedAt: Date.now(),
          projectData: JSON.stringify(toSave),
        }).catch(e => console.warn("Firestore detail save failed", e))
          .finally(() => setCloudSyncing(false));
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, user]);

  const updateProject = useCallback((patch: Partial<ProjectState>) => {
    setProject(prev => ({ ...prev, ...patch }));
  }, []);

  const updateSection = useCallback((id: string, patch: Partial<Section>) => {
    setProject(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, ...patch } : s),
    }));
  }, []);

  const updateThumbnail = useCallback((patch: Partial<Thumbnail>) => {
    setProject(prev => ({ ...prev, thumbnail: { ...prev.thumbnail, ...patch } }));
  }, []);

  // ── Project actions ────────────────────────────────────────────────────────

  const startNewProject = () => {
    if (project.productInfo.name && !confirm("현재 프로젝트는 자동 저장됩니다. 새로 시작할까요?")) return;
    const fresh = newProjectState();
    setProject(fresh);
    setStep(0);
  };

  const openProject = (id: string) => {
    const loaded = loadProject(id);
    if (loaded) {
      setProject(loaded);
      setStep(loaded.styleDNA ? 2 : loaded.productInfo.name ? 1 : 0);
    }
  };

  const removeProject = (id: string) => {
    if (!confirm("이 프로젝트를 삭제할까요?")) return;
    deleteProject(id);
    setProjectIndex(loadProjectsIndex());
    if (project.id === id) {
      setProject(newProjectState());
      setStep(0);
    }
  };

  // ── Style DNA ──────────────────────────────────────────────────────────────

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        setProject(prev => ({
          ...prev,
          refImages: prev.refImages.length < 5 ? [...prev.refImages, dataUrl] : prev.refImages,
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const extractDNA = async () => {
    if (!project.refImages.length) return;
    setDnaLoading(true);
    try {
      const { dna } = await callApi<{ dna: StyleDNA }>("/api/style-dna", { images: project.refImages });
      updateProject({ styleDNA: dna });
    } catch (e) {
      alert("Style DNA 추출 실패: " + String(e));
    } finally {
      setDnaLoading(false);
    }
  };

  // ── Unified research ───────────────────────────────────────────────────────

  const runOverallResearch = async () => {
    setResearchLoading(true);
    try {
      const { research } = await callApi<{ research: Record<string, unknown> }>("/api/research", {
        productInfo: project.productInfo,
      });
      updateProject({ overallResearch: research });
    } catch (e) {
      alert("종합 리서치 실패: " + String(e));
    } finally {
      setResearchLoading(false);
    }
  };

  // ── Per-section generation ─────────────────────────────────────────────────

  const sectionGuidanceFor = (type: SectionType) => {
    const research = project.overallResearch as { sectionGuidance?: Record<string, unknown> } | null;
    return research?.sectionGuidance?.[type];
  };

  const lockedPromptsBefore = (sectionId: string) => {
    const idx = project.sections.findIndex(s => s.id === sectionId);
    return project.sections.slice(0, idx)
      .filter(s => s.locked && s.imagePrompt)
      .map(s => `[${s.label}] ${s.imagePrompt}`);
  };

  const genSectionCopy = async (sec: Section) => {
    updateSection(sec.id, { copyLoading: true });
    try {
      const { copy } = await callApi<{ copy: Record<string, unknown> }>("/api/copy-gen", {
        sectionType: sec.type,
        tone: project.tone,
        productInfo: project.productInfo,
        research: project.overallResearch,
        platform: project.platform,
      });
      updateSection(sec.id, { copy, copyLoading: false });
      return copy;
    } catch (e) {
      updateSection(sec.id, { copyLoading: false });
      throw e;
    }
  };

  const genSectionPrompt = async (sec: Section, copyOverride?: Record<string, unknown> | null) => {
    updateSection(sec.id, { promptLoading: true });
    try {
      const { prompt } = await callApi<{ prompt: string }>("/api/img-prompt", {
        sectionType: sec.type,
        productInfo: project.productInfo,
        styleDNA: project.styleDNA,
        copy: copyOverride ?? sec.copy,
        sectionGuidance: sectionGuidanceFor(sec.type),
        lockedSectionPrompts: lockedPromptsBefore(sec.id),
      });
      updateSection(sec.id, { imagePrompt: prompt, promptLoading: false });
      return prompt;
    } catch (e) {
      updateSection(sec.id, { promptLoading: false });
      throw e;
    }
  };

  const genThumbnailPrompt = async () => {
    updateThumbnail({ promptLoading: true });
    try {
      const { prompt } = await callApi<{ prompt: string }>("/api/img-prompt", {
        sectionType: "thumbnail",
        productInfo: project.productInfo,
        styleDNA: project.styleDNA,
        copy: null,
        sectionGuidance: null,
        lockedSectionPrompts: [],
      });
      updateThumbnail({ imagePrompt: prompt, promptLoading: false });
      return prompt;
    } catch (e) {
      updateThumbnail({ promptLoading: false });
      throw e;
    }
  };

  const genImage = async (prompt: string, target: "thumbnail" | string) => {
    if (!prompt) return;
    const setLoading = (v: boolean) => {
      if (target === "thumbnail") updateThumbnail({ imageLoading: v });
      else updateSection(target, { imageLoading: v });
    };
    setLoading(true);
    try {
      const fullPrompt = project.styleDNA
        ? `${prompt} Style: ${project.styleDNA.promptBase}`
        : prompt;
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setLoading(false);
        alert("이미지 생성 실패: " + (data.error || `HTTP ${res.status}`));
        return;
      }
      if (target === "thumbnail") updateThumbnail({ imageUrl: data.imageUrl, imageLoading: false });
      else updateSection(target, { imageUrl: data.imageUrl, imageLoading: false });
    } catch (e) {
      setLoading(false);
      alert("이미지 생성 실패: " + String(e));
    }
  };

  // ── Bulk generation (the headliner button) ─────────────────────────────────

  const generateAllContent = async () => {
    // 1) Ensure overall research exists
    let research = project.overallResearch;
    if (!research) {
      setBulkProgress({ active: true, done: 0, total: 11, label: "종합 리서치 중..." });
      try {
        const { research: r } = await callApi<{ research: Record<string, unknown> }>("/api/research", {
          productInfo: project.productInfo,
        });
        research = r;
        updateProject({ overallResearch: r });
      } catch (e) {
        setBulkProgress({ active: false, done: 0, total: 0, label: "" });
        alert("리서치 단계 실패: " + String(e));
        return;
      }
    }

    const total = 1 + project.sections.length * 2; // thumbnail + (copy + prompt) per section
    let done = research ? 1 : 0;
    setBulkProgress({ active: true, done, total, label: "9섹션 카피 + 이미지 프롬프트 생성 중..." });

    // 2) Thumbnail prompt (parallel with section work)
    const thumbnailTask = (async () => {
      try {
        const { prompt } = await callApi<{ prompt: string }>("/api/img-prompt", {
          sectionType: "thumbnail",
          productInfo: project.productInfo,
          styleDNA: project.styleDNA,
          copy: null,
          sectionGuidance: null,
          lockedSectionPrompts: [],
        });
        updateThumbnail({ imagePrompt: prompt });
      } catch (e) {
        console.warn("Thumbnail prompt failed", e);
      } finally {
        done += 1;
        setBulkProgress(p => ({ ...p, done }));
      }
    })();

    // 3) Per-section: copy → prompt (sequential within section, parallel across sections)
    const sectionTasks = project.sections.map(sec => (async () => {
      try {
        const { copy } = await callApi<{ copy: Record<string, unknown> }>("/api/copy-gen", {
          sectionType: sec.type,
          tone: project.tone,
          productInfo: project.productInfo,
          research,
          platform: project.platform,
        });
        updateSection(sec.id, { copy });
        done += 1;
        setBulkProgress(p => ({ ...p, done }));

        const { prompt } = await callApi<{ prompt: string }>("/api/img-prompt", {
          sectionType: sec.type,
          productInfo: project.productInfo,
          styleDNA: project.styleDNA,
          copy,
          sectionGuidance: (research as { sectionGuidance?: Record<string, unknown> } | null)?.sectionGuidance?.[sec.type],
          lockedSectionPrompts: [],
        });
        updateSection(sec.id, { imagePrompt: prompt });
      } catch (e) {
        console.warn(`Section ${sec.type} failed`, e);
      } finally {
        done += 1;
        setBulkProgress(p => ({ ...p, done }));
      }
    })());

    await Promise.all([thumbnailTask, ...sectionTasks]);
    setBulkProgress({ active: false, done: 0, total: 0, label: "" });
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportJSON = () => {
    const data = {
      productInfo: project.productInfo,
      tone: project.tone,
      platform: project.platform,
      styleDNA: project.styleDNA,
      overallResearch: project.overallResearch,
      thumbnail: { imagePrompt: project.thumbnail.imagePrompt, hasImage: !!project.thumbnail.imageUrl },
      sections: project.sections.map(s => ({
        type: s.type,
        label: s.label,
        copy: s.copy,
        imagePrompt: s.imagePrompt,
        hasImage: !!s.imageUrl,
        locked: s.locked,
      })),
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `detail-page-${project.productInfo.name || "product"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FF", fontFamily: "'Noto Sans KR', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0;transform:translateY(16px) } to { opacity:1;transform:translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
        .btn { cursor:pointer; border:none; border-radius:10px; font-weight:700; transition:opacity 0.15s; }
        .btn:hover { opacity:0.85; }
        .btn:disabled { opacity:0.4; cursor:not-allowed; }
        textarea, input { font-family: inherit; }
        textarea { resize:vertical; }
      `}</style>

      {/* Top Nav */}
      <nav style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 32px", height: 44, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 101,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "white",
            }}>✦</div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>AI Studio</span>
          </a>
          <div style={{ width: 1, height: 16, background: "#E5E7EB" }} />
          {[
            { href: "/storyboard", icon: "🎬", label: "Storyboard" },
            { href: "/suno", icon: "🎵", label: "Suno Maker" },
            { href: "/metaprompt", icon: "✦", label: "MetaPrompt" },
            { href: "/detail", icon: "🛍️", label: "Detail Page" },
            { href: "/autocut", icon: "✂️", label: "AutoCut" },
          ].map(tool => (
            <a key={tool.href} href={tool.href} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 8, textDecoration: "none",
              background: tool.href === "/detail" ? "#EFF6FF" : "transparent",
              border: tool.href === "/detail" ? "1px solid #BFDBFE" : "1px solid transparent",
              fontSize: 12, fontWeight: 600,
              color: tool.href === "/detail" ? "#2563EB" : "#6B7280",
            }}>
              <span style={{ fontSize: 13 }}>{tool.icon}</span>
              {tool.label}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {user ? (
            <>
              <span style={{ fontSize: 10, color: cloudSyncing ? "#6B7280" : "#059669" }}>
                {cloudSyncing ? "⏳ 저장 중..." : "☁️ 클라우드 저장됨"}
              </span>
              {user.photoURL && <img src={user.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />}
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>
              Powered by <span style={{ color: "#2563EB", fontWeight: 700 }}>Gemini</span>
            </div>
          )}
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
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}>🛍️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>Detail Page Maker</div>
            <div style={{ fontSize: 9, color: "#9CA3AF", letterSpacing: 2, fontWeight: 600 }}>
              {project.productInfo.name ? `프로젝트: ${project.productInfo.name}` : "SHOPPING MALL AI"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                onClick={() => i <= step && setStep(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 20,
                  background: i === step ? "linear-gradient(135deg, #2563EB, #7C3AED)" : i < step ? "#EEF2FF" : "#F3F4F6",
                  cursor: i <= step ? "pointer" : "default",
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: i === step ? "rgba(255,255,255,0.25)" : i < step ? "#2563EB" : "#D1D5DB",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, color: i < step || i === step ? "white" : "#9CA3AF",
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

      {/* ── STEP 0: Product Info + Projects ── */}
      {step === 0 && (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ animation: "fadeUp 0.4s ease both", display: "grid", gridTemplateColumns: "1fr 260px", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>제품 정보 입력</h2>
              <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 24 }}>AI가 맞춤 상세페이지를 제작합니다 · 작업은 자동 저장됩니다</p>

              <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                  {[
                    { key: "name", label: "제품명 *", placeholder: "예) 프리미엄 제주 한라봉" },
                    { key: "category", label: "카테고리", placeholder: "예) 농산물·과일" },
                    { key: "price", label: "판매가", placeholder: "예) 29,900원" },
                    { key: "targetAudience", label: "타겟 고객", placeholder: "예) 30-40대 가족 소비자, 선물용 구매" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{label}</label>
                      <input
                        value={project.productInfo[key as keyof ProductInfo]}
                        onChange={e => updateProject({ productInfo: { ...project.productInfo, [key]: e.target.value } })}
                        placeholder={placeholder}
                        style={{
                          width: "100%", padding: "10px 14px", borderRadius: 10,
                          border: "1.5px solid #E5E7EB", fontSize: 13, color: "#111827", outline: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>

                {[
                  { key: "keyFeatures", label: "핵심 특징 / 셀링포인트", placeholder: "예) 제주 직송, 13브릭스 이상 당도 보장, 사이즈 선별 포장", rows: 3 },
                  { key: "brandVoice", label: "브랜드 보이스 / 참고 톤", placeholder: "예) 정직한 농가, 가족적인, 신뢰감 있는", rows: 2 },
                ].map(({ key, label, placeholder, rows }) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{label}</label>
                    <textarea
                      value={project.productInfo[key as keyof ProductInfo]}
                      onChange={e => updateProject({ productInfo: { ...project.productInfo, [key]: e.target.value } })}
                      placeholder={placeholder}
                      rows={rows}
                      style={{
                        width: "100%", padding: "10px 14px", borderRadius: 10,
                        border: "1.5px solid #E5E7EB", fontSize: 13, color: "#111827", outline: "none",
                      }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ background: "white", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>카피 톤 선택</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {TONES.map(t => (
                    <div key={t.value} onClick={() => updateProject({ tone: t.value })} style={{
                      padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                      border: `2px solid ${project.tone === t.value ? "#2563EB" : "#E5E7EB"}`,
                      background: project.tone === t.value ? "#EFF6FF" : "white",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: project.tone === t.value ? "#2563EB" : "#374151" }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "white", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 32 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>플랫폼 선택</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {PLATFORMS.map(p => (
                    <div key={p.value} onClick={() => updateProject({ platform: p.value })} style={{
                      padding: "8px 16px", borderRadius: 20, cursor: "pointer",
                      border: `2px solid ${project.platform === p.value ? "#2563EB" : "#E5E7EB"}`,
                      background: project.platform === p.value ? "#EFF6FF" : "white",
                      fontSize: 13, fontWeight: 600,
                      color: project.platform === p.value ? "#2563EB" : "#374151",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {p.icon} {p.label}
                    </div>
                  ))}
                </div>
              </div>

              <button className="btn" onClick={() => setStep(1)} disabled={!project.productInfo.name} style={{
                width: "100%", padding: "14px",
                background: "linear-gradient(135deg, #2563EB, #7C3AED)",
                color: "white", fontSize: 15, borderRadius: 14,
              }}>
                다음: 스타일 DNA 설정 →
              </button>
            </div>

            {/* Project list sidebar */}
            <aside>
              <div style={{ background: "white", borderRadius: 16, padding: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", position: "sticky", top: 110 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>📁 내 프로젝트</div>
                  <button onClick={startNewProject} style={{
                    padding: "4px 10px", borderRadius: 8, background: "#EFF6FF",
                    color: "#2563EB", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>+ 새로</button>
                </div>
                <div style={{ maxHeight: 420, overflowY: "auto", marginRight: -4, paddingRight: 4 }}>
                  {projectIndex.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#9CA3AF", padding: "20px 0", textAlign: "center" }}>저장된 프로젝트 없음</div>
                  ) : projectIndex.map(p => (
                    <div key={p.id} style={{
                      padding: "10px 12px", borderRadius: 10, marginBottom: 6,
                      background: p.id === project.id ? "#EFF6FF" : "#F9FAFB",
                      border: `1.5px solid ${p.id === project.id ? "#BFDBFE" : "transparent"}`,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => openProject(p.id)}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color: p.id === project.id ? "#2563EB" : "#374151",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
                          {new Date(p.updatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <button onClick={() => removeProject(p.id)} style={{
                        background: "transparent", border: "none", color: "#EF4444",
                        cursor: "pointer", fontSize: 14, padding: 4,
                      }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* ── STEP 1: Style DNA ── */}
      {step === 1 && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>스타일 DNA</h2>
            <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>레퍼런스 이미지 업로드 → AI가 일관된 비주얼 스타일 추출 (선택, 건너뛸 수 있음)</p>

            <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
              <div onClick={() => fileRef.current?.click()} style={{
                border: "2px dashed #C7D2FE", borderRadius: 16,
                padding: "32px", textAlign: "center", cursor: "pointer",
                background: "#F5F7FF", marginBottom: 20,
              }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#4338CA", marginBottom: 4 }}>레퍼런스 이미지 업로드</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>최대 5장 · 원하는 스타일의 제품 사진</div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleRefImageUpload} />
              </div>

              {project.refImages.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                  {project.refImages.map((img, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={img} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} />
                      <button onClick={() => updateProject({ refImages: project.refImages.filter((_, j) => j !== i) })} style={{
                        position: "absolute", top: -6, right: -6,
                        width: 20, height: 20, borderRadius: "50%",
                        background: "#EF4444", border: "none", color: "white",
                        fontSize: 11, cursor: "pointer",
                      }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <button className="btn" onClick={extractDNA} disabled={!project.refImages.length || dnaLoading} style={{
                width: "100%", padding: "12px",
                background: "linear-gradient(135deg, #2563EB, #7C3AED)",
                color: "white", fontSize: 14, borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {dnaLoading ? <><Spinner light /> 분석 중...</> : "🧬 Style DNA 추출"}
              </button>
            </div>

            {project.styleDNA && (
              <div style={{ background: "white", borderRadius: 20, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🧬</span> 추출된 Style DNA
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                  {[
                    { label: "조명", value: project.styleDNA.lighting },
                    { label: "배경", value: project.styleDNA.background },
                    { label: "무드", value: project.styleDNA.mood },
                    { label: "구도", value: project.styleDNA.composition },
                    { label: "미학", value: project.styleDNA.aesthetic },
                    { label: "전체 톤", value: project.styleDNA.overallTone },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "#F8FAFF", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginBottom: 3, letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
                      <div style={{ fontSize: 12, color: "#374151" }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {[...project.styleDNA.primaryColors, ...project.styleDNA.secondaryColors].map((c, i) => (
                    <div key={i} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: "2px solid rgba(0,0,0,0.1)" }} title={c} />
                  ))}
                </div>
                <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#2563EB", marginBottom: 4 }}>BASE PROMPT</div>
                  <div style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.6 }}>{project.styleDNA.promptBase}</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn" onClick={() => setStep(0)} style={{ flex: 1, padding: "12px", background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>← 이전</button>
              <button className="btn" onClick={() => setStep(2)} style={{ flex: 2, padding: "12px", background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 14, borderRadius: 12 }}>
                {project.styleDNA ? "콘텐츠 생성 시작 →" : "DNA 없이 계속 →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Content Generation ── */}
      {step === 2 && (
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
          {/* Unified Research */}
          <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🔍</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>종합 리서치</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>제품 전체에 대한 단일 전략 분석 · 9섹션 공통 베이스</div>
                </div>
              </div>
              <button className="btn" onClick={runOverallResearch} disabled={researchLoading} style={{
                padding: "10px 20px",
                background: project.overallResearch ? "#F3F4F6" : "linear-gradient(135deg, #10B981, #059669)",
                color: project.overallResearch ? "#374151" : "white",
                fontSize: 13, borderRadius: 10,
              }}>
                {researchLoading ? <Spinner /> : project.overallResearch ? "🔄 다시 분석" : "🔍 종합 리서치 실행"}
              </button>
            </div>
            {project.overallResearch && (
              <details style={{ background: "#F8FAFC", borderRadius: 10, padding: 12 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, color: "#475569", cursor: "pointer" }}>전략 브리프 보기 (JSON)</summary>
                <pre style={{ fontSize: 11, lineHeight: 1.6, color: "#334155", marginTop: 10, overflow: "auto", maxHeight: 300 }}>
                  {JSON.stringify(project.overallResearch, null, 2)}
                </pre>
              </details>
            )}
          </div>

          {/* Bulk generation button */}
          <div style={{
            background: "linear-gradient(135deg, #2563EB, #7C3AED)",
            borderRadius: 20, padding: 24, marginBottom: 24,
            boxShadow: "0 4px 16px rgba(124,58,237,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
              <div style={{ color: "white" }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>⚡ 전체 자동 생성</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  종합 리서치 (없으면 자동) → 썸네일 프롬프트 + 9섹션 카피·이미지 프롬프트 한번에 (이미지는 별도)
                </div>
                {bulkProgress.active && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, marginBottom: 6, animation: "pulse 1.5s infinite" }}>
                      {bulkProgress.label} · {bulkProgress.done}/{bulkProgress.total}
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.2)", height: 6, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        background: "white", height: "100%",
                        width: `${(bulkProgress.done / bulkProgress.total) * 100}%`,
                        transition: "width 0.3s",
                      }} />
                    </div>
                  </div>
                )}
              </div>
              <button className="btn" onClick={generateAllContent} disabled={bulkProgress.active || !project.productInfo.name} style={{
                padding: "16px 28px",
                background: "white", color: "#7C3AED",
                fontSize: 14, borderRadius: 12, whiteSpace: "nowrap",
              }}>
                {bulkProgress.active ? "생성 중..." : "🚀 한번에 생성"}
              </button>
            </div>
          </div>

          {/* Thumbnail card */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", letterSpacing: 1, marginBottom: 10, padding: "0 4px" }}>
              MASTER THUMBNAIL · 상품 목록·검색·광고용
            </div>
            <ThumbnailCard
              thumbnail={project.thumbnail}
              onGenPrompt={genThumbnailPrompt}
              onGenImage={() => genImage(project.thumbnail.imagePrompt, "thumbnail")}
              onUpdatePrompt={(p) => updateThumbnail({ imagePrompt: p })}
              onUploadImage={(url) => updateThumbnail({ imageUrl: url })}
            />
          </div>

          {/* 9-section grid */}
          <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", letterSpacing: 1, marginBottom: 10, padding: "0 4px" }}>
            DETAIL PAGE SECTIONS · 9개 섹션
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}>
            {project.sections.map(sec => (
              <SectionCard
                key={sec.id}
                sec={sec}
                onGenCopy={() => genSectionCopy(sec).catch(e => alert("카피 실패: " + String(e)))}
                onGenPrompt={() => genSectionPrompt(sec).catch(e => alert("프롬프트 실패: " + String(e)))}
                onGenImage={() => genImage(sec.imagePrompt, sec.id)}
                onUpdatePrompt={(p) => updateSection(sec.id, { imagePrompt: p })}
                onToggleLock={() => updateSection(sec.id, { locked: !sec.locked })}
                onUploadImage={(url) => updateSection(sec.id, { imageUrl: url })}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            <button className="btn" onClick={() => setStep(1)} style={{ flex: 1, padding: "12px", background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>← 스타일 DNA로</button>
            <button className="btn" onClick={() => setStep(3)} style={{ flex: 2, padding: "12px", background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 14, borderRadius: 12 }}>
              내보내기 →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Export ── */}
      {step === 3 && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>내보내기</h2>
          <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>완성된 콘텐츠를 패키지로 내보냅니다</p>

          <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 16 }}>완성 상태</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              <StatusRow icon="🖼️" label="썸네일" hasCopy={false} hasPrompt={!!project.thumbnail.imagePrompt} hasImage={!!project.thumbnail.imageUrl} />
              {project.sections.map(s => (
                <StatusRow key={s.id} icon={s.icon} label={s.label} hasCopy={!!s.copy} hasPrompt={!!s.imagePrompt} hasImage={!!s.imageUrl} />
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <button className="btn" onClick={exportJSON} style={{ padding: 16, borderRadius: 14, background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📦 JSON 내보내기</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>전체 데이터 패키지</div>
              </button>
              <button className="btn" onClick={() => {
                const txt = project.sections.filter(s => s.copy).map(s => `=== ${s.label} ===\n${JSON.stringify(s.copy, null, 2)}`).join("\n\n");
                navigator.clipboard.writeText(txt);
                alert("클립보드에 복사됐어요!");
              }} style={{ padding: 16, borderRadius: 14, background: "white", border: "1.5px solid #E5E7EB", textAlign: "left", color: "#374151" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📋 카피 텍스트</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>섹션별 텍스트만</div>
              </button>
              <button className="btn" onClick={() => {
                const lines = [];
                if (project.thumbnail.imagePrompt) lines.push(`=== 썸네일 ===\n${project.thumbnail.imagePrompt}`);
                project.sections.filter(s => s.imagePrompt).forEach(s => lines.push(`=== ${s.label} ===\n${s.imagePrompt}`));
                navigator.clipboard.writeText(lines.join("\n\n"));
                alert("클립보드에 복사됐어요!");
              }} style={{ padding: 16, borderRadius: 14, background: "white", border: "1.5px solid #E5E7EB", textAlign: "left", color: "#374151" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🖼️ 이미지 프롬프트</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>썸네일 + 9섹션 전체</div>
              </button>
            </div>
          </div>

          <button className="btn" onClick={() => setStep(2)} style={{ padding: "12px 24px", background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>← 콘텐츠 생성으로</button>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ThumbnailCard({
  thumbnail, onGenPrompt, onGenImage, onUpdatePrompt, onUploadImage,
}: {
  thumbnail: Thumbnail;
  onGenPrompt: () => void;
  onGenImage: () => void;
  onUpdatePrompt: (p: string) => void;
  onUploadImage: (url: string) => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onUploadImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 20,
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      border: `2px solid ${thumbnail.imageUrl ? "#FBBF24" : "#E5E7EB"}`,
      display: "grid", gridTemplateColumns: thumbnail.imageUrl ? "180px 1fr" : "1fr", gap: 16,
    }}>
      {thumbnail.imageUrl && (
        <img src={thumbnail.imageUrl} alt="thumbnail" style={{ width: 180, height: 180, objectFit: "cover", borderRadius: 12 }} />
      )}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>🖼️</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>썸네일 (메인 대표 이미지)</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={onGenPrompt} disabled={thumbnail.promptLoading} style={{
            padding: "8px 14px", background: "#EDE9FE", color: "#5B21B6", fontSize: 12, borderRadius: 8,
          }}>
            {thumbnail.promptLoading ? <Spinner /> : "🎯 프롬프트 생성"}
          </button>
          <button className="btn" onClick={onGenImage} disabled={!thumbnail.imagePrompt || thumbnail.imageLoading} style={{
            padding: "8px 14px", background: "#FEF3C7", color: "#92400E", fontSize: 12, borderRadius: 8,
          }}>
            {thumbnail.imageLoading ? <Spinner /> : "✨ 이미지 생성"}
          </button>
          <button className="btn" onClick={() => uploadRef.current?.click()} style={{
            padding: "8px 14px", background: "#F3F4F6", color: "#374151", fontSize: 12, borderRadius: 8,
          }}>📤 업로드</button>
          <input ref={uploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
        </div>
        {thumbnail.imagePrompt && (
          <textarea
            value={thumbnail.imagePrompt}
            onChange={e => onUpdatePrompt(e.target.value)}
            rows={3}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: "1.5px solid #DDD6FE", fontSize: 11,
              color: "#374151", background: "#FAF5FF",
              outline: "none", fontFamily: "monospace", lineHeight: 1.5,
            }}
          />
        )}
      </div>
    </div>
  );
}

function SectionCard({
  sec, onGenCopy, onGenPrompt, onGenImage, onUpdatePrompt, onToggleLock, onUploadImage,
}: {
  sec: Section;
  onGenCopy: () => void;
  onGenPrompt: () => void;
  onGenImage: () => void;
  onUpdatePrompt: (p: string) => void;
  onToggleLock: () => void;
  onUploadImage: (url: string) => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onUploadImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{
      background: "white", borderRadius: 14, padding: 16,
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      border: `1.5px solid ${sec.locked ? "#86EFAC" : sec.imageUrl ? "#FBBF24" : "#E5E7EB"}`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20 }}>{sec.icon}</span>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "#111827" }}>{sec.label}</div>
        <button onClick={onToggleLock} title={sec.locked ? "잠금 해제" : "이 섹션 완료로 잠금"} style={{
          background: sec.locked ? "#D1FAE5" : "transparent",
          border: "none", padding: "4px 8px", borderRadius: 6,
          fontSize: 10, fontWeight: 700, cursor: "pointer",
          color: sec.locked ? "#065F46" : "#9CA3AF",
        }}>{sec.locked ? "🔒" : "🔓"}</button>
      </div>

      {/* Image preview */}
      {sec.imageUrl ? (
        <img src={sec.imageUrl} alt={sec.label} style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", borderRadius: 10 }} />
      ) : (
        <div style={{
          width: "100%", aspectRatio: "4/5", background: "#F3F4F6",
          borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#9CA3AF", fontSize: 11,
        }}>
          {sec.imageLoading ? "이미지 생성 중..." : "이미지 없음"}
        </div>
      )}

      {/* Copy preview */}
      {sec.copy ? (
        <div style={{
          background: "#F0F8FF", borderRadius: 8, padding: "8px 10px",
          fontSize: 11, color: "#1E40AF", maxHeight: 100, overflow: "auto",
          lineHeight: 1.5,
        }}>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
            {JSON.stringify(sec.copy, null, 2).slice(0, 400)}{JSON.stringify(sec.copy).length > 400 ? "..." : ""}
          </pre>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#9CA3AF", padding: "8px 10px", background: "#F9FAFB", borderRadius: 8 }}>
          {sec.copyLoading ? "카피 생성 중..." : "카피 없음"}
        </div>
      )}

      {/* Prompt preview */}
      {sec.imagePrompt && (
        <details>
          <summary style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", cursor: "pointer" }}>이미지 프롬프트 보기</summary>
          <textarea
            value={sec.imagePrompt}
            onChange={e => onUpdatePrompt(e.target.value)}
            rows={4}
            style={{
              width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8,
              border: "1.5px solid #DDD6FE", fontSize: 10,
              color: "#374151", background: "#FAF5FF",
              outline: "none", fontFamily: "monospace", lineHeight: 1.5,
            }}
          />
        </details>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn" onClick={onGenCopy} disabled={sec.copyLoading || sec.locked} style={{
          padding: "6px 10px", background: "#DBEAFE", color: "#1E40AF", fontSize: 11, borderRadius: 6,
        }}>{sec.copyLoading ? <Spinner /> : "✍️ 카피"}</button>
        <button className="btn" onClick={onGenPrompt} disabled={sec.promptLoading || sec.locked} style={{
          padding: "6px 10px", background: "#EDE9FE", color: "#5B21B6", fontSize: 11, borderRadius: 6,
        }}>{sec.promptLoading ? <Spinner /> : "🎯 프롬프트"}</button>
        <button className="btn" onClick={onGenImage} disabled={!sec.imagePrompt || sec.imageLoading || sec.locked} style={{
          padding: "6px 10px", background: "#FEF3C7", color: "#92400E", fontSize: 11, borderRadius: 6,
        }}>{sec.imageLoading ? <Spinner /> : "✨ 이미지"}</button>
        <button className="btn" onClick={() => uploadRef.current?.click()} style={{
          padding: "6px 10px", background: "#F3F4F6", color: "#374151", fontSize: 11, borderRadius: 6,
        }}>📤</button>
        <input ref={uploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
      </div>
    </div>
  );
}

function StatusRow({ icon, label, hasCopy, hasPrompt, hasImage }: {
  icon: string; label: string; hasCopy: boolean; hasPrompt: boolean; hasImage: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 12px", borderRadius: 10,
      background: hasImage ? "#FFFBEB" : hasPrompt ? "#F0FDF4" : "#F9FAFB",
      border: `1px solid ${hasImage ? "#FDE68A" : hasPrompt ? "#BBF7D0" : "#E5E7EB"}`,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#374151" }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        <Badge active={hasCopy} text="C" color="#DBEAFE" textColor="#1E40AF" />
        <Badge active={hasPrompt} text="P" color="#EDE9FE" textColor="#5B21B6" />
        <Badge active={hasImage} text="I" color="#FEF3C7" textColor="#92400E" />
      </div>
    </div>
  );
}

function Badge({ active, text, color, textColor }: { active: boolean; text: string; color: string; textColor: string }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700,
      background: active ? color : "#F3F4F6",
      color: active ? textColor : "#D1D5DB",
    }}>{text}</span>
  );
}

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 12, height: 12,
      border: `2px solid ${light ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)"}`,
      borderTopColor: light ? "white" : "#374151",
      borderRadius: "50%", animation: "spin 0.8s linear infinite",
    }} />
  );
}
