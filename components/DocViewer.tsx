"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchFileBuffer, parseDocument, previewKind, docToPlainText, sheetToTsv,
  fileIcon, fmtBytes, getExt, MAX_PARSE_BYTES,
  type ParsedDoc, type PreviewKind,
} from "@/lib/docParser";

const P = "#7C3AED";

// ── 복사 버튼 ────────────────────────────────────────────────────────────────
function CopyBtn({ text, label = "복사", small = false }: { text: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard 권한이 없는 환경 폴백
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };
  return (
    <button onClick={copy} style={{
      padding: small ? "4px 10px" : "7px 14px",
      background: done ? "#059669" : "white",
      border: `1.5px solid ${done ? "#059669" : "#D1D5DB"}`,
      borderRadius: 8, fontSize: small ? 11 : 12, fontWeight: 700,
      color: done ? "white" : "#374151", cursor: "pointer",
      whiteSpace: "nowrap", transition: "all 0.15s",
    }}>
      {done ? "✓ 복사됨" : `📋 ${label}`}
    </button>
  );
}

// ── 시트 표 ──────────────────────────────────────────────────────────────────
function SheetTable({ rows }: { rows: string[][] }) {
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);

  const copyCell = (key: string, value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedCell(key);
    setTimeout(() => setCopiedCell(c => (c === key ? null : c)), 1200);
  };

  return (
    <div style={{ overflow: "auto", maxHeight: "100%", border: "1px solid #E5E7EB", borderRadius: 10, background: "white" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: "100%" }}>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              <td style={{
                position: "sticky", left: 0, zIndex: 1, background: "#F3F4F6", color: "#9CA3AF",
                fontSize: 11, padding: "4px 8px", border: "1px solid #E5E7EB", textAlign: "right",
                userSelect: "none",
              }}>{ri + 1}</td>
              {Array.from({ length: cols }, (_, ci) => {
                const key = `${ri}-${ci}`;
                const val = row[ci] ?? "";
                return (
                  <td
                    key={ci}
                    onClick={() => copyCell(key, val)}
                    title={val ? "클릭하면 셀 내용이 복사됩니다" : undefined}
                    style={{
                      padding: "5px 10px", border: "1px solid #E5E7EB",
                      background: copiedCell === key ? "#D1FAE5" : ri === 0 ? "#FAFAFA" : "white",
                      fontWeight: ri === 0 ? 700 : 400, color: "#1F2937",
                      whiteSpace: "pre-wrap", maxWidth: 320, cursor: val ? "pointer" : "default",
                      verticalAlign: "top",
                    }}
                  >{val}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 본문 (오버레이/인라인 공용) ──────────────────────────────────────────────
export function DocContent({ url, name, size = 0 }: { url: string; name: string; size?: number }) {
  const kind: PreviewKind = previewKind(name);
  const [doc, setDoc] = useState<ParsedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSheet, setActiveSheet] = useState(0);

  const tooBig = size > 0 && size > MAX_PARSE_BYTES;
  const parseable = ["sheet", "word", "slide", "hwpx", "hwp", "text"].includes(kind) && !tooBig;

  useEffect(() => {
    if (!parseable) return;
    let alive = true;
    setLoading(true); setError(null); setDoc(null); setActiveSheet(0);
    (async () => {
      try {
        const buf = await fetchFileBuffer(url);
        if (buf.byteLength > MAX_PARSE_BYTES) throw new Error("파일이 너무 커서 미리보기를 건너뜁니다.");
        const parsed = await parseDocument(buf, name);
        if (alive) setDoc(parsed);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "미리보기를 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url, name, parseable]);

  const box: React.CSSProperties = {
    background: "white", borderRadius: 12, padding: "20px 24px", color: "#1F2937",
    height: "100%", overflow: "auto",
  };

  // ── 브라우저 기본 렌더 ─────────────────────────────────────────────────────
  if (kind === "pdf") {
    return <iframe src={url} title={name} style={{ width: "100%", height: "100%", border: "none", borderRadius: 12, background: "white" }} />;
  }
  if (kind === "image") {
    return (
      <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
        <img src={url} alt={name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      </div>
    );
  }
  if (kind === "audio") {
    return <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center" }}><audio controls src={url} style={{ width: "min(100%,460px)" }} /></div>;
  }
  if (kind === "video") {
    return <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}><video controls src={url} style={{ maxWidth: "100%", maxHeight: "100%" }} /></div>;
  }
  if (kind === "gdocs") {
    return (
      <iframe
        src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
        title={name}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: 12, background: "white" }}
        allowFullScreen
      />
    );
  }
  if (!parseable) {
    return (
      <div style={{ ...box, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center" }}>
        <div style={{ fontSize: 56 }}>{fileIcon(name)}</div>
        <div style={{ fontSize: 16, fontWeight: 700, wordBreak: "break-all" }}>{name}</div>
        <div style={{ fontSize: 13, color: "#6B7280" }}>
          {tooBig
            ? `파일이 커서(${fmtBytes(size)}) 미리보기를 제공하지 않습니다.`
            : `.${getExt(name) || "?"} 형식은 미리보기를 지원하지 않습니다.`}
        </div>
        <a href={url} download target="_blank" rel="noreferrer"
          style={{ padding: "10px 22px", background: P, borderRadius: 10, color: "white", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
          ⬇️ 다운로드해서 열기
        </a>
      </div>
    );
  }

  // ── 파싱 상태 ──────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 14 }}>문서를 여는 중...</div>;
  }
  if (error || !doc) {
    return (
      <div style={{ ...box, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>{fileIcon(name)}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#B91C1C" }}>{error ?? "미리보기 실패"}</div>
        <a href={url} download target="_blank" rel="noreferrer"
          style={{ padding: "10px 22px", background: P, borderRadius: 10, color: "white", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
          ⬇️ 원본 다운로드
        </a>
      </div>
    );
  }

  const allText = docToPlainText(doc);

  // ── 스프레드시트 ───────────────────────────────────────────────────────────
  if (doc.kind === "sheets") {
    const sheet = doc.sheets[activeSheet] ?? doc.sheets[0];
    return (
      <div style={{ ...box, display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            {doc.sheets.map((s, i) => (
              <button key={s.name + i} onClick={() => setActiveSheet(i)} style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${i === activeSheet ? P : "#E5E7EB"}`,
                background: i === activeSheet ? "rgba(124,58,237,0.08)" : "white",
                color: i === activeSheet ? P : "#6B7280",
              }}>{s.name}</button>
            ))}
          </div>
          {sheet && <CopyBtn text={sheetToTsv(sheet)} label="이 시트 복사" small />}
          {doc.sheets.length > 1 && <CopyBtn text={allText} label="전체 복사" small />}
        </div>
        {sheet?.truncated && (
          <div style={{ fontSize: 11, color: "#B45309", background: "#FFFBEB", padding: "6px 10px", borderRadius: 8 }}>
            행이 많아 처음 {sheet.rows.length.toLocaleString()}행만 표시합니다. 전체는 원본을 다운로드하세요.
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>{sheet && <SheetTable rows={sheet.rows} />}</div>
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>💡 셀을 클릭하면 그 셀 내용이 복사됩니다.</div>
      </div>
    );
  }

  // ── 슬라이드 ───────────────────────────────────────────────────────────────
  if (doc.kind === "slides") {
    return (
      <div style={{ ...box, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, position: "sticky", top: -20, background: "white", paddingTop: 4, paddingBottom: 8, zIndex: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#6B7280" }}>슬라이드 {doc.slides.length}장 · 텍스트 추출</span>
          <CopyBtn text={allText} label="전체 복사" />
        </div>
        {doc.slides.map(s => (
          <div key={s.no} style={{ border: "1.5px solid #E5E7EB", borderRadius: 12, padding: "14px 16px", background: "#FCFCFD" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: P }}>슬라이드 {s.no}</span>
              {s.lines.length > 0 && <CopyBtn text={s.lines.join("\n")} label="복사" small />}
            </div>
            {s.lines.length ? (
              <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", userSelect: "text" }}>{s.lines.join("\n")}</div>
            ) : (
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>(텍스트 없음 — 이미지 슬라이드일 수 있습니다)</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── DOCX (HTML) ────────────────────────────────────────────────────────────
  if (doc.kind === "html") {
    return (
      <div style={{ ...box }}>
        <div style={{ display: "flex", justifyContent: "flex-end", position: "sticky", top: -20, background: "white", paddingTop: 4, paddingBottom: 10, zIndex: 2 }}>
          <CopyBtn text={doc.text} label="전체 텍스트 복사" />
        </div>
        <div className="docx-body" style={{ fontSize: 15, lineHeight: 1.8, userSelect: "text", maxWidth: 820, margin: "0 auto" }}
          dangerouslySetInnerHTML={{ __html: doc.html }} />
        <style>{`
          .docx-body table { border-collapse: collapse; width: 100%; margin: 12px 0; }
          .docx-body td, .docx-body th { border: 1px solid #E5E7EB; padding: 6px 10px; font-size: 13px; }
          .docx-body img { max-width: 100%; height: auto; }
          .docx-body h1,.docx-body h2,.docx-body h3 { margin: 18px 0 8px; font-weight: 800; }
          .docx-body p { margin: 8px 0; }
          .docx-body ul,.docx-body ol { padding-left: 22px; margin: 8px 0; }
        `}</style>
      </div>
    );
  }

  // ── 일반 텍스트 (hwpx / hwp / txt …) ───────────────────────────────────────
  return (
    <div style={{ ...box }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, position: "sticky", top: -20, background: "white", paddingTop: 4, paddingBottom: 10, zIndex: 2 }}>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          {kind === "hwp" ? "한글(.hwp) 텍스트 추출 — 서식·이미지는 제외됩니다" : `${doc.text.length.toLocaleString()}자`}
        </span>
        <CopyBtn text={doc.text} label="전체 복사" />
      </div>
      <pre style={{
        fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word",
        fontFamily: kind === "text" && ["json", "xml", "js", "ts", "tsx", "py", "css", "sql"].includes(getExt(name))
          ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
        userSelect: "text", margin: 0, maxWidth: 900,
      }}>{doc.text}</pre>
    </div>
  );
}

// ── 전체화면 오버레이 ────────────────────────────────────────────────────────
export default function DocViewer({ url, name, size = 0, onClose }: {
  url: string; name: string; size?: number; onClose: () => void;
}) {
  const handleKey = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }, [onClose]);
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 10000, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#1a1a2e", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
        <span style={{ color: "white", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fileIcon(name)} {name}{size ? ` · ${fmtBytes(size)}` : ""}
        </span>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <a href={url} download target="_blank" rel="noreferrer"
            style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            ⬇️ 다운로드
          </a>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", color: "white", borderRadius: 10, padding: "8px 20px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕ 닫기</button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "16px 16px 20px" }}>
        <DocContent url={url} name={name} size={size} />
      </div>
    </div>
  );
}
