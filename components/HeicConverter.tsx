"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { HEIC_FAQ, HEIC_STEPS } from "@/lib/heicSeo";

const T = "#0EA5E9";
const T2 = "#2563EB";
const MAX = 5;

interface Item {
  id: string;
  file: File;
  outName: string;
  inSize: number;
  status: "pending" | "converting" | "done" | "error";
  url?: string;
  outSize?: number;
  error?: string;
}

const fmtSize = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`;
const isHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/(heic|heif)/i.test(f.type);

export default function HeicConverter() {
  const [items, setItems]   = useState<Item[]>([]);
  const [quality, setQuality] = useState(0.92);
  const [converting, setConverting] = useState(false);
  const [drag, setDrag]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const incoming = Array.from(files).filter(isHeic);
    if (!incoming.length) { alert("HEIC / HEIF 파일만 변환할 수 있어요."); return; }
    setItems(prev => {
      const room = MAX - prev.length;
      if (room <= 0) { alert(`한 번에 최대 ${MAX}장까지만 가능해요.`); return prev; }
      const take = incoming.slice(0, room);
      if (incoming.length > room) alert(`최대 ${MAX}장까지라 ${take.length}장만 추가했어요.`);
      return [...prev, ...take.map(f => ({
        id: crypto.randomUUID(), file: f,
        outName: f.name.replace(/\.(heic|heif)$/i, "") + ".jpg",
        inSize: f.size, status: "pending" as const,
      }))];
    });
  };

  const removeItem = (id: string) => setItems(prev => {
    const it = prev.find(p => p.id === id);
    if (it?.url) URL.revokeObjectURL(it.url);
    return prev.filter(p => p.id !== id);
  });

  const convertOne = async (item: Item) => {
    setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: "converting", error: undefined } : p));
    try {
      const heic2any = (await import("heic2any")).default;
      const out = await heic2any({ blob: item.file, toType: "image/jpeg", quality });
      const blob = Array.isArray(out) ? out[0] : out;
      const url = URL.createObjectURL(blob);
      setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: "done", url, outSize: blob.size } : p));
    } catch (e) {
      setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: "error", error: e instanceof Error ? e.message : "변환 실패" } : p));
    }
  };

  const convertAll = async () => {
    setConverting(true);
    const pending = items.filter(i => i.status === "pending" || i.status === "error");
    for (const it of pending) await convertOne(it);
    setConverting(false);
  };

  const download = (item: Item) => {
    if (!item.url) return;
    const a = document.createElement("a"); a.href = item.url; a.download = item.outName; a.click();
  };
  const downloadAll = () => {
    const done = items.filter(i => i.status === "done");
    done.forEach((it, i) => setTimeout(() => download(it), i * 250));
  };

  const doneCount = items.filter(i => i.status === "done").length;
  const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #E5E7EB", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F8FC", fontFamily: "'Noto Sans KR',-apple-system,sans-serif", color: "#1F2937" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        a { color:inherit; }
      `}</style>

      {/* Nav */}
      <nav style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 20px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${T},${T2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "white", fontWeight: 800 }}>🖼️</div>
          <span style={{ fontSize: 14, fontWeight: 800 }}>AI Studio</span>
        </Link>
        <span style={{ fontSize: 13, fontWeight: 700, color: T }}>HEIC → JPG 변환기</span>
      </nav>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 18px 80px" }}>
        {/* Hero (SEO H1) */}
        <header style={{ textAlign: "center", marginBottom: 28, animation: "fadeUp 0.4s ease both" }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.3, marginBottom: 12 }}>
            HEIC를 JPG로 <span style={{ color: T }}>무료 변환</span>
          </h1>
          <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.8 }}>
            아이폰 HEIC(HEIF) 사진이 컴퓨터·카카오톡·문서에서 안 열리나요?<br />
            <b>설치·회원가입 없이</b> 브라우저에서 바로, <b>한 번에 최대 5장</b>까지 JPG로 변환하세요.<br />
            사진은 서버에 올라가지 않고 <b>내 기기 안에서</b> 안전하게 변환됩니다.
          </p>
        </header>

        {/* Converter */}
        <section style={{ ...card, padding: 22, animation: "fadeUp 0.5s ease both" }}>
          {/* Dropzone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            style={{ border: `2px dashed ${drag ? T : "#D1D5DB"}`, borderRadius: 14, padding: "34px 16px", textAlign: "center", cursor: "pointer", background: drag ? "#EFF8FF" : "#FAFCFF", transition: "all 0.15s" }}
          >
            <div style={{ fontSize: 34, marginBottom: 8 }}>📁</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>HEIC 파일을 끌어다 놓거나 클릭</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 5 }}>.heic / .heif · 한 번에 최대 {MAX}장</div>
          </div>
          <input ref={fileRef} type="file" accept=".heic,.heif,image/heic,image/heif" multiple style={{ display: "none" }} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />

          {/* 품질 */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>JPG 품질 {Math.round(quality * 100)}%</span>
            <input type="range" min={60} max={100} value={Math.round(quality * 100)} onChange={e => setQuality(+e.target.value / 100)} style={{ flex: 1, accentColor: T }} />
          </div>

          {/* 파일 목록 */}
          {items.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(it => (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid #EEF2F6", borderRadius: 10, background: "#FBFDFF" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                    {it.url ? <img src={it.url} alt={it.outName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18 }}>🖼️</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.outName}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                      {fmtSize(it.inSize)}{it.outSize ? ` → ${fmtSize(it.outSize)}` : ""}
                      {it.status === "converting" && " · 변환 중..."}
                      {it.status === "error" && <span style={{ color: "#DC2626" }}> · 변환 실패</span>}
                    </div>
                  </div>
                  {it.status === "converting" ? (
                    <span style={{ width: 16, height: 16, border: `2px solid ${T}40`, borderTopColor: T, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                  ) : it.status === "done" ? (
                    <button onClick={() => download(it)} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "none", background: T, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⬇ JPG</button>
                  ) : (
                    <button onClick={() => convertOne(it)} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${T}`, background: "white", color: T, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>변환</button>
                  )}
                  <button onClick={() => removeItem(it.id)} style={{ flexShrink: 0, background: "none", border: "none", color: "#C0C4CC", fontSize: 16, cursor: "pointer" }}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* 액션 */}
          {items.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={convertAll} disabled={converting || items.every(i => i.status === "done")} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 800, color: "white", cursor: converting ? "wait" : "pointer", opacity: (converting || items.every(i => i.status === "done")) ? 0.6 : 1, background: `linear-gradient(135deg,${T},${T2})`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {converting ? "변환 중..." : "✨ JPG로 변환"}
              </button>
              {doneCount > 0 && (
                <button onClick={downloadAll} style={{ flex: "0 0 auto", padding: "14px 18px", borderRadius: 12, border: `1.5px solid ${T}`, background: "white", color: T, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>⬇ 전체 ({doneCount})</button>
              )}
            </div>
          )}
        </section>

        {/* ── SEO/AEO 본문 ── */}
        <section style={{ ...card, padding: "26px 24px", marginTop: 26 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>HEIC가 뭐길래 사진이 안 열릴까요?</h2>
          <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.85 }}>
            <b>HEIC(HEIF)</b>는 아이폰·아이패드가 iOS 11부터 기본으로 사용하는 고효율 사진 포맷입니다.
            같은 화질에서 JPG보다 용량이 작은 장점이 있지만, <b>윈도우 PC·안드로이드폰·카카오톡·한글/워드 문서·대부분의 웹사이트</b>에서는
            바로 열리지 않습니다. 그래서 아이폰으로 찍은 사진을 다른 곳에 올리거나 보낼 때 <b>JPG로 변환</b>이 필요합니다.
            이 변환기는 그 문제를 <b>설치 없이, 무료로, 1초 만에</b> 해결합니다.
          </p>
        </section>

        <section style={{ ...card, padding: "26px 24px", marginTop: 18 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>HEIC → JPG 변환 방법 (3단계)</h2>
          <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
            {HEIC_STEPS.map((s, i) => (
              <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${T},${T2})`, color: "white", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.7, marginTop: 3 }}>{s.text}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section style={{ ...card, padding: "26px 24px", marginTop: 18 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>이 변환기의 특징</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            {[["💸", "100% 무료", "회원가입·설치 불필요"], ["🔒", "사진 비공개", "서버 업로드 없이 기기 내 변환"], ["🗂️", "한 번에 5장", "여러 장 일괄 변환"], ["⚡", "빠르고 고화질", "JPG 품질 직접 조절"]].map(([ic, t, d]) => (
              <div key={t} style={{ background: "#F8FBFF", border: "1px solid #EEF2F6", borderRadius: 12, padding: "14px" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{ic}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 3, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section style={{ ...card, padding: "26px 24px", marginTop: 18 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>자주 묻는 질문 (FAQ)</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {HEIC_FAQ.map((f, i) => (
              <details key={i} style={{ borderTop: i === 0 ? "none" : "1px solid #F1F5F9", padding: "14px 0" }}>
                <summary style={{ fontSize: 15, fontWeight: 700, cursor: "pointer", listStyle: "none", display: "flex", gap: 8 }}>
                  <span style={{ color: T }}>Q.</span>{f.q}
                </summary>
                <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.8, marginTop: 10, paddingLeft: 22 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <p style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 28, lineHeight: 1.7 }}>
          HEIC JPG 변환기 · 아이폰 HEIC 사진을 JPG로 무료 변환 · 설치 없이 온라인에서 안전하게<br />
          모든 변환은 브라우저(기기) 내부에서 처리되어 사진이 외부로 전송되지 않습니다.
        </p>
      </main>
    </div>
  );
}
