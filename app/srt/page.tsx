"use client";
import { aiFetch } from "@/lib/aiClient";
import AiToolGate from "@/components/AiToolGate";

import { useState, useRef } from "react";
import Link from "next/link";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";

const P = "#7C3AED";
const PINK = "#EC4899";
const BLUE = "#3B82F6";

const MAX_MP3_SIZE = 25 * 1024 * 1024; // OpenAI Whisper API 한도

interface Cue { index: number; time: string; text: string }

// SRT 문자열 → 큐 배열
function parseSrt(srt: string): Cue[] {
  return srt
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split("\n");
      const index = parseInt(lines[0], 10) || 0;
      const time = lines[1] ?? "";
      const text = lines.slice(2).join("\n");
      return { index, time, text };
    })
    .filter(c => c.time.includes("-->"));
}

// 큐 배열 → SRT 문자열 (편집 반영 + 번호 재정렬)
function buildSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${c.time}\n${c.text.trim()}`)
    .join("\n\n");
}

function SrtPageInner() {
  const { user, loading: authLoading, signIn } = useAuth();

  const [mp3File, setMp3File]   = useState<File | null>(null);
  const [txtFile, setTxtFile]   = useState<File | null>(null);
  const [txtMode, setTxtMode]   = useState<"file" | "paste">("file");
  const [txtPaste, setTxtPaste] = useState("");
  const [status, setStatus]     = useState<"idle" | "uploading" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [srtContent, setSrt]    = useState("");
  const [cues, setCues]         = useState<Cue[]>([]);
  const [aligned, setAligned]   = useState(false);
  const [mp3Drag, setMp3Drag]   = useState(false);
  const [txtDrag, setTxtDrag]   = useState(false);
  const mp3Ref = useRef<HTMLInputElement>(null);
  const txtRef = useRef<HTMLInputElement>(null);

  const pickMp3 = (file: File | null) => {
    if (!file) { setMp3File(null); return; }
    if (file.size > MAX_MP3_SIZE) {
      setErrorMsg(`MP3 파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 25MB 이하만 가능합니다.`);
      setStatus("error");
      setMp3File(null);
      return;
    }
    setErrorMsg("");
    setStatus("idle");
    setMp3File(file);
  };

  const handleGenerate = async () => {
    if (!mp3File) return;
    if (!user) { signIn(); return; }
    if (!storage) { setErrorMsg("스토리지 초기화 실패"); setStatus("error"); return; }

    setStatus("uploading");
    setErrorMsg("");
    setSrt("");

    try {
      // 1. Storage 임시 업로드 (Vercel body 한도 우회)
      const ext = mp3File.name.split(".").pop() || "mp3";
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const mp3Path = `srt_temp/${user.uid}/${fileId}`;
      await uploadBytes(storageRef(storage, mp3Path), mp3File, { contentType: mp3File.type || "audio/mpeg" });

      // 2. 가사 (옵션) — 붙여넣기 우선, 없으면 파일
      let txtContent = "";
      if (txtMode === "paste" && txtPaste.trim()) txtContent = txtPaste;
      else if (txtFile) txtContent = await txtFile.text();

      // 3. API 호출
      setStatus("loading");
      const token = await user.getIdToken();
      const res = await aiFetch("/api/srt-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mp3Path, mp3MimeType: mp3File.type || "audio/mpeg", mp3Name: mp3File.name, txtContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "오류가 발생했습니다.");

      const srt = data.srt || "";
      setSrt(srt);
      setCues(parseSrt(srt));
      setAligned(!!data.aligned);
      setStatus("done");
      // 자동 다운로드 제거 — 사용자가 검수·편집 후 직접 다운로드
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const downloadSrt = (content: string) => {
    const blob = new Blob(["﻿" + content], { type: "text/plain; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (mp3File?.name.replace(/\.[^.]+$/, "") || "subtitles") + ".srt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onDrop = (e: React.DragEvent, type: "mp3" | "txt") => {
    e.preventDefault();
    if (type === "mp3") { setMp3Drag(false); pickMp3(e.dataTransfer.files[0] || null); }
    else                { setTxtDrag(false); setTxtFile(e.dataTransfer.files[0] || null); }
  };

  const segmentCount = cues.length;
  const busy = status === "uploading" || status === "loading";
  const hasLyrics = txtMode === "paste" ? txtPaste.trim().length > 0 : !!txtFile;
  // 환각 휴리스틱: 가사 정렬 모드가 아니고, 서로 다른 줄이 절반 이하면 반복 환각 의심
  const uniqueLines = new Set(cues.map(c => c.text.trim()).filter(Boolean)).size;
  const looksHallucinated = !aligned && cues.length >= 4 && uniqueLines <= Math.ceil(cues.length * 0.5);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 32px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none" }}>
            <div style={{ width:32, height:32, borderRadius:9, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"white", fontWeight:800 }}>✦</div>
            <span style={{ fontSize:14, fontWeight:800, color:"#111827" }}>AI Studio</span>
          </Link>
          <div style={{ width:1, height:20, background:"#E5E7EB" }} />
          <span style={{ fontSize:14, fontWeight:700, color:BLUE }}>📝 SRT 자막 생성기</span>
        </div>
        {user && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {user.photoURL && <img src={user.photoURL} alt="" style={{ width:28, height:28, borderRadius:"50%" }} />}
            <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>{user.displayName}</span>
          </div>
        )}
      </nav>

      <main style={{ maxWidth:520, margin:"0 auto", padding:"48px 20px 80px" }}>
        {/* Title */}
        <div style={{ textAlign:"center", marginBottom:32, animation:"fadeUp 0.4s ease both" }}>
          <h1 style={{ fontSize:28, fontWeight:800, color:"#0F172A", letterSpacing:-0.8, marginBottom:10 }}>🎙️ 자막 자동 생성</h1>
          <p style={{ fontSize:14, color:"#6B7280", lineHeight:1.7 }}>
            MP3만으로 자동 생성하거나,<br />
            <b style={{ color:"#2563EB" }}>가사</b>를 함께 넣으면(파일·붙여넣기) 가사 그대로 + 정확한 타이밍으로 정렬돼요
          </p>
        </div>

        {/* Card */}
        <div style={{ background:"white", borderRadius:20, border:"1px solid #E5E7EB", boxShadow:"0 2px 12px rgba(0,0,0,0.05)", overflow:"hidden", animation:"fadeUp 0.5s ease both" }}>
          <div style={{ padding:24, display:"flex", flexDirection:"column", gap:20 }}>

            {/* MP3 */}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ width:20, height:20, borderRadius:"50%", background:BLUE, color:"white", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>1</span>
                <span style={{ fontSize:14, fontWeight:700, color:"#1F2937" }}>MP3 오디오 파일</span>
                <span style={{ marginLeft:"auto", fontSize:10, fontWeight:700, color:BLUE, background:"#EFF6FF", padding:"2px 8px", borderRadius:100 }}>필수</span>
              </div>
              <div
                onClick={() => mp3Ref.current?.click()}
                onDrop={e => onDrop(e, "mp3")}
                onDragOver={e => { e.preventDefault(); setMp3Drag(true); }}
                onDragLeave={() => setMp3Drag(false)}
                style={{ border:`2px dashed ${mp3Drag||mp3File?BLUE:"#E5E7EB"}`, borderRadius:14, padding:mp3File?"16px":"28px 16px", textAlign:"center", cursor:"pointer", background:mp3Drag||mp3File?"#EFF6FF":"transparent", transition:"all 0.15s" }}
              >
                {mp3File ? (
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:22 }}>🎵</span>
                    <div style={{ textAlign:"left", minWidth:0, flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#1D4ED8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mp3File.name}</div>
                      <div style={{ fontSize:12, color:"#60A5FA" }}>{(mp3File.size / 1024 / 1024).toFixed(1)} MB</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setMp3File(null); }} style={{ background:"none", border:"none", color:"#93C5FD", fontSize:18, cursor:"pointer" }}>×</button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize:26, marginBottom:6 }}>🎵</div>
                    <div style={{ fontSize:14, color:"#4B5563", fontWeight:500 }}>클릭하거나 드래그</div>
                    <div style={{ fontSize:12, color:"#9CA3AF", marginTop:4 }}>MP3, WAV, M4A · 최대 25MB</div>
                  </>
                )}
              </div>
              <input ref={mp3Ref} type="file" accept="audio/*" style={{ display:"none" }} onChange={e => pickMp3(e.target.files?.[0] || null)} />
            </div>

            {/* Divider */}
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flex:1, height:1, background:"#F3F4F6" }} />
              <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:700, letterSpacing:1 }}>선택 — 가사 정렬</span>
              <div style={{ flex:1, height:1, background:"#F3F4F6" }} />
            </div>

            {/* 가사 (파일 또는 붙여넣기) */}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ width:20, height:20, borderRadius:"50%", background:hasLyrics?"#10B981":"#D1D5DB", color:"white", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>2</span>
                <span style={{ fontSize:14, fontWeight:700, color:"#1F2937" }}>가사 입력</span>
                <span style={{ marginLeft:"auto", fontSize:10, fontWeight:700, color:"#9CA3AF", background:"#F3F4F6", padding:"2px 8px", borderRadius:100 }}>선택</span>
              </div>

              {/* 입력 방식 토글 */}
              <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                {([["file","📄 파일 업로드"],["paste","✍️ 직접 붙여넣기"]] as const).map(([k,lb]) => (
                  <button key={k} onClick={() => setTxtMode(k)} style={{ flex:1, padding:"8px 0", borderRadius:10, border:`1.5px solid ${txtMode===k?"#10B981":"#E5E7EB"}`, background:txtMode===k?"#F0FDF4":"white", fontSize:12, fontWeight:700, color:txtMode===k?"#15803D":"#6B7280", cursor:"pointer" }}>{lb}</button>
                ))}
              </div>

              {txtMode === "file" ? (
                <>
                  <div
                    onClick={() => txtRef.current?.click()}
                    onDrop={e => onDrop(e, "txt")}
                    onDragOver={e => { e.preventDefault(); setTxtDrag(true); }}
                    onDragLeave={() => setTxtDrag(false)}
                    style={{ border:`2px dashed ${txtDrag||txtFile?"#10B981":"#E5E7EB"}`, borderRadius:14, padding:txtFile?"14px":"20px 16px", textAlign:"center", cursor:"pointer", background:txtDrag||txtFile?"#F0FDF4":"transparent", transition:"all 0.15s" }}
                  >
                    {txtFile ? (
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ fontSize:20 }}>📄</span>
                        <div style={{ textAlign:"left", minWidth:0, flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#15803D", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{txtFile.name}</div>
                          <div style={{ fontSize:12, color:"#4ADE80" }}>{(txtFile.size / 1024).toFixed(0)} KB</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setTxtFile(null); }} style={{ background:"none", border:"none", color:"#86EFAC", fontSize:18, cursor:"pointer" }}>×</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:20, marginBottom:4 }}>📄</div>
                        <div style={{ fontSize:13, color:"#9CA3AF" }}>가사 TXT 드래그 또는 클릭</div>
                        <div style={{ fontSize:11, color:"#CBD5E1", marginTop:3 }}>한 줄에 자막 한 줄씩 넣으면 가장 정확해요</div>
                      </>
                    )}
                  </div>
                  <input ref={txtRef} type="file" accept=".txt,text/plain" style={{ display:"none" }} onChange={e => setTxtFile(e.target.files?.[0] || null)} />
                </>
              ) : (
                <>
                  <textarea
                    value={txtPaste}
                    onChange={e => setTxtPaste(e.target.value)}
                    placeholder={"가사를 붙여넣으세요.\n한 줄에 자막 한 줄씩 넣으면 가장 정확해요.\n\n새벽 카페 창가에 기대어\n희미한 불빛 아래 앉아"}
                    rows={6}
                    style={{ width:"100%", padding:"12px 14px", border:`1.5px solid ${txtPaste.trim()?"#10B981":"#E5E7EB"}`, borderRadius:14, fontSize:13, fontFamily:"inherit", lineHeight:1.7, resize:"vertical", outline:"none", background:txtPaste.trim()?"#F0FDF4":"white" }}
                  />
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:5, fontSize:11, color:"#CBD5E1" }}>
                    <span>줄바꿈 = 자막 줄 단위</span>
                    {txtPaste.trim() && <span style={{ color:"#22C55E", fontWeight:600 }}>{txtPaste.trim().split(/\n/).filter(Boolean).length}줄</span>}
                  </div>
                </>
              )}
            </div>

            {/* Mode */}
            {mp3File && (
              <div style={{ borderRadius:12, padding:"12px 14px", display:"flex", alignItems:"center", gap:10, background:hasLyrics?"#F0FDF4":"#EFF6FF", border:`1px solid ${hasLyrics?"#BBF7D0":"#BFDBFE"}` }}>
                <span style={{ fontSize:18 }}>{hasLyrics ? "✨" : "🎙️"}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:hasLyrics?"#15803D":"#2563EB" }}>{hasLyrics ? "가사 정렬 모드" : "자동 인식 모드"}</div>
                  <div style={{ fontSize:11, color:hasLyrics?"#22C55E":"#60A5FA", marginTop:2 }}>
                    {hasLyrics ? "자막은 가사 원문 그대로, 타이밍만 음원에 맞춰 정렬해요" : "음원을 받아쓰기 합니다 (반주가 크면 정확도가 떨어질 수 있어요)"}
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {status === "error" && (
              <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", color:"#DC2626", borderRadius:12, padding:"12px 14px", fontSize:13, display:"flex", gap:8, lineHeight:1.5, wordBreak:"break-all" }}>
                <span>⚠️</span>{errorMsg}
              </div>
            )}

            {/* Not logged in */}
            {!authLoading && !user && (
              <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", color:"#B45309", borderRadius:12, padding:"12px 14px", fontSize:12, display:"flex", gap:8 }}>
                <span>🔒</span>SRT 자막 생성은 로그인 후 이용 가능합니다.
              </div>
            )}

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={!mp3File || busy || authLoading}
              style={{ width:"100%", padding:"15px", borderRadius:14, border:"none", fontSize:14, fontWeight:700, cursor:(!mp3File||busy)?"not-allowed":"pointer", opacity:(!mp3File||busy||authLoading)?0.5:1, color:"white", background:status==="done"?"#10B981":`linear-gradient(135deg,${BLUE},${P})`, display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:`0 4px 14px rgba(59,130,246,0.3)` }}
            >
              {status === "uploading" ? (<><span style={{ width:16, height:16, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"white", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />파일 업로드 중...</>)
                : status === "loading" ? (<><span style={{ width:16, height:16, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"white", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />자막 생성 중... (1~2분)</>)
                : status === "done" ? "✅ 완료 — 다시 생성하기"
                : !user && !authLoading ? "로그인하고 시작하기"
                : "SRT 자막 파일 생성 →"}
            </button>
          </div>

          {/* Result preview */}
          {status === "done" && srtContent && (
            <div style={{ borderTop:"1px solid #F3F4F6", background:"#F9FAFB", padding:24 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#374151" }}>생성 완료</div>
                  <div style={{ fontSize:11, color:"#9CA3AF", marginTop:2 }}>{segmentCount}개 세그먼트 · 텍스트 클릭하여 수정 가능</div>
                </div>
                <button onClick={() => downloadSrt(buildSrt(cues))} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:10, background:BLUE, color:"white", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>↓ 다운로드</button>
              </div>

              {looksHallucinated && (
                <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12, padding:"12px 14px", marginBottom:12, fontSize:12, color:"#92400E", lineHeight:1.6, display:"flex", gap:8 }}>
                  <span>⚠️</span>
                  <div>
                    <b>같은 문장이 반복돼요 — 음원 받아쓰기가 실패했을 가능성이 높아요.</b><br />
                    반주가 있는 노래는 자동 인식이 부정확해요. <b>가사 TXT</b>를 함께 올려 <b>가사 정렬 모드</b>로 다시 생성하면 가사 그대로 정확히 나와요.
                  </div>
                </div>
              )}
              {aligned && (
                <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:12, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#15803D", display:"flex", gap:8 }}>
                  <span>✅</span><span>가사 정렬 모드 — 제공한 가사 원문에 타이밍을 맞췄어요.</span>
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:420, overflow:"auto", paddingRight:4 }}>
                {cues.map((cue, i) => (
                  <div key={i} style={{ background:"white", borderRadius:10, border:"1px solid #E5E7EB", padding:"10px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:10, fontWeight:800, color:"white", background:BLUE, borderRadius:5, padding:"1px 7px" }}>{i + 1}</span>
                      <span style={{ fontSize:10, color:"#9CA3AF", fontFamily:"'Courier New',monospace" }}>{cue.time}</span>
                    </div>
                    <textarea
                      value={cue.text}
                      onChange={e => {
                        const next = [...cues];
                        next[i] = { ...next[i], text: e.target.value };
                        setCues(next);
                      }}
                      rows={Math.max(1, cue.text.split("\n").length)}
                      style={{ width:"100%", border:"none", outline:"none", resize:"vertical", fontSize:13, lineHeight:1.5, color:"#1F2937", fontFamily:"inherit", background:"transparent" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p style={{ marginTop:28, textAlign:"center", fontSize:11, color:"#9CA3AF" }}>Powered by OpenAI Whisper</p>
      </main>
    </div>
  );
}

export default function SrtPage() {
  return (
    <AiToolGate providers={["openai"]} toolName="SRT 자막 생성기">
      <SrtPageInner />
    </AiToolGate>
  );
}
