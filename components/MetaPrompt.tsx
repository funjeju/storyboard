"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const P = "#7C3AED";
const PINK = "#EC4899";
const CORAL = "#F97316";
const TOTAL_QUESTIONS = 10;

interface Message {
  role: "user" | "assistant";
  content: string;
}

const DOMAIN_ICONS: Record<string, string> = {
  "이미지생성": "🎨",
  "영상제작": "🎬",
  "음악생성": "🎵",
  "텍스트카피": "✍️",
  "범용AI": "🤖",
  "미감지": "✦",
};

const EXAMPLES = [
  "분위기 있는 카페 포스터 만들고 싶어",
  "신나는 여름 노래 만들어줘",
  "제품 홍보 영상 기획하고 싶은데",
  "감성적인 인스타 카피 써줘",
  "SF 영화 포스터 이미지 만들고 싶어",
];

export default function MetaPrompt() {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [reasoning, setReasoning]       = useState("");
  const [domain, setDomain]             = useState("");
  const [finalPrompt, setFinalPrompt]   = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [copied, setCopied]             = useState(false);
  const [started, setStarted]           = useState(false);
  const [questionsDone, setQuestionsDone] = useState(false);

  // Attachment state
  const [attachType, setAttachType]     = useState<"image" | "url" | null>(null);
  const [attachImage, setAttachImage]   = useState<string | null>(null); // base64
  const [attachUrl, setAttachUrl]       = useState("");
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // userTurns = number of user messages sent
  const userTurns = messages.filter(m => m.role === "user").length;
  const questionNum = Math.min(userTurns, TOTAL_QUESTIONS); // which question we just answered

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, finalPrompt, generatedImage]);

  const callAPI = async (msgs: Message[], mode: "question" | "generate") => {
    const res = await fetch("/api/metaprompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs, mode }),
    });
    return res.json();
  };

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      setAttachImage(e.target?.result as string);
      setAttachType("image");
      setAttachUrl("");
      setShowAttachMenu(false);
    };
    reader.readAsDataURL(file);
  };

  const clearAttach = () => {
    setAttachImage(null); setAttachUrl(""); setAttachType(null);
  };

  const send = async (text: string) => {
    const hasAttach = attachImage || attachUrl.trim();
    if (!text.trim() && !hasAttach || loading || questionsDone) return;

    // Build content string including attachment info
    let content = text.trim();
    if (attachUrl.trim()) content += `\n[참조 URL: ${attachUrl.trim()}]`;
    if (attachImage) content += `\n[이미지 첨부됨]`;

    const userMsg: Message = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    clearAttach();
    setLoading(true);
    setReasoning("");
    setStarted(true);

    const newUserTurns = next.filter(m => m.role === "user").length;

    // Animate reasoning
    const phrases = ["분석 중...", "파악하는 중...", "다음 질문을 준비하는 중..."];
    let ri = 0;
    const timer = setInterval(() => { setReasoning(phrases[ri++ % phrases.length]); }, 900);

    try {
      if (newUserTurns >= TOTAL_QUESTIONS) {
        // All 10 answers collected — ask AI to generate prompt
        clearInterval(timer);
        setReasoning("10개 답변 완료 — 프롬프트를 구성하고 있습니다...");
        const data = await callAPI(next, "generate");
        clearInterval(timer);
        setReasoning("");
        if (data.domain) setDomain(data.domain);
        if (data.finalPrompt) setFinalPrompt(data.finalPrompt);
        setQuestionsDone(true);
      } else {
        // Ask next question
        const data = await callAPI(next, "question");
        clearInterval(timer);
        setReasoning(data.reasoning || "");
        if (data.domain && data.domain !== "미감지") setDomain(data.domain);
        await new Promise(r => setTimeout(r, 400));
        if (data.question) {
          setMessages(prev => [...prev, { role: "assistant", content: data.question }]);
        }
        setReasoning("");
      }
    } catch {
      clearInterval(timer);
      setMessages(prev => [...prev, { role: "assistant", content: "오류가 발생했습니다. 다시 시도해주세요." }]);
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const generateImage = async () => {
    if (!finalPrompt || generatingImage) return;
    setGeneratingImage(true);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt }),
      });
      const data = await res.json();
      if (data.imageUrl) setGeneratedImage(data.imageUrl);
    } catch { /* silent */ }
    setGeneratingImage(false);
  };

  const copy = () => {
    if (!finalPrompt) return;
    navigator.clipboard.writeText(finalPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setMessages([]); setInput(""); setDomain("");
    setFinalPrompt(null); setGeneratedImage(null);
    setStarted(false); setQuestionsDone(false); setReasoning("");
  };

  const domainIcon = DOMAIN_ICONS[domain] || "✦";
  const isImageDomain = domain === "이미지생성" || !domain;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#FAFBFF",
      fontFamily: "'Noto Sans KR', -apple-system, sans-serif",
      position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes gradShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .meta-input:focus { outline:none; }
        .example-chip:hover { background:rgba(124,58,237,0.07)!important; border-color:${P}!important; color:${P}!important; }
        @media(max-width:640px) {
          .meta-hero h1 { font-size:28px!important; }
          .meta-wrap { padding:0 16px 140px!important; }
          .meta-bar { left:12px!important; right:12px!important; }
        }
      `}</style>

      {/* BG orbs */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-100, left:-80, width:480, height:480, borderRadius:"50%", background:"radial-gradient(circle,rgba(124,58,237,0.11) 0%,transparent 70%)" }} />
        <div style={{ position:"absolute", top:-60, right:-80, width:380, height:380, borderRadius:"50%", background:"radial-gradient(circle,rgba(236,72,153,0.09) 0%,transparent 70%)" }} />
        <div style={{ position:"absolute", bottom:80, right:-40, width:280, height:280, borderRadius:"50%", background:"radial-gradient(circle,rgba(249,115,22,0.07) 0%,transparent 70%)" }} />
      </div>

      {/* Nav */}
      <nav style={{ position:"sticky", top:0, zIndex:100, background:"rgba(255,255,255,0.88)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(124,58,237,0.08)", padding:"0 28px", height:52, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none" }}>
            <div style={{ width:28, height:28, borderRadius:8, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"white", fontWeight:800 }}>✦</div>
            <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>AI Studio</span>
          </Link>
          <div style={{ width:1, height:16, background:"#E5E7EB" }} />
          <span style={{ fontSize:13, fontWeight:700, color:P }}>✦ MetaPrompt</span>
        </div>
        {started && (
          <button onClick={reset} style={{ padding:"6px 16px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:8, fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>
            ↺ 다시 시작
          </button>
        )}
      </nav>

      {/* Progress bar */}
      {started && (
        <div style={{ position:"sticky", top:52, zIndex:99, background:"rgba(255,255,255,0.92)", backdropFilter:"blur(8px)", borderBottom:"1px solid rgba(124,58,237,0.06)", padding:"10px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {domain && (
              <div style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 12px", background:"rgba(124,58,237,0.07)", border:"1px solid rgba(124,58,237,0.15)", borderRadius:100, fontSize:12, fontWeight:700, color:P }}>
                {domainIcon} {domain}
              </div>
            )}
            {/* 10-dot progress */}
            <div style={{ display:"flex", gap:4 }}>
              {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
                <div key={i} style={{
                  width: i < questionNum ? 18 : 7,
                  height: 7, borderRadius: 100,
                  background: i < questionNum
                    ? `linear-gradient(90deg,${P},${PINK})`
                    : "rgba(124,58,237,0.12)",
                  transition: "all 0.35s ease",
                }} />
              ))}
            </div>
          </div>
          <span style={{ fontSize:12, color:"#9CA3AF", fontWeight:500 }}>
            {questionsDone ? "완료 ✓" : `${questionNum} / ${TOTAL_QUESTIONS}`}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="meta-wrap" style={{ maxWidth:720, margin:"0 auto", padding: started ? "32px 24px 150px" : "80px 24px 150px", position:"relative", zIndex:1 }}>

        {/* Hero */}
        {!started && (
          <div className="meta-hero" style={{ textAlign:"center", marginBottom:56, animation:"fadeUp 0.5s ease both" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 18px", background:"rgba(124,58,237,0.07)", border:"1px solid rgba(124,58,237,0.15)", borderRadius:100, fontSize:11, fontWeight:700, color:P, letterSpacing:1.5, marginBottom:28 }}>
              ✦ META PROMPT ENGINE
            </div>
            <h1 style={{ fontSize:40, fontWeight:800, color:"#0F172A", lineHeight:1.2, letterSpacing:-1.2, marginBottom:16 }}>
              막연한 아이디어를<br />
              <span style={{ background:`linear-gradient(135deg,${P},${PINK},${CORAL})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundSize:"200% 200%", animation:"gradShift 4s ease infinite" }}>
                완벽한 프롬프트
              </span>로
            </h1>
            <p style={{ fontSize:15, color:"#6B7280", lineHeight:1.7, maxWidth:420, margin:"0 auto 40px" }}>
              10개의 질문으로 아이디어를 구체화하고<br />
              프롬프트 생성 또는 이미지를 바로 만들어드립니다.
            </p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10, justifyContent:"center" }}>
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => send(ex)} className="example-chip" style={{ padding:"8px 18px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:100, fontSize:13, color:"#4B5563", cursor:"pointer", transition:"all 0.15s", fontFamily:"inherit" }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {messages.map((msg, i) => {
            // Parse attachment markers out of content
            const hasImage = msg.role === "user" && msg.content.includes("[이미지 첨부됨]");
            const urlMatch = msg.role === "user" && msg.content.match(/\[참조 URL: (.+?)\]/);
            const cleanContent = msg.content.replace(/\[참조 URL: .+?\]/, "").replace("[이미지 첨부됨]", "").trim();
            return (
              <div key={i} style={{ display:"flex", justifyContent:msg.role==="user"?"flex-end":"flex-start", animation:"fadeUp 0.3s ease both" }}>
                {msg.role === "assistant" && (
                  <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"white", fontWeight:800, marginRight:10, marginTop:2 }}>✦</div>
                )}
                <div style={{
                  maxWidth:"75%", padding:"13px 17px",
                  borderRadius: msg.role==="user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                  background: msg.role==="user" ? `linear-gradient(135deg,${P},${PINK})` : "white",
                  color: msg.role==="user" ? "white" : "#1F2937",
                  fontSize:14, lineHeight:1.7, fontWeight:500,
                  boxShadow: msg.role==="user" ? "0 4px 14px rgba(124,58,237,0.22)" : "0 2px 10px rgba(0,0,0,0.07)",
                  border: msg.role==="assistant" ? "1px solid rgba(124,58,237,0.1)" : "none",
                }}>
                  {cleanContent && <div>{cleanContent}</div>}
                  {hasImage && <div style={{ marginTop: cleanContent ? 8 : 0, fontSize:12, opacity:0.8 }}>🖼️ 이미지 첨부됨</div>}
                  {urlMatch && <div style={{ marginTop: cleanContent ? 6 : 0, fontSize:12, opacity:0.8 }}>🔗 {urlMatch[1]}</div>}
                </div>
              </div>
            );
          })}

          {/* Loading */}
          {loading && (
            <div style={{ display:"flex", alignItems:"flex-start", gap:10, animation:"fadeUp 0.3s ease both" }}>
              <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"white", fontWeight:800 }}>✦</div>
              <div style={{ background:"white", borderRadius:"4px 18px 18px 18px", padding:"13px 17px", border:"1px solid rgba(124,58,237,0.1)", boxShadow:"0 2px 10px rgba(0,0,0,0.07)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: reasoning ? 6 : 0 }}>
                  <div style={{ width:14, height:14, borderRadius:"50%", border:`2px solid rgba(124,58,237,0.15)`, borderTop:`2px solid ${P}`, animation:"spin 0.8s linear infinite", flexShrink:0 }} />
                  <span style={{ fontSize:12, color:"#9CA3AF", fontWeight:500 }}>추론 중</span>
                </div>
                {reasoning && (
                  <div style={{ fontSize:12, color:P, fontStyle:"italic", lineHeight:1.6, opacity:0.8, animation:"fadeUp 0.3s ease both" }}>
                    {reasoning}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Final result */}
          {questionsDone && finalPrompt && (
            <div style={{ marginTop:8, animation:"fadeUp 0.4s ease both" }}>
              {/* Prompt card */}
              <div style={{ background:"white", borderRadius:20, border:"1.5px solid rgba(124,58,237,0.2)", overflow:"hidden", boxShadow:"0 8px 32px rgba(124,58,237,0.12)", marginBottom:16 }}>
                <div style={{ padding:"16px 24px", background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:15, fontWeight:800, color:"white" }}>✦ 최종 프롬프트</span>
                  <button onClick={copy} style={{ padding:"6px 18px", background:copied?"rgba(16,185,129,0.9)":"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.35)", borderRadius:8, color:"white", fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.2s" }}>
                    {copied ? "✓ 복사됨" : "복사"}
                  </button>
                </div>
                <div style={{ padding:24 }}>
                  <pre style={{ fontSize:14, color:"#1F2937", lineHeight:1.8, whiteSpace:"pre-wrap", fontFamily:"inherit", margin:0, background:"#F9F5FF", borderRadius:12, padding:16, border:"1px solid rgba(124,58,237,0.08)" }}>
                    {finalPrompt}
                  </pre>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display:"flex", gap:12 }}>
                <button onClick={copy} style={{ flex:1, padding:"14px", background:"white", border:`2px solid ${P}`, borderRadius:14, fontSize:14, fontWeight:700, color:P, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  📋 프롬프트 복사
                </button>
                <button onClick={generateImage} disabled={generatingImage} style={{ flex:1, padding:"14px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:14, fontSize:14, fontWeight:700, color:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:`0 4px 16px rgba(124,58,237,0.3)` }}>
                  {generatingImage
                    ? <><div style={{ width:16, height:16, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.3)", borderTop:"2px solid white", animation:"spin 0.8s linear infinite" }} /> 생성 중...</>
                    : "🎨 이미지 생성"
                  }
                </button>
              </div>

              {/* Generated image */}
              {generatedImage && (
                <div style={{ marginTop:16, borderRadius:20, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.12)", animation:"fadeUp 0.4s ease both" }}>
                  <img src={generatedImage} alt="generated" style={{ width:"100%", display:"block" }} />
                  <div style={{ padding:"12px 16px", background:"white", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:"#9CA3AF" }}>Gemini 이미지 생성</span>
                    <a href={generatedImage} download="metaprompt_image.png" style={{ fontSize:12, fontWeight:700, color:P, textDecoration:"none" }}>⬇️ 다운로드</a>
                  </div>
                </div>
              )}

              <button onClick={reset} style={{ width:"100%", marginTop:16, padding:"12px", background:"transparent", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:13, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>
                ↺ 새로운 프롬프트 만들기
              </button>
            </div>
          )}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      {!questionsDone && (
        <div className="meta-bar" style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:720, padding:"0 24px", zIndex:200 }}>
          <div style={{ background:"white", borderRadius:20, border:"1.5px solid rgba(124,58,237,0.2)", boxShadow:"0 8px 40px rgba(124,58,237,0.14), 0 2px 8px rgba(0,0,0,0.05)", overflow:"hidden" }}>

            {/* Attachment preview */}
            {(attachImage || attachUrl) && (
              <div style={{ padding:"10px 16px 0", display:"flex", alignItems:"center", gap:10 }}>
                {attachImage && (
                  <div style={{ position:"relative", flexShrink:0 }}>
                    <img src={attachImage} alt="첨부" style={{ width:48, height:48, objectFit:"cover", borderRadius:8, border:"1.5px solid rgba(124,58,237,0.2)" }} />
                    <button onClick={clearAttach} style={{ position:"absolute", top:-6, right:-6, width:18, height:18, borderRadius:"50%", background:"#EF4444", border:"none", color:"white", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800 }}>×</button>
                  </div>
                )}
                {attachUrl && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 12px", background:"rgba(124,58,237,0.07)", border:"1px solid rgba(124,58,237,0.2)", borderRadius:8, fontSize:12, color:P, fontWeight:600, flex:1, minWidth:0 }}>
                    <span style={{ fontSize:14 }}>🔗</span>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{attachUrl}</span>
                    <button onClick={clearAttach} style={{ marginLeft:"auto", background:"none", border:"none", color:"#9CA3AF", cursor:"pointer", fontSize:14, fontWeight:800, flexShrink:0 }}>×</button>
                  </div>
                )}
              </div>
            )}

            {/* URL input mode */}
            {attachType === "url" && !attachUrl && (
              <div style={{ padding:"10px 16px 0", display:"flex", gap:8 }}>
                <input
                  autoFocus
                  placeholder="https://... URL을 붙여넣으세요"
                  onKeyDown={e => {
                    if (e.key === "Enter") { setAttachUrl(e.currentTarget.value); setAttachType(null); }
                    if (e.key === "Escape") { setAttachType(null); }
                  }}
                  onBlur={e => { if (e.target.value) setAttachUrl(e.target.value); setAttachType(null); }}
                  style={{ flex:1, padding:"8px 12px", border:"1.5px solid rgba(124,58,237,0.3)", borderRadius:10, fontSize:13, outline:"none", fontFamily:"inherit" }}
                />
              </div>
            )}

            {/* Main input row */}
            <div style={{ padding:"12px 12px 12px 16px", display:"flex", alignItems:"flex-end", gap:8 }}>
              {/* Attach button */}
              <div style={{ position:"relative" }}>
                <button
                  onClick={() => setShowAttachMenu(p => !p)}
                  disabled={loading}
                  style={{ width:36, height:36, borderRadius:10, flexShrink:0, background:showAttachMenu?"rgba(124,58,237,0.1)":"#F3F4F6", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, transition:"all 0.15s" }}
                  title="이미지 또는 URL 첨부"
                >📎</button>
                {showAttachMenu && (
                  <div style={{ position:"absolute", bottom:44, left:0, background:"white", border:"1.5px solid rgba(124,58,237,0.15)", borderRadius:14, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", overflow:"hidden", minWidth:160, zIndex:10, animation:"fadeUp 0.2s ease both" }}>
                    <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} style={{ width:"100%", padding:"12px 16px", background:"none", border:"none", textAlign:"left", fontSize:13, fontWeight:600, color:"#1F2937", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                      🖼️ 이미지 업로드
                    </button>
                    <div style={{ height:1, background:"#F3F4F6" }} />
                    <button onClick={() => { setAttachType("url"); setShowAttachMenu(false); }} style={{ width:"100%", padding:"12px 16px", background:"none", border:"none", textAlign:"left", fontSize:13, fontWeight:600, color:"#1F2937", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                      🔗 URL 붙여넣기
                    </button>
                  </div>
                )}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); }} />

              <textarea
                ref={inputRef}
                className="meta-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder={started ? "답변을 입력하세요..." : "무엇을 만들고 싶은지 자유롭게 말해보세요..."}
                disabled={loading}
                rows={1}
                style={{ flex:1, border:"none", outline:"none", resize:"none", fontSize:14, color:"#1F2937", fontFamily:"inherit", background:"transparent", lineHeight:1.6, maxHeight:120, overflowY:"auto" }}
                onInput={e => { const el = e.currentTarget; el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,120)+"px"; }}
              />
              <button
                onClick={() => send(input)}
                disabled={(!input.trim() && !attachImage && !attachUrl) || loading}
                style={{ width:40, height:40, borderRadius:12, flexShrink:0, background:(input.trim()||attachImage||attachUrl)&&!loading?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s", boxShadow:(input.trim()||attachImage||attachUrl)?"0 4px 12px rgba(124,58,237,0.28)":"none" }}
              >
                {loading
                  ? <div style={{ width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",animation:"spin 0.8s linear infinite" }} />
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
                }
              </button>
            </div>
          </div>
          <div style={{ textAlign:"center", marginTop:8, fontSize:11, color:"#9CA3AF" }}>
            Enter 전송 · Shift+Enter 줄바꿈
          </div>
        </div>
      )}
    </div>
  );
}
