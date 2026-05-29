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

type ModuleCategory = "hook" | "trust" | "product" | "emotional" | "conversion";

type ModuleType =
  | "hero_hook" | "strong_copy" | "problem_statement" | "pain_point"
  | "customer_reviews" | "expert_cert" | "clinical_results" | "origin" | "manufacturing" | "brand_story" | "before_after"
  | "feature_desc" | "ingredient_desc" | "comparison_table" | "usage_guide" | "option_desc" | "faq"
  | "lifestyle_image" | "emotional_copy" | "usage_scenario" | "brand_philosophy"
  | "discount_benefit" | "limited_quantity" | "recommended_bundle" | "cta";

interface Module {
  id: string;
  moduleType: ModuleType;
  label: string;
  icon: string;
  category: ModuleCategory;
  score: number;
  reason: string;
  locked: boolean;
  order: number;
  copy: Record<string, unknown> | null;
  imagePrompt: string;
  imageUrl: string;
  refImageBase64: string;
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
  modules: Module[];
  planStrategy: string;
  updatedAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_LIBRARY: { type: ModuleType; label: string; icon: string; category: ModuleCategory }[] = [
  { type: "hero_hook",          label: "히어로 훅",      icon: "⚡", category: "hook" },
  { type: "strong_copy",        label: "강한 카피",      icon: "💥", category: "hook" },
  { type: "problem_statement",  label: "문제 제기",      icon: "🤔", category: "hook" },
  { type: "pain_point",         label: "Pain Point",    icon: "😣", category: "hook" },
  { type: "customer_reviews",   label: "고객 후기",      icon: "💬", category: "trust" },
  { type: "expert_cert",        label: "전문가 인증",    icon: "🏆", category: "trust" },
  { type: "clinical_results",   label: "임상 결과",      icon: "🔬", category: "trust" },
  { type: "origin",             label: "원산지·산지",    icon: "🌿", category: "trust" },
  { type: "manufacturing",      label: "제조 과정",      icon: "🏭", category: "trust" },
  { type: "brand_story",        label: "브랜드 스토리",  icon: "📖", category: "trust" },
  { type: "before_after",       label: "Before/After",  icon: "✨", category: "trust" },
  { type: "feature_desc",       label: "기능 설명",      icon: "📊", category: "product" },
  { type: "ingredient_desc",    label: "성분 설명",      icon: "🧪", category: "product" },
  { type: "comparison_table",   label: "비교표",         icon: "📋", category: "product" },
  { type: "usage_guide",        label: "사용법",         icon: "📝", category: "product" },
  { type: "option_desc",        label: "옵션 설명",      icon: "🎁", category: "product" },
  { type: "faq",                label: "FAQ",            icon: "❓", category: "product" },
  { type: "lifestyle_image",    label: "라이프스타일",   icon: "🌟", category: "emotional" },
  { type: "emotional_copy",     label: "감성 카피",      icon: "💫", category: "emotional" },
  { type: "usage_scenario",     label: "사용 시나리오",  icon: "🎬", category: "emotional" },
  { type: "brand_philosophy",   label: "브랜드 철학",    icon: "💡", category: "emotional" },
  { type: "discount_benefit",   label: "할인·혜택",      icon: "💰", category: "conversion" },
  { type: "limited_quantity",   label: "한정 수량",      icon: "⏰", category: "conversion" },
  { type: "recommended_bundle", label: "추천 조합",      icon: "🛒", category: "conversion" },
  { type: "cta",                label: "구매하기 CTA",   icon: "🚀", category: "conversion" },
];

const CATEGORY_META: Record<ModuleCategory, { label: string; bg: string; border: string; text: string }> = {
  hook:       { label: "⚡ Hook / 주목 유도", bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" },
  trust:      { label: "🛡️ 신뢰 확보",        bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
  product:    { label: "📊 제품 설명",         bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" },
  emotional:  { label: "✨ 감성 설득",         bg: "#FDF4FF", border: "#DDD6FE", text: "#6B21A8" },
  conversion: { label: "🚀 전환",             bg: "#FFF1F2", border: "#FECDD3", text: "#BE123C" },
};

const TONES: { value: Tone; label: string; desc: string }[] = [
  { value: "premium",     label: "프리미엄",  desc: "고급스럽고 권위있는" },
  { value: "friendly",    label: "친근한",    desc: "따뜻하고 대화체" },
  { value: "urgent",      label: "긴박감",    desc: "FOMO·한정성 강조" },
  { value: "informative", label: "정보형",    desc: "데이터·사실 중심" },
  { value: "emotional",   label: "감성적",    desc: "스토리텔링·공감" },
  { value: "playful",     label: "유쾌한",    desc: "위트·트렌디" },
];

const PLATFORMS: { value: Platform; label: string; icon: string }[] = [
  { value: "smartstore", label: "스마트스토어", icon: "🟢" },
  { value: "coupang",    label: "쿠팡",         icon: "🟡" },
  { value: "wadiz",      label: "와디즈",        icon: "🟠" },
  { value: "shopify",    label: "Shopify",      icon: "🟣" },
  { value: "cafe24",     label: "카페24",        icon: "🔵" },
  { value: "instagram",  label: "인스타그램",    icon: "🌸" },
];

const STEP_LABELS = ["제품 정보", "스타일 DNA", "AI 모듈 전략", "콘텐츠 생성", "내보내기"];

const PROJECTS_KEY = "dpm_projects_v2";
const CURRENT_KEY  = "dpm_current_project_v2";

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadProjectsIndex() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]") as { id: string; name: string; updatedAt: number }[]; }
  catch { return []; }
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
  } catch { /* ignore */ }
}

function loadProject(id: string): ProjectState | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(`dpm_project_${id}`) || "null"); }
  catch { return null; }
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
    modules: [],
    planStrategy: "",
    updatedAt: Date.now(),
  };
}

function moduleFromLibrary(type: ModuleType, order: number, score = 0, reason = ""): Module {
  const def = MODULE_LIBRARY.find(m => m.type === type)!;
  return {
    id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    moduleType: type,
    label: def.label,
    icon: def.icon,
    category: def.category,
    score,
    reason,
    locked: false,
    order,
    copy: null,
    imagePrompt: "",
    imageUrl: "",
    refImageBase64: "",
    copyLoading: false,
    promptLoading: false,
    imageLoading: false,
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

  const [step, setStep]               = useState(0);
  const [project, setProject]         = useState<ProjectState>(() => newProjectState());
  const [projectIndex, setProjectIndex] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ active: false, done: 0, total: 0, label: "" });
  const [researchLoading, setResearchLoading] = useState(false);
  const [dnaLoading, setDnaLoading]   = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [showProjectPanel, setShowProjectPanel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProjectIndex(loadProjectsIndex());
    const loadId = searchParams?.get("load");
    if (loadId && user) {
      getDetailProject(user.uid, loadId).then(cloud => {
        if (cloud) {
          try {
            const parsed: ProjectState = JSON.parse(cloud.projectData);
            setProject(parsed);
            const s = parsed.modules?.length ? 3 : parsed.styleDNA ? 2 : parsed.productInfo.name ? 1 : 0;
            setStep(s);
          } catch { /* ignore */ }
        }
      }).catch(() => {});
    }
    // No auto-load — every page open starts fresh. User explicitly loads via "불러오기".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const toSave = { ...project, updatedAt: Date.now() };
      saveProject(toSave);
      setProjectIndex(loadProjectsIndex());
      if (user) {
        const completedModules = project.modules.filter(m => m.copy !== null).length;
        const totalModules = project.modules.length;
        setCloudSyncing(true);
        upsertDetailProject(user.uid, {
          id: project.id,
          productName: project.productInfo.name || "(이름 없음)",
          platform: project.platform,
          tone: project.tone,
          status: completedModules === totalModules && totalModules > 0 ? "completed" : "in-progress",
          completedSections: completedModules,
          totalSections: totalModules,
          createdAt: project.updatedAt,
          updatedAt: Date.now(),
          projectData: JSON.stringify(toSave),
        }).catch(e => console.warn("Firestore save failed", e))
          .finally(() => setCloudSyncing(false));
      }
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, user]);

  const updateProject  = useCallback((patch: Partial<ProjectState>) => setProject(prev => ({ ...prev, ...patch })), []);
  const updateModule   = useCallback((id: string, patch: Partial<Module>) =>
    setProject(prev => ({ ...prev, modules: prev.modules.map(m => m.id === id ? { ...m, ...patch } : m) })), []);
  const updateThumbnail = useCallback((patch: Partial<Thumbnail>) =>
    setProject(prev => ({ ...prev, thumbnail: { ...prev.thumbnail, ...patch } })), []);

  // ── Project actions ────────────────────────────────────────────────────────

  const startNewProject = () => {
    if (project.productInfo.name && !confirm("현재 프로젝트는 자동 저장됩니다. 새로 시작할까요?")) return;
    setProject(newProjectState()); setStep(0);
  };

  const openProject = (id: string) => {
    const loaded = loadProject(id);
    if (loaded) {
      setProject(loaded);
      setStep(loaded.modules?.length ? 3 : loaded.styleDNA ? 2 : loaded.productInfo.name ? 1 : 0);
    }
  };

  const removeProject = (id: string) => {
    if (!confirm("이 프로젝트를 삭제할까요?")) return;
    deleteProject(id); setProjectIndex(loadProjectsIndex());
    if (project.id === id) { setProject(newProjectState()); setStep(0); }
  };

  // ── Style DNA ──────────────────────────────────────────────────────────────

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setProject(prev => ({
        ...prev,
        refImages: prev.refImages.length < 5 ? [...prev.refImages, ev.target?.result as string] : prev.refImages,
      }));
      reader.readAsDataURL(file);
    });
  };

  const extractDNA = async () => {
    if (!project.refImages.length) return;
    setDnaLoading(true);
    try {
      const { dna } = await callApi<{ dna: StyleDNA }>("/api/style-dna", { images: project.refImages });
      updateProject({ styleDNA: dna });
    } catch (e) { alert("Style DNA 추출 실패: " + String(e)); }
    finally { setDnaLoading(false); }
  };

  // ── Module planning ────────────────────────────────────────────────────────

  const runModulePlan = async () => {
    setPlanLoading(true);
    try {
      const data = await callApi<{ strategy: string; modules: { moduleType: ModuleType; score: number; reason: string }[] }>(
        "/api/module-plan",
        { productInfo: project.productInfo, platform: project.platform, tone: project.tone }
      );
      const modules = data.modules.map((m, i) => moduleFromLibrary(m.moduleType, i, m.score, m.reason));
      updateProject({ modules, planStrategy: data.strategy });
    } catch (e) { alert("모듈 분석 실패: " + String(e)); }
    finally { setPlanLoading(false); }
  };

  const addModule = (type: ModuleType) => {
    const exists = project.modules.some(m => m.moduleType === type);
    if (exists) { alert("이미 추가된 모듈입니다."); return; }
    const order = project.modules.length;
    setProject(prev => ({ ...prev, modules: [...prev.modules, moduleFromLibrary(type, order)] }));
  };

  const removeModule = (id: string) => {
    setProject(prev => ({
      ...prev,
      modules: prev.modules.filter(m => m.id !== id).map((m, i) => ({ ...m, order: i })),
    }));
  };

  const moveModule = (id: string, dir: -1 | 1) => {
    setProject(prev => {
      const arr = [...prev.modules].sort((a, b) => a.order - b.order);
      const idx = arr.findIndex(m => m.id === id);
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...prev, modules: arr.map((m, i) => ({ ...m, order: i })) };
    });
  };

  // ── Research ───────────────────────────────────────────────────────────────

  const runOverallResearch = async () => {
    setResearchLoading(true);
    try {
      const { research } = await callApi<{ research: Record<string, unknown> }>("/api/research", {
        productInfo: project.productInfo,
      });
      updateProject({ overallResearch: research });
    } catch (e) { alert("종합 리서치 실패: " + String(e)); }
    finally { setResearchLoading(false); }
  };

  // ── Per-module generation ──────────────────────────────────────────────────

  const genModuleCopy = async (mod: Module) => {
    updateModule(mod.id, { copyLoading: true });
    try {
      const { copy } = await callApi<{ copy: Record<string, unknown> }>("/api/copy-gen", {
        sectionType: mod.moduleType,
        tone: project.tone,
        productInfo: project.productInfo,
        research: project.overallResearch,
        platform: project.platform,
      });
      updateModule(mod.id, { copy, copyLoading: false });
      return copy;
    } catch (e) { updateModule(mod.id, { copyLoading: false }); throw e; }
  };

  const genModulePrompt = async (mod: Module, copyOverride?: Record<string, unknown> | null) => {
    updateModule(mod.id, { promptLoading: true });
    try {
      const { prompt } = await callApi<{ prompt: string }>("/api/img-prompt", {
        sectionType: mod.moduleType,
        productInfo: project.productInfo,
        styleDNA: project.styleDNA,
        copy: copyOverride ?? mod.copy,
        sectionGuidance: null,
        lockedSectionPrompts: [],
        hasRefImage: !!mod.refImageBase64,
      });
      updateModule(mod.id, { imagePrompt: prompt, promptLoading: false });
      return prompt;
    } catch (e) { updateModule(mod.id, { promptLoading: false }); throw e; }
  };

  const genThumbnailPrompt = async () => {
    updateThumbnail({ promptLoading: true });
    try {
      const { prompt } = await callApi<{ prompt: string }>("/api/img-prompt", {
        sectionType: "thumbnail",
        productInfo: project.productInfo,
        styleDNA: project.styleDNA,
        copy: null, sectionGuidance: null, lockedSectionPrompts: [],
      });
      updateThumbnail({ imagePrompt: prompt, promptLoading: false });
      return prompt;
    } catch (e) { updateThumbnail({ promptLoading: false }); throw e; }
  };

  const genImage = async (prompt: string, target: "thumbnail" | string, refImageBase64?: string) => {
    if (!prompt) return;
    const setLoading = (v: boolean) => target === "thumbnail" ? updateThumbnail({ imageLoading: v }) : updateModule(target, { imageLoading: v });
    setLoading(true);
    try {
      const fullPrompt = project.styleDNA ? `${prompt} Style: ${project.styleDNA.promptBase}` : prompt;
      const body: Record<string, unknown> = { prompt: fullPrompt };
      if (refImageBase64) body.refImageBase64 = refImageBase64;
      const res = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) { setLoading(false); alert("이미지 생성 실패: " + (data.error || `HTTP ${res.status}`)); return; }
      if (target === "thumbnail") updateThumbnail({ imageUrl: data.imageUrl, imageLoading: false });
      else updateModule(target, { imageUrl: data.imageUrl, imageLoading: false });
    } catch (e) { setLoading(false); alert("이미지 생성 실패: " + String(e)); }
  };

  // ── Bulk generation ────────────────────────────────────────────────────────

  const generateAllContent = async () => {
    let research = project.overallResearch;
    const sortedModules = [...project.modules].sort((a, b) => a.order - b.order);
    const total = 1 + sortedModules.length * 2;
    let done = 0;

    if (!research) {
      setBulkProgress({ active: true, done: 0, total, label: "종합 리서치 중..." });
      try {
        const { research: r } = await callApi<{ research: Record<string, unknown> }>("/api/research", { productInfo: project.productInfo });
        research = r; updateProject({ overallResearch: r });
      } catch (e) { setBulkProgress({ active: false, done: 0, total: 0, label: "" }); alert("리서치 실패: " + String(e)); return; }
    }

    done = 1;
    setBulkProgress({ active: true, done, total, label: "썸네일 + 모듈 콘텐츠 생성 중..." });

    const thumbnailTask = (async () => {
      try {
        const { prompt } = await callApi<{ prompt: string }>("/api/img-prompt", {
          sectionType: "thumbnail", productInfo: project.productInfo, styleDNA: project.styleDNA,
          copy: null, sectionGuidance: null, lockedSectionPrompts: [],
        });
        updateThumbnail({ imagePrompt: prompt });
      } catch { /* ignore */ }
      finally { done += 1; setBulkProgress(p => ({ ...p, done })); }
    })();

    const moduleTasks = sortedModules.map(mod => (async () => {
      try {
        const { copy } = await callApi<{ copy: Record<string, unknown> }>("/api/copy-gen", {
          sectionType: mod.moduleType, tone: project.tone, productInfo: project.productInfo, research, platform: project.platform,
        });
        updateModule(mod.id, { copy });
        done += 1; setBulkProgress(p => ({ ...p, done }));
        const { prompt } = await callApi<{ prompt: string }>("/api/img-prompt", {
          sectionType: mod.moduleType, productInfo: project.productInfo, styleDNA: project.styleDNA,
          copy, sectionGuidance: null, lockedSectionPrompts: [],
        });
        updateModule(mod.id, { imagePrompt: prompt });
      } catch { /* ignore */ }
      finally { done += 1; setBulkProgress(p => ({ ...p, done })); }
    })());

    await Promise.all([thumbnailTask, ...moduleTasks]);
    setBulkProgress({ active: false, done: 0, total: 0, label: "" });
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportJSON = () => {
    const data = {
      productInfo: project.productInfo, tone: project.tone, platform: project.platform,
      styleDNA: project.styleDNA, overallResearch: project.overallResearch, planStrategy: project.planStrategy,
      thumbnail: { imagePrompt: project.thumbnail.imagePrompt, hasImage: !!project.thumbnail.imageUrl },
      modules: [...project.modules].sort((a, b) => a.order - b.order).map(m => ({
        moduleType: m.moduleType, label: m.label, score: m.score, reason: m.reason,
        copy: m.copy, imagePrompt: m.imagePrompt, hasImage: !!m.imageUrl, locked: m.locked,
      })),
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `detail-page-${project.productInfo.name || "product"}-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const sortedModules = [...project.modules].sort((a, b) => a.order - b.order);

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
        .mod-row:hover { background: #F8FAFF !important; }
      `}</style>

      {/* Top Nav */}
      <nav style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 32px", height: 44, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 101,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #7C3AED, #EC4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "white" }}>✦</div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>AI Studio</span>
          </a>
          <div style={{ width: 1, height: 16, background: "#E5E7EB" }} />
          {[
            { href: "/storyboard", icon: "🎬", label: "Storyboard" },
            { href: "/suno",       icon: "🎵", label: "Suno Maker" },
            { href: "/metaprompt", icon: "✦",  label: "MetaPrompt" },
            { href: "/detail",     icon: "🛍️", label: "Detail Page" },
            { href: "/autocut",    icon: "✂️", label: "AutoCut" },
          ].map(tool => (
            <a key={tool.href} href={tool.href} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 8, textDecoration: "none",
              background: tool.href === "/detail" ? "#EFF6FF" : "transparent",
              border: tool.href === "/detail" ? "1px solid #BFDBFE" : "1px solid transparent",
              fontSize: 12, fontWeight: 600,
              color: tool.href === "/detail" ? "#2563EB" : "#6B7280",
            }}>
              <span style={{ fontSize: 13 }}>{tool.icon}</span>{tool.label}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user && (
            <span style={{ fontSize: 10, color: cloudSyncing ? "#6B7280" : "#059669" }}>
              {cloudSyncing ? "⏳ 저장 중..." : "☁️ 자동저장됨"}
            </span>
          )}
          <button onClick={startNewProject} style={{ padding: "4px 12px", borderRadius: 8, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            + 새 프로젝트
          </button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowProjectPanel(v => !v)}
              style={{ padding: "4px 12px", borderRadius: 8, background: showProjectPanel ? "#F3F4F6" : "white", color: "#374151", border: "1px solid #E5E7EB", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              📁 불러오기 {projectIndex.length > 0 && `(${projectIndex.length})`}
            </button>
            {showProjectPanel && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 280, background: "white", borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.14)", border: "1px solid #E5E7EB", zIndex: 200, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #F3F4F6", fontSize: 12, fontWeight: 800, color: "#111827" }}>저장된 프로젝트</div>
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {projectIndex.length === 0 ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>저장된 프로젝트 없음</div>
                  ) : projectIndex.map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid #F9FAFB", background: p.id === project.id ? "#EFF6FF" : "white" }}>
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => { openProject(p.id); setShowProjectPanel(false); }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: p.id === project.id ? "#2563EB" : "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{new Date(p.updatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <button onClick={() => removeProject(p.id)} style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 13, padding: "2px 4px", flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {user?.photoURL && <img src={user.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />}
        </div>
      </nav>

      {/* Step Header */}
      <header style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 40px", height: 52, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 44, zIndex: 100,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, #2563EB, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🛍️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>Detail Page Maker</div>
            <div style={{ fontSize: 9, color: "#9CA3AF", letterSpacing: 2, fontWeight: 600 }}>
              {project.productInfo.name ? `프로젝트: ${project.productInfo.name}` : "AI 모듈형 상세페이지"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div onClick={() => i <= step && setStep(i)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 20,
                background: i === step ? "linear-gradient(135deg, #2563EB, #7C3AED)" : i < step ? "#EEF2FF" : "#F3F4F6",
                cursor: i <= step ? "pointer" : "default",
              }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: i === step ? "rgba(255,255,255,0.25)" : i < step ? "#2563EB" : "#D1D5DB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: i < step || i === step ? "white" : "#9CA3AF" }}>
                  {i < step ? "✓" : i + 1}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: i === step ? "white" : i < step ? "#2563EB" : "#9CA3AF" }}>{label}</span>
              </div>
              {i < 4 && <div style={{ width: 12, height: 1, background: "#E5E7EB" }} />}
            </div>
          ))}
        </div>
      </header>

      {/* ── STEP 0: Product Info ── */}
      {step === 0 && (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ animation: "fadeUp 0.4s ease both", display: "grid", gridTemplateColumns: "1fr 260px", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>제품 정보 입력</h2>
              <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 24 }}>AI가 제품에 맞는 최적 모듈 구성을 설계합니다</p>

              <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                  {[
                    { key: "name",           label: "제품명 *",    placeholder: "예) 프리미엄 제주 한라봉" },
                    { key: "category",       label: "카테고리",     placeholder: "예) 농산물·과일" },
                    { key: "price",          label: "판매가",       placeholder: "예) 29,900원" },
                    { key: "targetAudience", label: "타겟 고객",    placeholder: "예) 30-40대 가족, 선물용" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{label}</label>
                      <input
                        value={project.productInfo[key as keyof ProductInfo]}
                        onChange={e => updateProject({ productInfo: { ...project.productInfo, [key]: e.target.value } })}
                        placeholder={placeholder}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, color: "#111827", outline: "none" }}
                      />
                    </div>
                  ))}
                </div>
                {[
                  { key: "keyFeatures", label: "핵심 특징 / 셀링포인트", placeholder: "예) 제주 직송, 13브릭스 이상 당도 보장, 사이즈 선별 포장", rows: 3 },
                  { key: "brandVoice",  label: "브랜드 보이스",           placeholder: "예) 정직한 농가, 가족적인, 신뢰감 있는", rows: 2 },
                ].map(({ key, label, placeholder, rows }) => (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{label}</label>
                    <textarea
                      value={project.productInfo[key as keyof ProductInfo]}
                      onChange={e => updateProject({ productInfo: { ...project.productInfo, [key]: e.target.value } })}
                      placeholder={placeholder} rows={rows}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, color: "#111827", outline: "none" }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ background: "white", borderRadius: 20, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>카피 톤</div>
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
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>플랫폼</div>
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

              <button className="btn" onClick={() => setStep(1)} disabled={!project.productInfo.name} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 15, borderRadius: 14 }}>
                다음: 스타일 DNA →
              </button>
            </div>

            {/* Sidebar */}
            <aside>
              <div style={{ background: "white", borderRadius: 16, padding: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", position: "sticky", top: 110 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>📁 내 프로젝트</div>
                  <button onClick={startNewProject} style={{ padding: "4px 10px", borderRadius: 8, background: "#EFF6FF", color: "#2563EB", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ 새로</button>
                </div>
                <div style={{ maxHeight: 420, overflowY: "auto" }}>
                  {projectIndex.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#9CA3AF", padding: "20px 0", textAlign: "center" }}>저장된 프로젝트 없음</div>
                  ) : projectIndex.map(p => (
                    <div key={p.id} style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 6, background: p.id === project.id ? "#EFF6FF" : "#F9FAFB", border: `1.5px solid ${p.id === project.id ? "#BFDBFE" : "transparent"}`, display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => openProject(p.id)}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: p.id === project.id ? "#2563EB" : "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
                          {new Date(p.updatedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <button onClick={() => removeProject(p.id)} style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, padding: 4 }}>×</button>
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
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px", animation: "fadeUp 0.4s ease both" }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>스타일 DNA</h2>
          <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>레퍼런스 이미지로 비주얼 일관성 추출 (선택, 건너뛸 수 있음)</p>

          <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
            <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #C7D2FE", borderRadius: 16, padding: 32, textAlign: "center", cursor: "pointer", background: "#F5F7FF", marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4338CA", marginBottom: 4 }}>레퍼런스 이미지 업로드</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>최대 5장</div>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleRefImageUpload} />
            </div>
            {project.refImages.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                {project.refImages.map((img, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={img} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} />
                    <button onClick={() => updateProject({ refImages: project.refImages.filter((_, j) => j !== i) })} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#EF4444", border: "none", color: "white", fontSize: 11, cursor: "pointer" }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn" onClick={extractDNA} disabled={!project.refImages.length || dnaLoading} style={{ width: "100%", padding: 12, background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 14, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {dnaLoading ? <><Spinner light /> 분석 중...</> : "🧬 Style DNA 추출"}
            </button>
          </div>

          {project.styleDNA && (
            <div style={{ background: "white", borderRadius: 20, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 18 }}>🧬</span> 추출된 Style DNA</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                {[["조명", project.styleDNA.lighting], ["배경", project.styleDNA.background], ["무드", project.styleDNA.mood], ["구도", project.styleDNA.composition], ["미학", project.styleDNA.aesthetic], ["전체 톤", project.styleDNA.overallTone]].map(([label, value]) => (
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
            <button className="btn" onClick={() => setStep(0)} style={{ flex: 1, padding: 12, background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>← 이전</button>
            <button className="btn" onClick={() => setStep(2)} style={{ flex: 2, padding: 12, background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 14, borderRadius: 12 }}>
              {project.styleDNA ? "AI 모듈 전략으로 →" : "DNA 없이 계속 →"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: AI 모듈 전략 ── */}
      {step === 2 && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px", animation: "fadeUp 0.4s ease both" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 4 }}>AI 모듈 전략</h2>
              <p style={{ fontSize: 14, color: "#6B7280" }}>AI가 제품에 최적화된 상세페이지 구성을 설계합니다</p>
            </div>
            <button className="btn" onClick={runModulePlan} disabled={planLoading || !project.productInfo.name} style={{ padding: "12px 24px", background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 14, borderRadius: 12, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              {planLoading ? <><Spinner light /> 분석 중...</> : project.modules.length ? "🔄 다시 분석" : "🤖 AI 전략 분석 시작"}
            </button>
          </div>

          {project.planStrategy && (
            <div style={{ background: "linear-gradient(135deg, #EFF6FF, #F5F3FF)", border: "1px solid #BFDBFE", borderRadius: 14, padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>💡</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", marginBottom: 2 }}>AI 전략 핵심</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1E40AF" }}>{project.planStrategy}</div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
            {/* Left: Module Library */}
            <div style={{ background: "white", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", height: "fit-content", position: "sticky", top: 110 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 16 }}>📦 모듈 라이브러리</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {(Object.entries(CATEGORY_META) as [ModuleCategory, typeof CATEGORY_META[ModuleCategory]][]).map(([cat, meta]) => (
                  <div key={cat}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: meta.text, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 8, padding: "4px 10px", marginBottom: 8, display: "inline-block" }}>{meta.label}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {MODULE_LIBRARY.filter(m => m.category === cat).map(m => {
                        const inUse = project.modules.some(pm => pm.moduleType === m.type);
                        return (
                          <div key={m.type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: inUse ? "#F0FDF4" : "#F9FAFB", border: `1px solid ${inUse ? "#A7F3D0" : "transparent"}` }}>
                            <span style={{ fontSize: 12, color: inUse ? "#059669" : "#374151", fontWeight: 600 }}>{m.icon} {m.label}</span>
                            <button onClick={() => addModule(m.type)} disabled={inUse} style={{ width: 22, height: 22, borderRadius: 6, background: inUse ? "#D1FAE5" : "#EFF6FF", border: "none", color: inUse ? "#059669" : "#2563EB", fontSize: 14, cursor: inUse ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {inUse ? "✓" : "+"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Selected modules */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
                  📋 현재 페이지 구성 <span style={{ color: "#9CA3AF", fontWeight: 500 }}>({sortedModules.length}개 모듈)</span>
                </div>
                {sortedModules.length > 0 && (
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>↑↓ 순서 변경 · × 삭제</div>
                )}
              </div>

              {sortedModules.length === 0 ? (
                <div style={{ background: "white", borderRadius: 16, padding: "48px 32px", textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#374151", marginBottom: 8 }}>AI 전략 분석을 시작하세요</div>
                  <div style={{ fontSize: 13, color: "#9CA3AF" }}>또는 왼쪽 라이브러리에서 직접 모듈을 추가할 수 있습니다</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sortedModules.map((mod, i) => {
                    const catMeta = CATEGORY_META[mod.category];
                    return (
                      <div key={mod.id} className="mod-row" style={{ background: "white", borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: `1.5px solid ${catMeta.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 20, color: "#9CA3AF", fontWeight: 700, minWidth: 24, textAlign: "center" }}>{i + 1}</div>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: catMeta.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{mod.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{mod.label}</div>
                          {mod.reason && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{mod.reason}</div>}
                        </div>
                        {mod.score > 0 && (
                          <div style={{ padding: "3px 10px", borderRadius: 20, background: mod.score >= 80 ? "#DCFCE7" : mod.score >= 60 ? "#FEF9C3" : "#F3F4F6", fontSize: 12, fontWeight: 700, color: mod.score >= 80 ? "#166534" : mod.score >= 60 ? "#854D0E" : "#6B7280", flexShrink: 0 }}>
                            {mod.score}점
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button onClick={() => moveModule(mod.id, -1)} disabled={i === 0} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #E5E7EB", background: "white", cursor: i === 0 ? "default" : "pointer", fontSize: 12, color: i === 0 ? "#D1D5DB" : "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>↑</button>
                          <button onClick={() => moveModule(mod.id, 1)} disabled={i === sortedModules.length - 1} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #E5E7EB", background: "white", cursor: i === sortedModules.length - 1 ? "default" : "pointer", fontSize: 12, color: i === sortedModules.length - 1 ? "#D1D5DB" : "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>↓</button>
                          <button onClick={() => removeModule(mod.id)} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #FECDD3", background: "#FFF1F2", cursor: "pointer", fontSize: 14, color: "#BE123C", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {sortedModules.length > 0 && (
                <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                  <button className="btn" onClick={() => setStep(1)} style={{ flex: 1, padding: 12, background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>← 이전</button>
                  <button className="btn" onClick={() => setStep(3)} style={{ flex: 2, padding: 12, background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 14, borderRadius: 12 }}>
                    콘텐츠 생성 시작 → ({sortedModules.length}개 모듈)
                  </button>
                </div>
              )}
            </div>
          </div>

          {sortedModules.length === 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="btn" onClick={() => setStep(1)} style={{ padding: "12px 24px", background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>← 이전</button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: Content Generation ── */}
      {step === 3 && (
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
          {/* Research */}
          <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🔍</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>종합 리서치</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>전체 모듈 공통 전략 베이스</div>
                </div>
              </div>
              <button className="btn" onClick={runOverallResearch} disabled={researchLoading} style={{ padding: "10px 20px", background: project.overallResearch ? "#F3F4F6" : "linear-gradient(135deg, #10B981, #059669)", color: project.overallResearch ? "#374151" : "white", fontSize: 13, borderRadius: 10 }}>
                {researchLoading ? <Spinner /> : project.overallResearch ? "🔄 다시 분석" : "🔍 종합 리서치"}
              </button>
            </div>
            {project.overallResearch && (
              <details style={{ background: "#F8FAFC", borderRadius: 10, padding: 12 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, color: "#475569", cursor: "pointer" }}>전략 브리프 보기</summary>
                <pre style={{ fontSize: 11, lineHeight: 1.6, color: "#334155", marginTop: 10, overflow: "auto", maxHeight: 200 }}>{JSON.stringify(project.overallResearch, null, 2)}</pre>
              </details>
            )}
          </div>

          {/* Bulk */}
          <div style={{ background: "linear-gradient(135deg, #2563EB, #7C3AED)", borderRadius: 20, padding: 24, marginBottom: 24, boxShadow: "0 4px 16px rgba(124,58,237,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
              <div style={{ color: "white" }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>⚡ 전체 자동 생성</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  {sortedModules.length}개 모듈 카피 + 이미지 프롬프트 한번에 생성
                </div>
                {bulkProgress.active && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, marginBottom: 6, animation: "pulse 1.5s infinite" }}>{bulkProgress.label} · {bulkProgress.done}/{bulkProgress.total}</div>
                    <div style={{ background: "rgba(0,0,0,0.2)", height: 6, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ background: "white", height: "100%", width: `${(bulkProgress.done / bulkProgress.total) * 100}%`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                )}
              </div>
              <button className="btn" onClick={generateAllContent} disabled={bulkProgress.active || !project.productInfo.name || sortedModules.length === 0} style={{ padding: "16px 28px", background: "white", color: "#7C3AED", fontSize: 14, borderRadius: 12, whiteSpace: "nowrap" }}>
                {bulkProgress.active ? "생성 중..." : "🚀 한번에 생성"}
              </button>
            </div>
          </div>

          {/* Thumbnail */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", letterSpacing: 1, marginBottom: 10, padding: "0 4px" }}>MASTER THUMBNAIL</div>
            <ThumbnailCard
              thumbnail={project.thumbnail}
              onGenPrompt={genThumbnailPrompt}
              onGenImage={() => genImage(project.thumbnail.imagePrompt, "thumbnail")}
              onUpdatePrompt={p => updateThumbnail({ imagePrompt: p })}
              onUploadImage={url => updateThumbnail({ imageUrl: url })}
            />
          </div>

          {/* Module cards */}
          <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", letterSpacing: 1, marginBottom: 10, padding: "0 4px" }}>
            MODULES · {sortedModules.length}개
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {sortedModules.map((mod, i) => (
              <ModuleCard
                key={mod.id}
                mod={mod}
                index={i}
                onGenCopy={() => genModuleCopy(mod).catch(e => alert("카피 실패: " + String(e)))}
                onGenPrompt={() => genModulePrompt(mod).catch(e => alert("프롬프트 실패: " + String(e)))}
                onGenImage={() => genImage(mod.imagePrompt, mod.id, mod.refImageBase64 || undefined)}
                onUpdatePrompt={p => updateModule(mod.id, { imagePrompt: p })}
                onToggleLock={() => updateModule(mod.id, { locked: !mod.locked })}
                onUploadImage={url => updateModule(mod.id, { imageUrl: url })}
                onUploadRefImage={b64 => updateModule(mod.id, { refImageBase64: b64 })}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            <button className="btn" onClick={() => setStep(2)} style={{ flex: 1, padding: 12, background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>← 모듈 구성으로</button>
            <button className="btn" onClick={() => setStep(4)} style={{ flex: 2, padding: 12, background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", fontSize: 14, borderRadius: 12 }}>내보내기 →</button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Export ── */}
      {step === 4 && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>내보내기</h2>
          <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>완성된 콘텐츠를 패키지로 내보냅니다</p>

          <div style={{ background: "white", borderRadius: 20, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 16 }}>완성 상태</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              <StatusRow icon="🖼️" label="썸네일" hasCopy={false} hasPrompt={!!project.thumbnail.imagePrompt} hasImage={!!project.thumbnail.imageUrl} />
              {sortedModules.map(m => (
                <StatusRow key={m.id} icon={m.icon} label={`${m.label}${m.score ? ` (${m.score}점)` : ""}`} hasCopy={!!m.copy} hasPrompt={!!m.imagePrompt} hasImage={!!m.imageUrl} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <button className="btn" onClick={exportJSON} style={{ padding: 16, borderRadius: 14, background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📦 JSON 내보내기</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>전체 데이터 패키지</div>
              </button>
              <button className="btn" onClick={() => {
                const txt = sortedModules.filter(m => m.copy).map(m => `=== ${m.label} ===\n${JSON.stringify(m.copy, null, 2)}`).join("\n\n");
                navigator.clipboard.writeText(txt); alert("클립보드에 복사됐어요!");
              }} style={{ padding: 16, borderRadius: 14, background: "white", border: "1.5px solid #E5E7EB", textAlign: "left", color: "#374151" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📋 카피 텍스트</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>모듈별 텍스트만</div>
              </button>
            </div>
          </div>

          <button className="btn" onClick={() => setStep(3)} style={{ padding: "12px 24px", background: "#F3F4F6", color: "#374151", fontSize: 14, borderRadius: 12 }}>← 콘텐츠 생성으로</button>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ThumbnailCard({ thumbnail, onGenPrompt, onGenImage, onUpdatePrompt, onUploadImage }: {
  thumbnail: Thumbnail; onGenPrompt: () => void; onGenImage: () => void;
  onUpdatePrompt: (p: string) => void; onUploadImage: (url: string) => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);

  const downloadImage = () => {
    if (!thumbnail.imageUrl) return;
    const a = document.createElement("a");
    a.href = thumbnail.imageUrl;
    a.download = `thumbnail-${Date.now()}.png`;
    a.click();
  };

  return (
    <div style={{ background: "white", borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: `2px solid ${thumbnail.imageUrl ? "#FBBF24" : "#E5E7EB"}`, display: "grid", gridTemplateColumns: thumbnail.imageUrl ? "180px 1fr" : "1fr", gap: 16 }}>
      {thumbnail.imageUrl && (
        <div style={{ position: "relative" }}>
          <img src={thumbnail.imageUrl} alt="thumbnail" style={{ width: 180, height: 180, objectFit: "cover", borderRadius: 12 }} />
          <button onClick={downloadImage} style={{ position: "absolute", bottom: 6, right: 6, padding: "4px 9px", borderRadius: 7, background: "rgba(0,0,0,0.55)", border: "none", color: "white", fontSize: 10, fontWeight: 700, cursor: "pointer", backdropFilter: "blur(4px)" }}>⬇️</button>
        </div>
      )}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>🖼️</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>썸네일 (메인 대표 이미지)</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={onGenPrompt} disabled={thumbnail.promptLoading} style={{ padding: "8px 14px", background: "#EDE9FE", color: "#5B21B6", fontSize: 12, borderRadius: 8 }}>
            {thumbnail.promptLoading ? <Spinner /> : "🎯 프롬프트 생성"}
          </button>
          <button className="btn" onClick={onGenImage} disabled={!thumbnail.imagePrompt || thumbnail.imageLoading} style={{ padding: "8px 14px", background: "#FEF3C7", color: "#92400E", fontSize: 12, borderRadius: 8 }}>
            {thumbnail.imageLoading ? <Spinner /> : "✨ 이미지 생성"}
          </button>
          <button className="btn" onClick={() => uploadRef.current?.click()} style={{ padding: "8px 14px", background: "#F3F4F6", color: "#374151", fontSize: 12, borderRadius: 8 }}>📤 업로드</button>
          {thumbnail.imageUrl && (
            <button className="btn" onClick={downloadImage} style={{ padding: "8px 14px", background: "#F0FDF4", color: "#065F46", fontSize: 12, borderRadius: 8, border: "1px solid #A7F3D0" }}>⬇️ 다운로드</button>
          )}
          <input ref={uploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => onUploadImage(ev.target?.result as string); r.readAsDataURL(f); } }} />
        </div>
        {thumbnail.imagePrompt && <textarea value={thumbnail.imagePrompt} onChange={e => onUpdatePrompt(e.target.value)} rows={3} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #DDD6FE", fontSize: 11, color: "#374151", background: "#FAF5FF", outline: "none", fontFamily: "monospace", lineHeight: 1.5 }} />}
      </div>
    </div>
  );
}

function ModuleCard({ mod, index, onGenCopy, onGenPrompt, onGenImage, onUpdatePrompt, onToggleLock, onUploadImage, onUploadRefImage }: {
  mod: Module; index: number; onGenCopy: () => void; onGenPrompt: () => void; onGenImage: () => void;
  onUpdatePrompt: (p: string) => void; onToggleLock: () => void; onUploadImage: (url: string) => void;
  onUploadRefImage: (base64: string) => void;
}) {
  const catMeta = CATEGORY_META[mod.category];
  const uploadRef = useRef<HTMLInputElement>(null);
  const refUploadRef = useRef<HTMLInputElement>(null);

  const downloadImage = () => {
    if (!mod.imageUrl) return;
    const a = document.createElement("a");
    a.href = mod.imageUrl;
    a.download = `${mod.label}-${mod.id}.png`;
    a.click();
  };

  return (
    <div style={{ background: "white", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: `1.5px solid ${mod.locked ? "#86EFAC" : catMeta.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: catMeta.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: catMeta.text, flexShrink: 0 }}>{index + 1}</div>
        <span style={{ fontSize: 18 }}>{mod.icon}</span>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "#111827" }}>{mod.label}</div>
        {mod.score > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: catMeta.text, background: catMeta.bg, padding: "2px 6px", borderRadius: 6 }}>{mod.score}점</span>}
        <button onClick={onToggleLock} style={{ background: mod.locked ? "#D1FAE5" : "transparent", border: "none", padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", color: mod.locked ? "#065F46" : "#9CA3AF" }}>
          {mod.locked ? "🔒" : "🔓"}
        </button>
      </div>

      {mod.imageUrl ? (
        <div style={{ position: "relative" }}>
          <img src={mod.imageUrl} alt={mod.label} style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", borderRadius: 10 }} />
          <button onClick={downloadImage} style={{ position: "absolute", bottom: 8, right: 8, padding: "5px 10px", borderRadius: 8, background: "rgba(0,0,0,0.55)", border: "none", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", backdropFilter: "blur(4px)" }}>⬇️ 저장</button>
        </div>
      ) : (
        <div style={{ width: "100%", aspectRatio: "4/5", background: "#F3F4F6", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 11 }}>
          {mod.imageLoading ? "이미지 생성 중..." : "이미지 없음"}
        </div>
      )}

      {mod.copy ? (
        <div style={{ background: "#F0F8FF", borderRadius: 8, padding: "8px 10px", fontSize: 11, color: "#1E40AF", maxHeight: 100, overflow: "auto", lineHeight: 1.5 }}>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{JSON.stringify(mod.copy, null, 2).slice(0, 400)}{JSON.stringify(mod.copy).length > 400 ? "..." : ""}</pre>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#9CA3AF", padding: "8px 10px", background: "#F9FAFB", borderRadius: 8 }}>
          {mod.copyLoading ? "카피 생성 중..." : "카피 없음"}
        </div>
      )}

      {mod.refImageBase64 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#FFF7ED", borderRadius: 8, border: "1px solid #FED7AA" }}>
          <img src={mod.refImageBase64} alt="ref" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 10, color: "#92400E", fontWeight: 600 }}>참조 이미지 적용됨<br /><span style={{ fontWeight: 400, color: "#B45309" }}>이미지 생성 시 제품 특징 추출</span></div>
          <button onClick={() => onUploadRefImage("")} style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>×</button>
        </div>
      )}

      {mod.imagePrompt && (
        <details>
          <summary style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", cursor: "pointer" }}>이미지 프롬프트 보기</summary>
          <textarea value={mod.imagePrompt} onChange={e => onUpdatePrompt(e.target.value)} rows={4} style={{ width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #DDD6FE", fontSize: 10, color: "#374151", background: "#FAF5FF", outline: "none", fontFamily: "monospace", lineHeight: 1.5 }} />
        </details>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn" onClick={onGenCopy} disabled={mod.copyLoading || mod.locked} style={{ padding: "6px 10px", background: "#DBEAFE", color: "#1E40AF", fontSize: 11, borderRadius: 6 }}>{mod.copyLoading ? <Spinner /> : "✍️ 카피"}</button>
        <button className="btn" onClick={onGenPrompt} disabled={mod.promptLoading || mod.locked} style={{ padding: "6px 10px", background: "#EDE9FE", color: "#5B21B6", fontSize: 11, borderRadius: 6 }}>{mod.promptLoading ? <Spinner /> : "🎯 프롬프트"}</button>
        <button className="btn" onClick={onGenImage} disabled={!mod.imagePrompt || mod.imageLoading || mod.locked} style={{ padding: "6px 10px", background: mod.refImageBase64 ? "#FEF3C7" : "#FEF3C7", color: "#92400E", fontSize: 11, borderRadius: 6, border: mod.refImageBase64 ? "1.5px solid #F59E0B" : "none" }}>{mod.imageLoading ? <Spinner /> : mod.refImageBase64 ? "✨ 이미지 (참조)" : "✨ 이미지"}</button>
        <button className="btn" onClick={() => uploadRef.current?.click()} style={{ padding: "6px 10px", background: "#F3F4F6", color: "#374151", fontSize: 11, borderRadius: 6 }} title="완성 이미지 직접 업로드">📤</button>
        <button className="btn" onClick={() => refUploadRef.current?.click()} style={{ padding: "6px 10px", background: mod.refImageBase64 ? "#FFF7ED" : "#F3F4F6", color: mod.refImageBase64 ? "#92400E" : "#374151", fontSize: 11, borderRadius: 6, border: mod.refImageBase64 ? "1px solid #FED7AA" : "none" }} title="참조 이미지 업로드 (AI가 제품 특징 추출)">📸</button>
        <input ref={uploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => onUploadImage(ev.target?.result as string); r.readAsDataURL(f); } }} />
        <input ref={refUploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => onUploadRefImage(ev.target?.result as string); r.readAsDataURL(f); } }} />
      </div>
    </div>
  );
}

function StatusRow({ icon, label, hasCopy, hasPrompt, hasImage }: { icon: string; label: string; hasCopy: boolean; hasPrompt: boolean; hasImage: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 10, background: hasImage ? "#FFFBEB" : hasPrompt ? "#F0FDF4" : "#F9FAFB", border: `1px solid ${hasImage ? "#FDE68A" : hasPrompt ? "#BBF7D0" : "#E5E7EB"}` }}>
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
  return <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700, background: active ? color : "#F3F4F6", color: active ? textColor : "#D1D5DB" }}>{text}</span>;
}

function Spinner({ light = false }: { light?: boolean }) {
  return <span style={{ display: "inline-block", width: 12, height: 12, border: `2px solid ${light ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)"}`, borderTopColor: light ? "white" : "#374151", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />;
}
