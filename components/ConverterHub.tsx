"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import Link from "next/link";
import { CONVERTERS, EDITOR_KEYS, type ConverterKey } from "@/lib/convertSeo";

const T = "#0EA5E9";
const T2 = "#2563EB";
const MAX = 10;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const CROP_PRESETS = [
  { label: "자유", ratio: null },
  { label: "1:1", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "2:3", ratio: 2 / 3 },
];

interface FItem {
  id: string; file: File; inSize: number;
  status: "pending" | "busy" | "done" | "error";
  outUrl?: string; outName?: string; outSize?: number; error?: string;
}

const fmtSize = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("이미지 로드 실패"));
    img.src = URL.createObjectURL(file);
  });
}

async function canvasConvert(file: File, outType: string, quality: number, maxEdge: number): Promise<Blob> {
  const img = await loadImage(file);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (maxEdge > 0 && Math.max(w, h) > maxEdge) { const s = maxEdge / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  if (outType === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, outType, quality));
  if (!blob) throw new Error("변환 실패");
  return blob;
}

const sameType = (f: File) => (["image/jpeg", "image/png", "image/webp"].includes(f.type) ? f.type : "image/jpeg");
const outName = (f: File, outType: string) => f.name.replace(/\.[^.]+$/, "") + "." + (EXT[outType] || "jpg");

export default function ConverterHub() {
  const [tab, setTab] = useState<ConverterKey>("heic");
  const [files, setFiles] = useState<FItem[]>([]);
  const [combined, setCombined] = useState<{ url: string; name: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  // converter settings
  const [quality, setQuality] = useState(0.9);
  const [outFormat, setOutFormat] = useState<"image/jpeg" | "image/png" | "image/webp">("image/jpeg");
  const [maxEdge, setMaxEdge] = useState(1280);
  const [scale, setScale] = useState<2 | 4>(4);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Crop ──
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropNat, setCropNat] = useState({ w: 0, h: 0 });
  const [cropRect, setCropRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [cropAspect, setCropAspect] = useState<number | null>(null);
  const [cropResult, setCropResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<{ mode: string; sx: number; sy: number; sr: { x: number; y: number; w: number; h: number } } | null>(null);
  const cropUrlRef = useRef<string | null>(null);

  // ── Rotate ──
  const [rotAngle, setRotAngle] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // ── Adjust ──
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  // ── Watermark ──
  const [wmText, setWmText] = useState("");
  const [wmSize, setWmSize] = useState(5);
  const [wmColor, setWmColor] = useState("#ffffff");
  const [wmOpacity, setWmOpacity] = useState(50);
  const [wmPos, setWmPos] = useState(8);

  const cur = CONVERTERS.find(c => c.key === tab)!;
  const isHeic = tab === "heic";
  const isPdf = tab === "pdfmerge";
  const isCombine = tab === "img2pdf" || tab === "pdfmerge";
  const isCrop = tab === "crop";
  const isEditor = EDITOR_KEYS.includes(tab);
  const accept = isHeic ? ".heic,.heif,image/heic,image/heif" : isPdf ? "application/pdf,.pdf" : "image/*";

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    if (p && CONVERTERS.some(c => c.key === p)) setTab(p as ConverterKey);
  }, []);

  const resetAll = () => {
    files.forEach(f => f.outUrl && URL.revokeObjectURL(f.outUrl));
    if (combined) URL.revokeObjectURL(combined.url);
    setFiles([]); setCombined(null);
  };

  const resetEditor = () => {
    if (cropUrlRef.current) { URL.revokeObjectURL(cropUrlRef.current); cropUrlRef.current = null; }
    setCropSrc(null);
    setCropResult(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setCropRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    setCropAspect(null);
    setRotAngle(0); setFlipH(false); setFlipV(false);
    setBrightness(100); setContrast(100); setSaturation(100);
    setWmText(""); setWmSize(5); setWmColor("#ffffff"); setWmOpacity(50); setWmPos(8);
  };

  const switchTab = (k: ConverterKey) => { if (k === tab) return; resetAll(); resetEditor(); setTab(k); };

  const accepts = (f: File) => {
    if (isHeic) return /\.(heic|heif)$/i.test(f.name) || /image\/(heic|heif)/i.test(f.type);
    if (isPdf) return /\.pdf$/i.test(f.name) || f.type === "application/pdf";
    return f.type.startsWith("image/") && !/heic|heif/i.test(f.type);
  };

  // ── Crop helpers ──
  const loadCropImage = (file: File) => {
    if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current);
    const url = URL.createObjectURL(file);
    cropUrlRef.current = url;
    const img = new Image();
    img.onload = () => {
      setCropSrc(url);
      setCropNat({ w: img.naturalWidth, h: img.naturalHeight });
      setCropRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
      setCropAspect(null);
      setCropResult(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    };
    img.onerror = () => alert("이미지 로드 실패");
    img.src = url;
  };

  const applyCropAspect = (ratio: number | null) => {
    setCropAspect(ratio);
    if (!ratio || cropNat.w === 0) { setCropRect({ x: 0.075, y: 0.075, w: 0.85, h: 0.85 }); return; }
    const fr = (ratio * cropNat.h) / cropNat.w;
    const mx = 0.85;
    let w: number, h: number;
    if (fr >= 1) { w = mx; h = mx / fr; } else { h = mx; w = mx * fr; }
    setCropRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const startCropDrag = (e: React.PointerEvent, mode: string) => {
    e.stopPropagation();
    const c = cropContainerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    cropDragRef.current = { mode, sx: (e.clientX - r.left) / r.width, sy: (e.clientY - r.top) / r.height, sr: { ...cropRect } };
    c.setPointerCapture(e.pointerId);
  };

  const onCropPointerMove = (e: React.PointerEvent) => {
    const d = cropDragRef.current;
    if (!d) return;
    const c = cropContainerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const fx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const fy = clamp((e.clientY - r.top) / r.height, 0, 1);
    const dx = fx - d.sx, dy = fy - d.sy;
    const s = d.sr;

    if (d.mode === "move") {
      setCropRect({ x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h), w: s.w, h: s.h });
      return;
    }

    let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
    if (d.mode.includes("e")) nw = Math.max(0.03, s.w + dx);
    if (d.mode.includes("w")) { const dw = Math.min(dx, s.w - 0.03); nx = s.x + dw; nw = s.w - dw; }
    if (d.mode.includes("s")) nh = Math.max(0.03, s.h + dy);
    if (d.mode.includes("n")) { const dh = Math.min(dy, s.h - 0.03); ny = s.y + dh; nh = s.h - dh; }
    if (nx < 0) { nw += nx; nx = 0; }
    if (ny < 0) { nh += ny; ny = 0; }
    if (nx + nw > 1) nw = 1 - nx;
    if (ny + nh > 1) nh = 1 - ny;
    nw = Math.max(0.03, nw); nh = Math.max(0.03, nh);

    if (cropAspect && cropNat.w > 0) {
      const fr = (cropAspect * cropNat.h) / cropNat.w;
      nh = nw / fr;
      if (d.mode.includes("n")) ny = s.y + s.h - nh;
      if (ny < 0) ny = 0;
      if (ny + nh > 1) { nh = 1 - ny; nw = nh * fr; if (d.mode.includes("w")) nx = s.x + s.w - nw; }
      if (nx < 0) nx = 0;
      if (nx + nw > 1) { nw = 1 - nx; nh = nw / fr; }
    }
    setCropRect({ x: nx, y: ny, w: nw, h: nh });
  };

  const onCropPointerUp = (e: React.PointerEvent) => {
    cropDragRef.current = null;
    cropContainerRef.current?.releasePointerCapture(e.pointerId);
  };

  // ── File handling ──
  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter(accepts);
    if (!incoming.length) { alert(isPdf ? "PDF 파일만 가능해요." : isHeic ? "HEIC/HEIF 파일만 가능해요." : "이미지 파일만 가능해요."); return; }

    if (isCrop) {
      files.forEach(f => f.outUrl && URL.revokeObjectURL(f.outUrl));
      const file = incoming[0];
      setFiles([{ id: crypto.randomUUID(), file, inSize: file.size, status: "pending" }]);
      loadCropImage(file);
      return;
    }

    setCombined(null);
    setFiles(prev => {
      const room = MAX - prev.length;
      const take = incoming.slice(0, Math.max(0, room));
      if (incoming.length > room) alert(`한 번에 최대 ${MAX}개까지예요.`);
      return [...prev, ...take.map(f => ({ id: crypto.randomUUID(), file: f, inSize: f.size, status: "pending" as const }))];
    });
  };

  const removeItem = (id: string) => setFiles(prev => {
    const it = prev.find(p => p.id === id); if (it?.outUrl) URL.revokeObjectURL(it.outUrl);
    return prev.filter(p => p.id !== id);
  });

  const optsFor = (f: File): { outType: string; quality: number; maxEdge: number } => {
    if (tab === "compress") return { outType: sameType(f), quality, maxEdge: 0 };
    if (tab === "format") return { outType: outFormat, quality: outFormat === "image/png" ? 1 : quality, maxEdge: 0 };
    if (tab === "resize") return { outType: sameType(f), quality: 0.92, maxEdge };
    return { outType: "image/jpeg", quality, maxEdge: 0 };
  };

  // ── Run ──
  const run = async () => {
    // Crop: single image
    if (isCrop) {
      if (!files.length || busy) return;
      setBusy(true);
      try {
        const img = await loadImage(files[0].file);
        const px = Math.round(cropRect.x * img.naturalWidth);
        const py = Math.round(cropRect.y * img.naturalHeight);
        const pw = Math.max(1, Math.round(cropRect.w * img.naturalWidth));
        const ph = Math.max(1, Math.round(cropRect.h * img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = pw; canvas.height = ph;
        canvas.getContext("2d")!.drawImage(img, px, py, pw, ph, 0, 0, pw, ph);
        URL.revokeObjectURL(img.src);
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png"));
        if (!blob) throw new Error("자르기 실패");
        if (cropResult) URL.revokeObjectURL(cropResult.url);
        setCropResult({ url: URL.createObjectURL(blob), name: files[0].file.name.replace(/\.[^.]+$/, "") + "_crop.png", size: blob.size });
      } catch (e) { alert("자르기 실패: " + (e instanceof Error ? e.message : String(e))); }
      setBusy(false);
      return;
    }

    if (!files.length || busy) return;
    if (tab === "watermark" && !wmText.trim()) { alert("워터마크 텍스트를 입력하세요."); return; }
    if (tab === "rotate" && rotAngle === 0 && !flipH && !flipV) { alert("회전이나 뒤집기를 선택하세요."); return; }
    setBusy(true);
    try {
      if (tab === "upscale") {
        const [{ default: Upscaler }, modelMod] = await Promise.all([
          import("upscaler"),
          scale === 4 ? import("@upscalerjs/esrgan-slim/4x") : import("@upscalerjs/esrgan-slim/2x"),
        ]);
        const upscaler = new Upscaler({ model: modelMod.default });
        for (const it of files) {
          if (it.status === "done") continue;
          setFiles(prev => prev.map(p => p.id === it.id ? { ...p, status: "busy", error: undefined } : p));
          try {
            const img = await loadImage(it.file);
            const dataUrl = await upscaler.upscale(img, { output: "base64", patchSize: 64, padding: 6 });
            URL.revokeObjectURL(img.src);
            const blob = await (await fetch(dataUrl)).blob();
            const url = URL.createObjectURL(blob);
            const nm = it.file.name.replace(/\.[^.]+$/, "") + `_${scale}x.png`;
            setFiles(prev => prev.map(p => p.id === it.id ? { ...p, status: "done", outUrl: url, outName: nm, outSize: blob.size } : p));
          } catch (e) {
            setFiles(prev => prev.map(p => p.id === it.id ? { ...p, status: "error", error: e instanceof Error ? e.message : "실패" } : p));
          }
        }
        try { upscaler.dispose?.(); } catch { /* ignore */ }
      } else if (tab === "img2pdf") {
        const { jsPDF } = await import("jspdf");
        let pdf: InstanceType<typeof jsPDF> | null = null;
        for (const it of files) {
          const img = await loadImage(it.file);
          let w = img.naturalWidth, h = img.naturalHeight;
          const CAP = 1654; if (Math.max(w, h) > CAP) { const s = CAP / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(img.src);
          const dataUrl = c.toDataURL("image/jpeg", 0.9);
          if (!pdf) pdf = new jsPDF({ unit: "px", format: [w, h] });
          else pdf.addPage([w, h]);
          pdf.addImage(dataUrl, "JPEG", 0, 0, w, h);
        }
        const blob = pdf!.output("blob");
        setCombined({ url: URL.createObjectURL(blob), name: "이미지모음.pdf", size: blob.size });
      } else if (tab === "pdfmerge") {
        const { PDFDocument } = await import("pdf-lib");
        const merged = await PDFDocument.create();
        for (const it of files) {
          const src = await PDFDocument.load(await it.file.arrayBuffer());
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        }
        const bytes = await merged.save();
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        setCombined({ url: URL.createObjectURL(blob), name: "합친파일.pdf", size: blob.size });
      } else {
        // per-file: heic, compress, format, resize, rotate, adjust, watermark
        for (const it of files) {
          if (it.status === "done") continue;
          setFiles(prev => prev.map(p => p.id === it.id ? { ...p, status: "busy", error: undefined } : p));
          try {
            let blob: Blob;
            let ot: string = sameType(it.file);

            if (tab === "heic") {
              const heic2any = (await import("heic2any")).default;
              const out = await heic2any({ blob: it.file, toType: "image/jpeg", quality });
              blob = Array.isArray(out) ? out[0] : out;
              ot = "image/jpeg";
            } else if (tab === "rotate") {
              const img = await loadImage(it.file);
              const ow = img.naturalWidth, oh = img.naturalHeight;
              const isOrth = rotAngle === 90 || rotAngle === 270;
              const cw = isOrth ? oh : ow, ch = isOrth ? ow : oh;
              const canvas = document.createElement("canvas");
              canvas.width = cw; canvas.height = ch;
              const ctx = canvas.getContext("2d")!;
              ctx.translate(cw / 2, ch / 2);
              ctx.rotate((rotAngle * Math.PI) / 180);
              if (flipH) ctx.scale(-1, 1);
              if (flipV) ctx.scale(1, -1);
              ctx.drawImage(img, -ow / 2, -oh / 2);
              URL.revokeObjectURL(img.src);
              const b = await new Promise<Blob | null>(r => canvas.toBlob(r, ot, 0.92));
              if (!b) throw new Error("처리 실패");
              blob = b;
            } else if (tab === "adjust") {
              const img = await loadImage(it.file);
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
              const ctx = canvas.getContext("2d")!;
              ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
              ctx.drawImage(img, 0, 0);
              URL.revokeObjectURL(img.src);
              const b = await new Promise<Blob | null>(r => canvas.toBlob(r, ot, 0.92));
              if (!b) throw new Error("처리 실패");
              blob = b;
            } else if (tab === "watermark") {
              const img = await loadImage(it.file);
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(img, 0, 0);
              URL.revokeObjectURL(img.src);
              const fs = Math.round((wmSize / 100) * Math.min(canvas.width, canvas.height));
              ctx.globalAlpha = wmOpacity / 100;
              ctx.font = `bold ${fs}px 'Noto Sans KR', sans-serif`;
              ctx.fillStyle = wmColor;
              const col = wmPos % 3, row = Math.floor(wmPos / 3);
              ctx.textAlign = (["left", "center", "right"] as const)[col];
              ctx.textBaseline = (["top", "middle", "bottom"] as const)[row];
              const pad = fs * 0.5;
              const tx = col === 0 ? pad : col === 1 ? canvas.width / 2 : canvas.width - pad;
              const ty = row === 0 ? pad : row === 1 ? canvas.height / 2 : canvas.height - pad;
              ctx.fillText(wmText, tx, ty);
              ctx.globalAlpha = 1;
              const b = await new Promise<Blob | null>(r => canvas.toBlob(r, ot, 0.92));
              if (!b) throw new Error("처리 실패");
              blob = b;
            } else {
              const o = optsFor(it.file); ot = o.outType;
              blob = await canvasConvert(it.file, o.outType, o.quality, o.maxEdge);
            }

            const url = URL.createObjectURL(blob);
            const sfx = tab === "rotate" ? "_rot" : tab === "adjust" ? "_adj" : tab === "watermark" ? "_wm" : "";
            const nm = sfx ? it.file.name.replace(/\.[^.]+$/, sfx + "." + (EXT[ot] || "jpg")) : outName(it.file, ot);
            setFiles(prev => prev.map(p => p.id === it.id ? { ...p, status: "done", outUrl: url, outName: nm, outSize: blob.size } : p));
          } catch (e) {
            setFiles(prev => prev.map(p => p.id === it.id ? { ...p, status: "error", error: e instanceof Error ? e.message : "실패" } : p));
          }
        }
      }
    } catch (e) { alert("처리 실패: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };

  const dl = (url: string, name: string) => { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); };
  const dlAll = () => files.filter(f => f.status === "done").forEach((f, i) => setTimeout(() => dl(f.outUrl!, f.outName!), i * 250));
  const doneCount = files.filter(f => f.status === "done").length;

  const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #E5E7EB", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" };
  const navLabel = isEditor ? "무료 편집기" : "무료 변환기";

  const runLabel = busy
    ? (tab === "upscale" ? "AI 처리 중... (다소 걸릴 수 있어요)" : "처리 중...")
    : isCombine ? (isPdf ? "🧩 PDF 합치기" : "📄 PDF로 변환")
    : tab === "upscale" ? `🔍 AI 업스케일 (${scale}배)`
    : tab === "rotate" ? "🔃 회전/뒤집기 적용"
    : tab === "adjust" ? "🎨 보정 적용"
    : tab === "watermark" ? "💧 워터마크 적용"
    : "✨ 변환하기";

  return (
    <div style={{ minHeight: "100vh", background: "#F4F8FC", fontFamily: "'Noto Sans KR',-apple-system,sans-serif", color: "#1F2937" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .ch-scroll::-webkit-scrollbar{ height:6px } .ch-scroll::-webkit-scrollbar-thumb{ background:#CBD5E1;border-radius:100px }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 18px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${T},${T2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "white", fontWeight: 800 }}>🔄</div>
          <span style={{ fontSize: 14, fontWeight: 800 }}>AI Studio</span>
        </Link>
        <span style={{ fontSize: 13, fontWeight: 700, color: T }}>{navLabel}</span>
      </nav>

      {/* ── 탭 ── */}
      <div style={{ background: "white", borderBottom: "1px solid #E5E7EB", position: "sticky", top: 56, zIndex: 40 }}>
        <div className="ch-scroll" style={{ maxWidth: 860, margin: "0 auto", display: "flex", gap: 6, overflowX: "auto", padding: "10px 14px", alignItems: "center" }}>
          {CONVERTERS.map((c, i) => {
            const showDivider = i > 0 && EDITOR_KEYS.includes(c.key) && !EDITOR_KEYS.includes(CONVERTERS[i - 1].key);
            return (
              <Fragment key={c.key}>
                {showDivider && <div style={{ width: 1, height: 22, background: "#D1D5DB", margin: "0 2px", flexShrink: 0 }} />}
                <button onClick={() => switchTab(c.key)} style={{ flex: "0 0 auto", padding: "8px 14px", borderRadius: 100, border: "none", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", background: tab === c.key ? `linear-gradient(135deg,${T},${T2})` : "#F1F5F9", color: tab === c.key ? "white" : "#475569" }}>
                  {c.emoji} {c.tab}
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "30px 16px 80px" }}>
        <header style={{ textAlign: "center", marginBottom: 22 }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.3, marginBottom: 10 }}>{cur.h1}</h1>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.75 }}>{cur.intro}</p>
        </header>

        {/* ── 도구 ── */}
        <section style={{ ...card, padding: 22 }}>
          <input ref={fileRef} type="file" accept={accept} multiple={!isCrop} style={{ display: "none" }} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />

          {isCrop && cropSrc ? (
            /* ── Crop 인터랙티브 UI ── */
            <>
              {/* 비율 프리셋 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {CROP_PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyCropAspect(p.ratio)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: cropAspect === p.ratio ? `linear-gradient(135deg,${T},${T2})` : "#F1F5F9", color: cropAspect === p.ratio ? "white" : "#475569" }}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* 캔버스 */}
              <div
                ref={cropContainerRef}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                style={{ position: "relative", maxWidth: 600, margin: "0 auto", userSelect: "none", WebkitUserSelect: "none", touchAction: "none", borderRadius: 10, overflow: "hidden" }}
              >
                <img src={cropSrc} alt="원본" draggable={false} style={{ display: "block", width: "100%", pointerEvents: "none", userSelect: "none" }} />
                {/* 자르기 영역 (box-shadow로 외부 어둡게) */}
                <div
                  onPointerDown={e => startCropDrag(e, "move")}
                  style={{
                    position: "absolute",
                    left: `${cropRect.x * 100}%`, top: `${cropRect.y * 100}%`,
                    width: `${cropRect.w * 100}%`, height: `${cropRect.h * 100}%`,
                    border: "2px solid white", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                    cursor: "move", zIndex: 1,
                  }}
                >
                  {/* 3분할 가이드 */}
                  {[1 / 3, 2 / 3].map(f => (
                    <Fragment key={f}>
                      <div style={{ position: "absolute", left: 0, right: 0, top: `${f * 100}%`, height: 1, background: "rgba(255,255,255,0.25)", pointerEvents: "none" }} />
                      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${f * 100}%`, width: 1, background: "rgba(255,255,255,0.25)", pointerEvents: "none" }} />
                    </Fragment>
                  ))}
                </div>
                {/* 코너 핸들 */}
                {(["nw", "ne", "sw", "se"] as const).map(corner => {
                  const isLeft = corner.includes("w"), isTop = corner.includes("n");
                  return (
                    <div key={corner}
                      onPointerDown={e => { e.stopPropagation(); startCropDrag(e, corner); }}
                      style={{
                        position: "absolute",
                        left: `${(isLeft ? cropRect.x : cropRect.x + cropRect.w) * 100}%`,
                        top: `${(isTop ? cropRect.y : cropRect.y + cropRect.h) * 100}%`,
                        width: 18, height: 18, marginLeft: -9, marginTop: -9,
                        background: "white", borderRadius: "50%", border: `2.5px solid ${T}`,
                        cursor: `${corner}-resize`, zIndex: 3,
                      }}
                    />
                  );
                })}
              </div>

              {/* 크기 정보 */}
              <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "#6B7280" }}>
                {Math.round(cropRect.w * cropNat.w)} × {Math.round(cropRect.h * cropNat.h)} px
              </div>

              {/* 버튼 */}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={() => { resetAll(); resetEditor(); }} style={{ flex: "0 0 auto", padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${T}`, background: "white", color: T, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>🔄 다른 이미지</button>
                <button onClick={run} disabled={busy} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 800, color: "white", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, background: `linear-gradient(135deg,${T},${T2})` }}>
                  {busy ? "처리 중..." : "✂️ 자르기"}
                </button>
              </div>

              {/* 결과 */}
              {cropResult && (
                <div style={{ marginTop: 16, border: `1.5px solid ${T}`, borderRadius: 12, padding: 14, background: "#EFF8FF", textAlign: "center" }}>
                  <img src={cropResult.url} alt="결과" style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, display: "block", margin: "0 auto 10px" }} />
                  <div style={{ fontSize: 13, color: "#4B5563", marginBottom: 10 }}>{cropResult.name} · {fmtSize(cropResult.size)}</div>
                  <button onClick={() => dl(cropResult.url, cropResult.name)} style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: T, color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>⬇ 다운로드</button>
                </div>
              )}
            </>
          ) : (
            /* ── 일반 모드 (배치 + 크롭 미로드) ── */
            <>
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                style={{ border: `2px dashed ${drag ? T : "#D1D5DB"}`, borderRadius: 14, padding: "30px 16px", textAlign: "center", cursor: "pointer", background: drag ? "#EFF8FF" : "#FAFCFF" }}
              >
                <div style={{ fontSize: 32, marginBottom: 6 }}>{isCrop ? "✂️" : isPdf ? "📄" : "🖼️"}</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{isCrop ? "자를 이미지를 끌어다 놓거나 클릭" : isPdf ? "PDF 파일을 끌어다 놓거나 클릭" : "파일을 끌어다 놓거나 클릭"}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 5 }}>
                  {isHeic ? ".heic / .heif" : isPdf ? ".pdf" : "JPG · PNG · WebP"} · 최대 {isCrop ? 1 : MAX}개
                </div>
              </div>

              {/* 설정 */}
              {!isCrop && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 14 }}>
                  {tab === "format" && (
                    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}>출력 포맷
                      <select value={outFormat} onChange={e => setOutFormat(e.target.value as typeof outFormat)} style={{ padding: "7px 10px", border: "1.5px solid #E5E7EB", borderRadius: 9, fontSize: 13, fontFamily: "inherit" }}>
                        <option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option>
                      </select>
                    </label>
                  )}
                  {tab === "upscale" && (
                    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}>확대 배율
                      <select value={scale} onChange={e => setScale(+e.target.value as 2 | 4)} style={{ padding: "7px 10px", border: "1.5px solid #E5E7EB", borderRadius: 9, fontSize: 13, fontFamily: "inherit" }}>
                        <option value={4}>4배 (최대 화질)</option><option value={2}>2배 (빠름)</option>
                      </select>
                    </label>
                  )}
                  {tab === "resize" && (
                    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}>최대 크기
                      <select value={maxEdge} onChange={e => setMaxEdge(+e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid #E5E7EB", borderRadius: 9, fontSize: 13, fontFamily: "inherit" }}>
                        <option value={1920}>1920px</option><option value={1280}>1280px</option><option value={800}>800px</option><option value={640}>640px</option>
                      </select>
                    </label>
                  )}
                  {(tab === "heic" || tab === "compress" || (tab === "format" && outFormat !== "image/png")) && (
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, flex: 1, minWidth: 180 }}>품질 {Math.round(quality * 100)}%
                      <input type="range" min={50} max={100} value={Math.round(quality * 100)} onChange={e => setQuality(+e.target.value / 100)} style={{ flex: 1, accentColor: T }} />
                    </label>
                  )}
                </div>
              )}

              {/* ── 회전 설정 ── */}
              {tab === "rotate" && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>회전</span>
                    {[{ label: "0°", v: 0 }, { label: "90°→", v: 90 }, { label: "180°", v: 180 }, { label: "←90°", v: 270 }].map(o => (
                      <button key={o.v} onClick={() => setRotAngle(o.v)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: rotAngle === o.v ? `linear-gradient(135deg,${T},${T2})` : "#F1F5F9", color: rotAngle === o.v ? "white" : "#475569" }}>{o.label}</button>
                    ))}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={flipH} onChange={e => setFlipH(e.target.checked)} style={{ accentColor: T }} /> 좌우반전
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={flipV} onChange={e => setFlipV(e.target.checked)} style={{ accentColor: T }} /> 상하반전
                  </label>
                </div>
              )}

              {/* ── 보정 설정 ── */}
              {tab === "adjust" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700 }}>밝기 {brightness}%
                    <input type="range" min={50} max={150} value={brightness} onChange={e => setBrightness(+e.target.value)} style={{ flex: 1, accentColor: T }} />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700 }}>대비 {contrast}%
                    <input type="range" min={50} max={150} value={contrast} onChange={e => setContrast(+e.target.value)} style={{ flex: 1, accentColor: T }} />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700 }}>채도 {saturation}%
                    <input type="range" min={0} max={200} value={saturation} onChange={e => setSaturation(+e.target.value)} style={{ flex: 1, accentColor: T }} />
                  </label>
                </div>
              )}

              {/* ── 워터마크 설정 ── */}
              {tab === "watermark" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700 }}>텍스트
                    <input type="text" value={wmText} onChange={e => setWmText(e.target.value)} placeholder="워터마크 텍스트 입력" style={{ flex: 1, padding: "8px 12px", border: "1.5px solid #E5E7EB", borderRadius: 9, fontSize: 13, fontFamily: "inherit" }} />
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}>크기
                      <select value={wmSize} onChange={e => setWmSize(+e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid #E5E7EB", borderRadius: 9, fontSize: 13, fontFamily: "inherit" }}>
                        <option value={3}>작게</option><option value={5}>보통</option><option value={8}>크게</option><option value={12}>아주 크게</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}>색상
                      <input type="color" value={wmColor} onChange={e => setWmColor(e.target.value)} style={{ width: 32, height: 32, border: "1.5px solid #E5E7EB", borderRadius: 6, cursor: "pointer", padding: 2 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, minWidth: 140 }}>투명도 {wmOpacity}%
                      <input type="range" min={10} max={100} value={wmOpacity} onChange={e => setWmOpacity(+e.target.value)} style={{ flex: 1, accentColor: T }} />
                    </label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>위치</span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gap: 3 }}>
                      {Array.from({ length: 9 }, (_, i) => (
                        <button key={i} onClick={() => setWmPos(i)} style={{ width: 28, height: 28, borderRadius: 5, border: wmPos === i ? `2px solid ${T}` : "1.5px solid #E5E7EB", background: wmPos === i ? `${T}15` : "white", cursor: "pointer", fontSize: 11, color: wmPos === i ? T : "#9CA3AF", fontFamily: "inherit" }}>
                          {["↖", "↑", "↗", "←", "·", "→", "↙", "↓", "↘"][i]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === "upscale" && (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "#EFF8FF", border: `1px solid ${T}33`, borderRadius: 10, fontSize: 12, color: "#0C4A6E", lineHeight: 1.6 }}>
                  🤖 AI가 <b>기기 안에서</b> 디테일을 복원해 사진을 키웁니다. 사진은 서버로 전송되지 않아요. 첫 실행 때 AI 모델을 한 번 내려받아 조금 느릴 수 있고, 큰 이미지·4배일수록 시간이 더 걸립니다.
                </div>
              )}

              {/* 파일 목록 */}
              {files.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {files.map(it => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", border: "1px solid #EEF2F6", borderRadius: 10, background: "#FBFDFF" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", fontSize: 17 }}>
                        {it.outUrl && !isCombine ? <img src={it.outUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : isPdf ? "📄" : "🖼️"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.outName || it.file.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{fmtSize(it.inSize)}{it.outSize ? ` → ${fmtSize(it.outSize)}` : ""}{it.status === "busy" && " · 처리 중..."}{it.status === "error" && <span style={{ color: "#DC2626" }}> · 실패</span>}</div>
                      </div>
                      {!isCombine && (it.status === "busy" ? <span style={{ width: 15, height: 15, border: `2px solid ${T}40`, borderTopColor: T, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                        : it.status === "done" ? <button onClick={() => dl(it.outUrl!, it.outName!)} style={{ flexShrink: 0, padding: "6px 11px", borderRadius: 8, border: "none", background: T, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⬇</button> : null)}
                      <button onClick={() => removeItem(it.id)} style={{ flexShrink: 0, background: "none", border: "none", color: "#C0C4CC", fontSize: 16, cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* 결과(combine) */}
              {combined && (
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", border: `1.5px solid ${T}`, borderRadius: 12, background: "#EFF8FF" }}>
                  <span style={{ fontSize: 22 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{combined.name}</div>
                    <div style={{ fontSize: 11, color: "#6B7280" }}>{fmtSize(combined.size)}</div>
                  </div>
                  <button onClick={() => dl(combined.url, combined.name)} style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: T, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>⬇ 다운로드</button>
                </div>
              )}

              {files.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={run} disabled={busy} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 800, color: "white", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, background: `linear-gradient(135deg,${T},${T2})` }}>
                    {runLabel}
                  </button>
                  {!isCombine && doneCount > 0 && <button onClick={dlAll} style={{ flex: "0 0 auto", padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${T}`, background: "white", color: T, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>⬇ 전체 ({doneCount})</button>}
                </div>
              )}
            </>
          )}
        </section>

        {/* ── 전체 SEO/AEO 콘텐츠 ── */}
        <div style={{ marginTop: 30 }}>
          {CONVERTERS.map(c => {
            const isEd = EDITOR_KEYS.includes(c.key);
            return (
              <section key={c.key} id={`c-${c.key}`} style={{ ...card, padding: "24px 22px", marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{c.emoji} {c.h1}</h2>
                <p style={{ fontSize: 13.5, color: "#4B5563", lineHeight: 1.85, marginBottom: 16 }}>{c.intro}</p>
                <div style={{ fontSize: 13, fontWeight: 800, color: T, marginBottom: 8 }}>{isEd ? "편집 방법" : "변환 방법"}</div>
                <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  {c.steps.map((s, i) => (
                    <li key={i} style={{ display: "flex", gap: 12 }}>
                      <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg,${T},${T2})`, color: "white", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                      <div><b style={{ fontSize: 14 }}>{s.name}</b><div style={{ fontSize: 12.5, color: "#6B7280", lineHeight: 1.6 }}>{s.text}</div></div>
                    </li>
                  ))}
                </ol>
                <div style={{ fontSize: 13, fontWeight: 800, color: T, marginBottom: 6 }}>자주 묻는 질문</div>
                {c.faq.map((f, i) => (
                  <details key={i} style={{ borderTop: "1px solid #F1F5F9", padding: "11px 0" }}>
                    <summary style={{ fontSize: 14, fontWeight: 700, cursor: "pointer", listStyle: "none", display: "flex", gap: 7 }}><span style={{ color: T }}>Q.</span>{f.q}</summary>
                    <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.75, marginTop: 8, paddingLeft: 20 }}>{f.a}</p>
                  </details>
                ))}
                {c.key !== tab && (
                  <button onClick={() => { switchTab(c.key); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ marginTop: 14, padding: "9px 16px", borderRadius: 9, border: `1.5px solid ${T}`, background: "white", color: T, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{isEd ? "이 편집기 사용하기 →" : "이 변환기 사용하기 →"}</button>
                )}
              </section>
            );
          })}
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 24, lineHeight: 1.7 }}>
          무료 온라인 변환기 · 편집기 · 모든 처리는 브라우저(기기) 안에서 이뤄져 파일이 외부로 전송되지 않습니다.
        </p>
      </main>
    </div>
  );
}
