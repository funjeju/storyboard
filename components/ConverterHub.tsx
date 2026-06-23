"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { CONVERTERS, type ConverterKey } from "@/lib/convertSeo";

const T = "#0EA5E9";
const T2 = "#2563EB";
const MAX = 10;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

interface FItem {
  id: string; file: File; inSize: number;
  status: "pending" | "busy" | "done" | "error";
  outUrl?: string; outName?: string; outSize?: number; error?: string;
}

const fmtSize = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`;

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
  // settings
  const [quality, setQuality] = useState(0.9);
  const [outFormat, setOutFormat] = useState<"image/jpeg" | "image/png" | "image/webp">("image/jpeg");
  const [maxEdge, setMaxEdge] = useState(1280);
  const fileRef = useRef<HTMLInputElement>(null);

  const cur = CONVERTERS.find(c => c.key === tab)!;
  const isImageInput = tab === "compress" || tab === "format" || tab === "resize" || tab === "img2pdf";
  const isHeic = tab === "heic";
  const isPdf = tab === "pdfmerge";
  const isCombine = tab === "img2pdf" || tab === "pdfmerge";
  const accept = isHeic ? ".heic,.heif,image/heic,image/heif" : isPdf ? "application/pdf,.pdf" : "image/*";

  // 탭에서 ?tab= 읽기
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    if (p && CONVERTERS.some(c => c.key === p)) setTab(p as ConverterKey);
  }, []);

  const resetAll = () => {
    files.forEach(f => f.outUrl && URL.revokeObjectURL(f.outUrl));
    if (combined) URL.revokeObjectURL(combined.url);
    setFiles([]); setCombined(null);
  };
  const switchTab = (k: ConverterKey) => { if (k === tab) return; resetAll(); setTab(k); };

  const accepts = (f: File) => {
    if (isHeic) return /\.(heic|heif)$/i.test(f.name) || /image\/(heic|heif)/i.test(f.type);
    if (isPdf) return /\.pdf$/i.test(f.name) || f.type === "application/pdf";
    return f.type.startsWith("image/") && !/heic|heif/i.test(f.type);
  };

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter(accepts);
    if (!incoming.length) { alert(isPdf ? "PDF 파일만 가능해요." : isHeic ? "HEIC/HEIF 파일만 가능해요." : "이미지 파일만 가능해요."); return; }
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

  const run = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    try {
      if (tab === "img2pdf") {
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
        // per-file (heic, compress, format, resize)
        for (const it of files) {
          if (it.status === "done") continue;
          setFiles(prev => prev.map(p => p.id === it.id ? { ...p, status: "busy", error: undefined } : p));
          try {
            let blob: Blob, ot = "image/jpeg";
            if (tab === "heic") {
              const heic2any = (await import("heic2any")).default;
              const out = await heic2any({ blob: it.file, toType: "image/jpeg", quality });
              blob = Array.isArray(out) ? out[0] : out;
            } else {
              const o = optsFor(it.file); ot = o.outType;
              blob = await canvasConvert(it.file, o.outType, o.quality, o.maxEdge);
            }
            const url = URL.createObjectURL(blob);
            setFiles(prev => prev.map(p => p.id === it.id ? { ...p, status: "done", outUrl: url, outName: outName(it.file, ot), outSize: blob.size } : p));
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

  return (
    <div style={{ minHeight: "100vh", background: "#F4F8FC", fontFamily: "'Noto Sans KR',-apple-system,sans-serif", color: "#1F2937" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .ch-scroll::-webkit-scrollbar{ height:6px } .ch-scroll::-webkit-scrollbar-thumb{ background:#CBD5E1;border-radius:100px }
      `}</style>

      <nav style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 18px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${T},${T2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "white", fontWeight: 800 }}>🔄</div>
          <span style={{ fontSize: 14, fontWeight: 800 }}>AI Studio</span>
        </Link>
        <span style={{ fontSize: 13, fontWeight: 700, color: T }}>무료 변환기</span>
      </nav>

      {/* 탭 (서브메뉴) */}
      <div style={{ background: "white", borderBottom: "1px solid #E5E7EB", position: "sticky", top: 56, zIndex: 40 }}>
        <div className="ch-scroll" style={{ maxWidth: 820, margin: "0 auto", display: "flex", gap: 6, overflowX: "auto", padding: "10px 14px" }}>
          {CONVERTERS.map(c => (
            <button key={c.key} onClick={() => switchTab(c.key)} style={{ flex: "0 0 auto", padding: "8px 14px", borderRadius: 100, border: "none", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", background: tab === c.key ? `linear-gradient(135deg,${T},${T2})` : "#F1F5F9", color: tab === c.key ? "white" : "#475569" }}>
              {c.emoji} {c.tab}
            </button>
          ))}
        </div>
      </div>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "30px 16px 80px" }}>
        <header style={{ textAlign: "center", marginBottom: 22 }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.3, marginBottom: 10 }}>{cur.h1}</h1>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.75 }}>{cur.intro}</p>
        </header>

        {/* 도구 */}
        <section style={{ ...card, padding: 22 }}>
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            style={{ border: `2px dashed ${drag ? T : "#D1D5DB"}`, borderRadius: 14, padding: "30px 16px", textAlign: "center", cursor: "pointer", background: drag ? "#EFF8FF" : "#FAFCFF" }}
          >
            <div style={{ fontSize: 32, marginBottom: 6 }}>{isPdf ? "📄" : "🖼️"}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{isPdf ? "PDF 파일을 끌어다 놓거나 클릭" : "파일을 끌어다 놓거나 클릭"}</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 5 }}>{isHeic ? ".heic / .heif" : isPdf ? ".pdf" : "JPG · PNG · WebP"} · 최대 {MAX}개</div>
          </div>
          <input ref={fileRef} type="file" accept={accept} multiple style={{ display: "none" }} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />

          {/* 설정 */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 14 }}>
            {tab === "format" && (
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}>출력 포맷
                <select value={outFormat} onChange={e => setOutFormat(e.target.value as typeof outFormat)} style={{ padding: "7px 10px", border: "1.5px solid #E5E7EB", borderRadius: 9, fontSize: 13, fontFamily: "inherit" }}>
                  <option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option>
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
                {busy ? "처리 중..." : isCombine ? (isPdf ? "🧩 PDF 합치기" : "📄 PDF로 변환") : "✨ 변환하기"}
              </button>
              {!isCombine && doneCount > 0 && <button onClick={dlAll} style={{ flex: "0 0 auto", padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${T}`, background: "white", color: T, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>⬇ 전체 ({doneCount})</button>}
            </div>
          )}
        </section>

        {/* ── 전체 변환기 SEO/AEO 콘텐츠 (모두 노출 → 검색 색인) ── */}
        <div style={{ marginTop: 30 }}>
          {CONVERTERS.map(c => (
            <section key={c.key} id={`c-${c.key}`} style={{ ...card, padding: "24px 22px", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{c.emoji} {c.h1}</h2>
              <p style={{ fontSize: 13.5, color: "#4B5563", lineHeight: 1.85, marginBottom: 16 }}>{c.intro}</p>
              <div style={{ fontSize: 13, fontWeight: 800, color: T, marginBottom: 8 }}>변환 방법</div>
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
                <details key={i} style={{ borderTop: i === 0 ? "1px solid #F1F5F9" : "1px solid #F1F5F9", padding: "11px 0" }}>
                  <summary style={{ fontSize: 14, fontWeight: 700, cursor: "pointer", listStyle: "none", display: "flex", gap: 7 }}><span style={{ color: T }}>Q.</span>{f.q}</summary>
                  <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.75, marginTop: 8, paddingLeft: 20 }}>{f.a}</p>
                </details>
              ))}
              {c.key !== tab && (
                <button onClick={() => { switchTab(c.key); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ marginTop: 14, padding: "9px 16px", borderRadius: 9, border: `1.5px solid ${T}`, background: "white", color: T, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>이 변환기 사용하기 →</button>
              )}
            </section>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 24, lineHeight: 1.7 }}>
          무료 온라인 변환기 · 모든 변환은 브라우저(기기) 안에서 처리되어 파일이 외부로 전송되지 않습니다.
        </p>
      </main>
    </div>
  );
}
