"use client";

import { useState, useRef } from "react";
import Link from "next/link";

const P = "#7C3AED";
const PINK = "#EC4899";
const TEAL = "#0EA5E9";

export default function SrtMaker() {
  const [text, setText]       = useState("");
  const [srt, setSrt]         = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [copied, setCopied]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const charCount = text.length;

  const generate = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");
    setSrt("");
    try {
      const res = await fetch("/api/srt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSrt(data.srt || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setText((e.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const copy = () => {
    if (!srt) return;
    navigator.clipboard.writeText(srt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    if (!srt) return;
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subtitle_${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setText(""); setSrt(""); setError(""); };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFF", fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        textarea:focus { outline:none; border-color:${P}!important; }
        @media(max-width:860px){ .srt-grid { grid-template-columns:1fr!important; } }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 32px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none" }}>
            <div style={{ width:32, height:32, borderRadius:9, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"white", fontWeight:800 }}>✦</div>
            <span style={{ fontSize:14, fontWeight:800, color:"#111827" }}>AI Studio</span>
          </Link>
          <div style={{ width:1, height:20, background:"#E5E7EB" }} />
          <span style={{ fontSize:14, fontWeight:700, color:TEAL }}>📝 SRT 자막 생성기</span>
        </div>
      </nav>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"40px 24px 80px" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:36, animation:"fadeUp 0.4s ease both" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 16px", background:"rgba(14,165,233,0.08)", border:"1px solid rgba(14,165,233,0.18)", borderRadius:100, fontSize:11, fontWeight:700, color:TEAL, letterSpacing:1.5, marginBottom:18 }}>
            📝 SUBTITLE GENERATOR
          </div>
          <h1 style={{ fontSize:34, fontWeight:800, color:"#0F172A", letterSpacing:-1, lineHeight:1.2, marginBottom:12 }}>
            대본을 붙여넣으면<br />
            <span style={{ background:`linear-gradient(135deg,${TEAL},${P})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>타이밍 맞춘 SRT 자막</span> 완성
          </h1>
          <p style={{ fontSize:15, color:"#6B7280", lineHeight:1.7 }}>
            스크립트·대본·받아쓰기 텍스트를 넣으면 AI가 자동으로 타임코드를 입혀<br />
            바로 사용 가능한 .srt 자막 파일로 만들어드립니다
          </p>
        </div>

        {/* Two-pane */}
        <div className="srt-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, animation:"fadeUp 0.5s ease both" }}>

          {/* Input */}
          <div style={{ background:"white", borderRadius:20, border:"1px solid #E5E7EB", overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.05)", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:14, fontWeight:700, color:"#374151" }}>📄 대본 입력</span>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, color:"#9CA3AF" }}>{charCount.toLocaleString()}자</span>
                <input ref={fileRef} type="file" accept=".txt,.srt,.vtt,text/plain" style={{ display:"none" }} onChange={e => { if(e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                <button onClick={() => fileRef.current?.click()} style={{ padding:"5px 12px", background:"#F3F4F6", border:"none", borderRadius:8, fontSize:12, fontWeight:600, color:"#374151", cursor:"pointer" }}>📁 파일</button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"여기에 대본이나 스크립트를 붙여넣으세요.\n\n예시)\n안녕하세요 여러분, 오늘은 제주 오름에 대해 이야기해볼게요.\n제주에는 360개가 넘는 오름이 있습니다.\n그중에서도 가장 인기 있는 곳은..."}
              style={{ flex:1, minHeight:380, padding:"18px 20px", border:"none", resize:"vertical", fontSize:14, lineHeight:1.7, color:"#1F2937", fontFamily:"inherit" }}
            />
            <div style={{ padding:"14px 20px", borderTop:"1px solid #F3F4F6", display:"flex", gap:10 }}>
              {text && <button onClick={reset} style={{ padding:"12px 18px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>지우기</button>}
              <button
                onClick={generate}
                disabled={!text.trim() || loading}
                style={{ flex:1, padding:"12px", background:text.trim()&&!loading?`linear-gradient(135deg,${TEAL},${P})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:text.trim()&&!loading?"white":"#9CA3AF", cursor:text.trim()&&!loading?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:text.trim()&&!loading?`0 4px 16px rgba(14,165,233,0.3)`:"none" }}
              >
                {loading
                  ? <><div style={{ width:16, height:16, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.3)", borderTop:"2px solid white", animation:"spin 0.8s linear infinite" }} /> 생성 중...</>
                  : "📝 SRT 자막 생성"
                }
              </button>
            </div>
          </div>

          {/* Output */}
          <div style={{ background:"white", borderRadius:20, border:"1px solid #E5E7EB", overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.05)", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:14, fontWeight:700, color:"#374151" }}>🎬 SRT 결과</span>
              {srt && (
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={copy} style={{ padding:"5px 12px", background:copied?"#10B981":"#F3F4F6", border:"none", borderRadius:8, fontSize:12, fontWeight:600, color:copied?"white":"#374151", cursor:"pointer" }}>
                    {copied ? "✓ 복사됨" : "복사"}
                  </button>
                  <button onClick={download} style={{ padding:"5px 12px", background:`linear-gradient(135deg,${TEAL},${P})`, border:"none", borderRadius:8, fontSize:12, fontWeight:700, color:"white", cursor:"pointer" }}>⬇️ .srt</button>
                </div>
              )}
            </div>
            <div style={{ flex:1, minHeight:380, overflow:"auto", padding:srt||error||loading?"18px 20px":"0" }}>
              {loading && (
                <div style={{ height:"100%", minHeight:340, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, color:"#9CA3AF" }}>
                  <div style={{ fontSize:40, animation:"pulse 1.5s ease infinite" }}>📝</div>
                  <div style={{ fontSize:14, fontWeight:600 }}>타임코드를 입히는 중...</div>
                </div>
              )}
              {error && !loading && (
                <div style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", borderRadius:12, padding:"14px 16px", fontSize:13, color:"#DC2626", lineHeight:1.6, wordBreak:"break-all" }}>
                  ⚠️ {error}
                </div>
              )}
              {srt && !loading && (
                <pre style={{ fontSize:13, lineHeight:1.7, color:"#1F2937", fontFamily:"'Courier New',monospace", whiteSpace:"pre-wrap", margin:0 }}>{srt}</pre>
              )}
              {!srt && !error && !loading && (
                <div style={{ height:"100%", minHeight:340, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, color:"#CBD5E1" }}>
                  <div style={{ fontSize:44 }}>🎬</div>
                  <div style={{ fontSize:14, fontWeight:600 }}>왼쪽에 대본을 넣고 생성하세요</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
