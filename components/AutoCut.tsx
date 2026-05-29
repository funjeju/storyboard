"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { uploadVideoFile } from "@/lib/firebaseStorage";
import { v4 as uuidv4 } from "uuid";

const API = process.env.NEXT_PUBLIC_AUTOCUT_API_URL || "";
const P = "#7C3AED";
const PINK = "#EC4899";

type Stage = "idle" | "firebase-upload" | "processing" | "done" | "error";

export default function AutoCut() {
  const [stage, setStage]         = useState<Stage>("idle");
  const [progress, setProgress]   = useState(0);
  const [statusText, setStatus]   = useState("");
  const [jobId, setJobId]         = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [errorMsg, setError]      = useState("");
  const [dragOver, setDragOver]   = useState(false);
  const [file, setFile]           = useState<File | null>(null);
  const [fileSize, setFileSize]   = useState("");

  const fileRef  = useRef<HTMLInputElement>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current); };

  const poll = useCallback((id: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/status/${id}`);
        const data = await res.json();
        setProgress(data.progress ?? 0);
        setStatus(data.status ?? "");
        if (data.done) {
          stopPoll();
          setResultUrl(`${API}/download/${id}`);
          setStage("done");
        } else if (data.error) {
          stopPoll();
          setError(data.error);
          setStage("error");
        }
      } catch { /* retry next tick */ }
    }, 2000);
  }, []);

  const process = async (f: File) => {
    if (!API) { setError("NEXT_PUBLIC_AUTOCUT_API_URL 환경변수가 설정되지 않았습니다."); setStage("error"); return; }
    setFile(f);
    setFileSize(formatBytes(f.size));
    setError("");
    setResultUrl("");
    setProgress(0);

    try {
      // Phase 1: Upload to Firebase Storage
      setStage("firebase-upload");
      setStatus("Firebase Storage 업로드 중...");

      const jobId = uuidv4();
      const { url } = await uploadVideoFile(jobId, f, pct => {
        setProgress(pct);
        setStatus(`업로드 중... ${pct}%`);
      });

      // Phase 2: Send URL to Railway
      setStage("processing");
      setStatus("처리 시작 중...");
      setProgress(0);

      const res = await fetch(`${API}/process-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, filename: f.name, job_id: jobId }),
      });
      const data = await res.json();
      if (!data.job_id) throw new Error("job_id 없음: " + JSON.stringify(data));
      setJobId(data.job_id);
      poll(data.job_id);
    } catch (e) {
      setError(String(e));
      setStage("error");
    }
  };

  const handleFile = (f: File) => {
    if (!f.type.startsWith("video/")) { alert("영상 파일만 업로드 가능합니다."); return; }
    process(f);
  };

  const reset = () => {
    stopPoll();
    setStage("idle"); setProgress(0); setStatus("");
    setJobId(""); setResultUrl(""); setError(""); setFile(null); setFileSize("");
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F8F5FF", fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #EDE9FE", padding:"0 32px", height:52, display:"flex", alignItems:"center", gap:16, position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(124,58,237,0.06)" }}>
        <Link href="/" style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none" }}>
          <div style={{ width:28, height:28, borderRadius:8, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"white", fontWeight:800 }}>✦</div>
          <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>AI Studio</span>
        </Link>
        <div style={{ width:1, height:16, background:"#E5E7EB" }} />
        <span style={{ fontSize:13, fontWeight:700, color:P }}>✂️ AutoCut</span>
      </nav>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"60px 24px 80px" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:48, animation:"fadeUp 0.4s ease both" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 18px", background:"rgba(124,58,237,0.07)", border:"1px solid rgba(124,58,237,0.15)", borderRadius:100, fontSize:11, fontWeight:700, color:P, letterSpacing:1.5, marginBottom:24 }}>
            ✦ AI 자동 컷편집
          </div>
          <h1 style={{ fontSize:36, fontWeight:800, color:"#0F172A", letterSpacing:-1, lineHeight:1.2, marginBottom:14 }}>
            영상 업로드 한 번으로<br />
            <span style={{ background:`linear-gradient(135deg,${P},${PINK})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>초벌편집 + 자막</span> 완성
          </h1>
          <p style={{ fontSize:15, color:"#6B7280", lineHeight:1.7 }}>
            Whisper 음성인식 → AI 컷플랜 → FFmpeg 편집 → 자막 삽입<br />
            파일 크기 제한 없음 · Firebase Storage 경유
          </p>
        </div>

        {/* IDLE */}
        {stage === "idle" && (
          <div
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            style={{ border:`2px dashed ${dragOver ? P : "#DDD6FE"}`, borderRadius:24, padding:"64px 40px", textAlign:"center", cursor:"pointer", background:dragOver?"rgba(124,58,237,0.04)":"white", transition:"all 0.2s", boxShadow:"0 2px 16px rgba(124,58,237,0.06)", animation:"fadeUp 0.4s ease both" }}>
            <input ref={fileRef} type="file" accept="video/*" style={{ display:"none" }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            <div style={{ fontSize:52, marginBottom:16 }}>🎬</div>
            <div style={{ fontSize:18, fontWeight:700, color:"#1F2937", marginBottom:8 }}>영상을 드래그하거나 클릭해서 업로드</div>
            <div style={{ fontSize:13, color:"#9CA3AF" }}>MP4, MOV, AVI 지원 · 크기 제한 없음</div>
            <div style={{ marginTop:28, display:"inline-block", padding:"12px 32px", background:`linear-gradient(135deg,${P},${PINK})`, borderRadius:12, fontSize:14, fontWeight:700, color:"white", boxShadow:`0 4px 16px rgba(124,58,237,0.3)` }}>
              파일 선택
            </div>
          </div>
        )}

        {/* FIREBASE UPLOAD */}
        {stage === "firebase-upload" && (
          <div style={{ background:"white", borderRadius:24, border:"1px solid #EDE9FE", padding:"48px 40px", textAlign:"center", boxShadow:"0 4px 24px rgba(124,58,237,0.08)", animation:"fadeUp 0.4s ease both" }}>
            <div style={{ fontSize:48, marginBottom:20 }}>☁️</div>
            <div style={{ fontSize:18, fontWeight:700, color:"#1F2937", marginBottom:6 }}>Firebase Storage 업로드 중</div>
            {file && <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:4 }}>{file.name}</div>}
            {fileSize && <div style={{ fontSize:12, color:"#9CA3AF", marginBottom:28 }}>{fileSize}</div>}
            <div style={{ background:"#EDE9FE", borderRadius:100, height:10, overflow:"hidden", marginBottom:12 }}>
              <div style={{ height:"100%", width:`${progress}%`, background:`linear-gradient(90deg,${P},${PINK})`, borderRadius:100, transition:"width 0.3s ease" }} />
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:P }}>{progress}%</div>
            <div style={{ marginTop:16, fontSize:12, color:"#9CA3AF" }}>대용량 파일도 안전하게 업로드됩니다</div>
          </div>
        )}

        {/* PROCESSING */}
        {stage === "processing" && (
          <div style={{ background:"white", borderRadius:24, border:"1px solid #EDE9FE", padding:"48px 40px", textAlign:"center", boxShadow:"0 4px 24px rgba(124,58,237,0.08)", animation:"fadeUp 0.4s ease both" }}>
            <div style={{ fontSize:48, marginBottom:20, animation:"pulse 1.5s ease infinite" }}>⚙️</div>
            <div style={{ fontSize:18, fontWeight:700, color:"#1F2937", marginBottom:6 }}>{statusText || "AI 처리 중..."}</div>
            {file && <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:28 }}>{file.name} · {fileSize}</div>}
            <div style={{ background:"#EDE9FE", borderRadius:100, height:10, overflow:"hidden", marginBottom:12 }}>
              <div style={{ height:"100%", width:`${progress}%`, background:`linear-gradient(90deg,${P},${PINK})`, borderRadius:100, transition:"width 0.6s ease" }} />
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:P }}>{progress}%</div>
            <div style={{ marginTop:32, display:"flex", flexDirection:"column", gap:10 }}>
              {[
                { label:"영상 다운로드", done: progress >= 10 },
                { label:"음성 추출", done: progress >= 20 },
                { label:"Whisper 음성인식", done: progress >= 50 },
                { label:"AI 컷플랜 분석", done: progress >= 65 },
                { label:"FFmpeg 컷편집", done: progress >= 80 },
                { label:"자막 삽입", done: progress >= 95 },
              ].map(s => (
                <div key={s.label} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", background:s.done?"rgba(16,185,129,0.06)":"rgba(124,58,237,0.03)", borderRadius:10, border:`1px solid ${s.done?"rgba(16,185,129,0.2)":"rgba(124,58,237,0.08)"}` }}>
                  <span style={{ fontSize:14 }}>{s.done ? "✅" : "⏳"}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:s.done?"#059669":"#6B7280" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DONE */}
        {stage === "done" && (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            <div style={{ background:"white", borderRadius:24, border:"1px solid #EDE9FE", overflow:"hidden", boxShadow:"0 4px 24px rgba(124,58,237,0.1)" }}>
              <div style={{ background:`linear-gradient(135deg,${P},${PINK})`, padding:"20px 32px", display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:24 }}>✅</span>
                <span style={{ fontSize:17, fontWeight:800, color:"white" }}>편집 완료!</span>
              </div>
              <div style={{ padding:"32px" }}>
                <video controls style={{ width:"100%", borderRadius:14, background:"black", marginBottom:24 }}>
                  <source src={resultUrl} type="video/mp4" />
                </video>
                <div style={{ display:"flex", gap:12 }}>
                  <a href={resultUrl} download="autocut_result.mp4" style={{ flex:1, padding:"14px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:14, fontSize:15, fontWeight:700, color:"white", textAlign:"center", textDecoration:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:`0 4px 16px rgba(124,58,237,0.3)` }}>
                    ⬇️ MP4 다운로드
                  </a>
                  <button onClick={reset} style={{ flex:1, padding:"14px", background:"white", border:"2px solid #E5E7EB", borderRadius:14, fontSize:15, fontWeight:700, color:"#374151", cursor:"pointer" }}>
                    ↺ 새 영상 편집
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {stage === "error" && (
          <div style={{ background:"white", borderRadius:24, border:"1.5px solid #FCA5A5", padding:"40px", textAlign:"center", animation:"fadeUp 0.4s ease both" }}>
            <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#DC2626", marginBottom:8 }}>처리 중 오류가 발생했습니다</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24, background:"#FEF2F2", borderRadius:10, padding:"12px 16px", textAlign:"left", wordBreak:"break-all" }}>{errorMsg}</div>
            <button onClick={reset} style={{ padding:"12px 32px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:12, color:"white", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
