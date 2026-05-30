"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  subscribeToActionBoards,
  createActionBoard,
  type CloudActionBoard,
} from "@/lib/firestoreHelpers";

const P = "#7C3AED";
const PINK = "#EC4899";

function getBoardStatus(board: CloudActionBoard): "upcoming" | "open" | "closed" {
  const now = Date.now();
  if (now < board.startAt) return "upcoming";
  if (now <= board.endAt) return "open";
  return "closed";
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  open:     { label: "🟢 진행중",  color: "#059669", bg: "rgba(16,185,129,0.1)" },
  upcoming: { label: "🔵 예정",    color: "#2563EB", bg: "rgba(37,99,235,0.1)"  },
  closed:   { label: "⚫ 종료",    color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
};

function fmtRange(startAt: number, endAt: number) {
  const fmt = (ts: number) => {
    const d = new Date(ts);
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${mo}/${day} ${h}:${m}`;
  };
  return `${fmt(startAt)} ~ ${fmt(endAt)}`;
}

// ── Date picker helpers ───────────────────────────────────────────────────────
interface DatePick { year: number; month: number; day: number; hour: number; min: 0 | 30 }

function datepickToTs(p: DatePick) {
  return new Date(p.year, p.month, p.day, p.hour, p.min).getTime();
}

function nowPick(offsetHours = 0): DatePick {
  const d = new Date(Date.now() + offsetHours * 3600_000);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hour: d.getHours(), min: d.getMinutes() < 30 ? 0 : 30 };
}

const SEL_STYLE: React.CSSProperties = {
  padding: "9px 10px", border: "1.5px solid #E5E7EB", borderRadius: 8,
  fontSize: 13, fontFamily: "inherit", background: "white", cursor: "pointer", outline: "none",
};

function DateTimePicker({ label, icon, value, onChange }: {
  label: string; icon: string; value: DatePick; onChange: (v: DatePick) => void;
}) {
  const months = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const daysInMonth = new Date(value.year, value.month + 1, 0).getDate();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
        {icon} {label}
      </label>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <select value={value.month} onChange={e => onChange({ ...value, month: +e.target.value })} style={SEL_STYLE}>
          {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={value.day} onChange={e => onChange({ ...value, day: +e.target.value })} style={SEL_STYLE}>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}
        </select>
        <select value={value.hour} onChange={e => onChange({ ...value, hour: +e.target.value })} style={SEL_STYLE}>
          {hours.map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}시</option>)}
        </select>
        <select value={value.min} onChange={e => onChange({ ...value, min: +e.target.value as 0 | 30 })} style={SEL_STYLE}>
          <option value={0}>00분</option>
          <option value={30}>30분</option>
        </select>
      </div>
    </div>
  );
}

const CARD_GRADIENTS = [
  "linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)",
  "linear-gradient(135deg,#7C3AED,#A855F7,#EC4899)",
  "linear-gradient(135deg,#0F4C9A,#1D6EBF,#2563EB)",
  "linear-gradient(135deg,#064E3B,#065F46,#059669)",
  "linear-gradient(135deg,#7C2D12,#9A3412,#C2410C)",
  "linear-gradient(135deg,#1E1B4B,#312E81,#4338CA)",
];

export default function ActionBoard() {
  const { user, signIn } = useAuth();
  const [boards, setBoards]         = useState<CloudActionBoard[]>([]);
  const [filter, setFilter]         = useState<"all" | "open" | "upcoming" | "closed">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);

  // form state
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [startPick, setStartPick] = useState<DatePick>(() => nowPick(0));
  const [endPick, setEndPick]   = useState<DatePick>(() => nowPick(9));

  useEffect(() => {
    const unsub = subscribeToActionBoards(setBoards);
    return unsub;
  }, []);

  const filtered = boards.filter(b => filter === "all" || getBoardStatus(b) === filter);

  const handleCreate = async () => {
    if (!title.trim()) return;
    if (!user) { await signIn(); return; }
    setCreating(true);
    try {
      const startAt = datepickToTs(startPick);
      const endAt   = datepickToTs(endPick);
      await createActionBoard({
        id: crypto.randomUUID(),
        uid: user.uid,
        creatorName: user.displayName ?? "익명",
        creatorPhoto: user.photoURL ?? "",
        title: title.trim(),
        description: desc.trim(),
        startAt,
        endAt,
        postCount: 0,
        createdAt: Date.now(),
      });
      setShowCreate(false);
      setTitle(""); setDesc("");
    } catch { /* silent */ }
    setCreating(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        .board-card:hover { transform:translateY(-6px)!important; box-shadow:0 24px 48px rgba(0,0,0,0.14)!important; }
        .filter-chip { transition:all 0.15s; cursor:pointer; }
        .filter-chip:hover { border-color:${P}!important; color:${P}!important; }
        input[type="datetime-local"] { font-family:inherit; }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 40px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none" }}>
            <div style={{ width:38, height:38, borderRadius:11, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"white", fontWeight:800, boxShadow:"0 4px 12px rgba(124,58,237,0.3)" }}>✦</div>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827" }}>AI Studio</div>
              <div style={{ fontSize:9, color:"#9CA3AF", letterSpacing:2, fontWeight:600 }}>CREATIVE TOOLKIT</div>
            </div>
          </Link>
          <div style={{ width:1, height:24, background:"#E5E7EB", margin:"0 4px" }} />
          <span style={{ fontSize:14, fontWeight:700, color:P }}>📋 액션보드</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {user ? (
            <>
              <img src={user.photoURL ?? ""} alt="" style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover" }} />
              <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>{user.displayName}</span>
            </>
          ) : (
            <button onClick={signIn} style={{ padding:"8px 18px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>
              로그인
            </button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"48px 32px 80px" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:32, animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:32, fontWeight:800, color:"#0F172A", letterSpacing:-0.8, marginBottom:6 }}>📋 액션보드</h1>
            <p style={{ fontSize:14, color:"#6B7280" }}>수업 결과물을 실시간으로 공유하는 협업 보드</p>
          </div>
          <button
            onClick={() => user ? setShowCreate(true) : signIn()}
            style={{ padding:"12px 24px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:14, fontSize:14, fontWeight:700, color:"white", cursor:"pointer", boxShadow:`0 4px 16px rgba(124,58,237,0.3)`, display:"flex", alignItems:"center", gap:8 }}
          >
            + 새 보드 만들기
          </button>
        </div>

        {/* Filter chips */}
        <div style={{ display:"flex", gap:8, marginBottom:28 }}>
          {(["all","open","upcoming","closed"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="filter-chip"
              style={{ padding:"7px 18px", borderRadius:100, border:`1.5px solid ${filter===f?P:"#E5E7EB"}`, background:filter===f?`rgba(124,58,237,0.07)`:"white", fontSize:13, fontWeight:600, color:filter===f?P:"#6B7280" }}
            >
              {f==="all"?"전체":f==="open"?"🟢 진행중":f==="upcoming"?"🔵 예정":"⚫ 종료"}
              {f!=="all" && <span style={{ marginLeft:6, fontSize:11, opacity:0.7 }}>{boards.filter(b=>getBoardStatus(b)===f).length}</span>}
            </button>
          ))}
          <span style={{ marginLeft:"auto", fontSize:13, color:"#9CA3AF", alignSelf:"center" }}>{filtered.length}개</span>
        </div>

        {/* Board grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"80px 0", color:"#9CA3AF" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
            <div style={{ fontSize:16, fontWeight:600 }}>아직 보드가 없어요</div>
            <div style={{ fontSize:13, marginTop:8 }}>첫 번째 액션보드를 만들어보세요!</div>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:20 }}>
            {filtered.map((board, i) => {
              const status = getBoardStatus(board);
              const st = STATUS_LABEL[status];
              const grad = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
              return (
                <Link key={board.id} href={`/actionboard/${board.id}`} style={{ textDecoration:"none" }}>
                  <div
                    className="board-card"
                    style={{ borderRadius:20, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.08)", transition:"transform 0.25s ease,box-shadow 0.25s ease", animation:`fadeUp 0.4s ease ${i*0.07}s both`, background:"white" }}
                  >
                    {/* Card header */}
                    <div style={{ background:grad, padding:"28px 24px 22px", position:"relative", overflow:"hidden" }}>
                      <div style={{ position:"absolute", right:-20, top:-20, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.07)" }} />
                      <div style={{ position:"absolute", right:20, bottom:-30, width:80, height:80, borderRadius:"50%", background:"rgba(255,255,255,0.05)" }} />

                      {/* Status badge */}
                      <div style={{ display:"inline-flex", alignItems:"center", padding:"4px 12px", background:"rgba(255,255,255,0.2)", backdropFilter:"blur(4px)", borderRadius:100, fontSize:11, fontWeight:700, color:"white", marginBottom:14 }}>
                        {st.label}
                      </div>

                      <div style={{ fontSize:20, fontWeight:800, color:"white", lineHeight:1.3, letterSpacing:-0.3, marginBottom:8, animation:"float 3s ease-in-out infinite" }}>
                        {board.title}
                      </div>
                      {board.description && (
                        <div style={{ fontSize:12, color:"rgba(255,255,255,0.75)", lineHeight:1.5 }}>{board.description}</div>
                      )}
                    </div>

                    {/* Card body */}
                    <div style={{ padding:"18px 24px 20px" }}>
                      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#6B7280" }}>
                          <span>📅</span>
                          <span>{fmtRange(board.startAt, board.endAt)}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#6B7280" }}>
                          {board.creatorPhoto
                            ? <img src={board.creatorPhoto} alt="" style={{ width:18, height:18, borderRadius:"50%", objectFit:"cover" }} />
                            : <span>👤</span>
                          }
                          <span>{board.creatorName}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#6B7280" }}>
                          <span>📝</span>
                          <span>{board.postCount}개 게시물</span>
                        </div>
                      </div>

                      <div style={{ padding:"10px 0", borderTop:"1px solid #F3F4F6", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontSize:12, color:st.color, fontWeight:700, background:st.bg, padding:"3px 10px", borderRadius:100 }}>{st.label}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:P }}>보드 열기 →</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"40px 36px", width:"100%", maxWidth:460, boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:24, fontWeight:800, color:"#111827", marginBottom:6 }}>📋 새 액션보드</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:28 }}>보드 제목과 입력 가능 기간을 설정하세요</div>

            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>보드 제목 *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="예: 6월 AI 활용 수업 결과물"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>설명 (선택)</label>
                <input
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="보드에 대한 간단한 설명"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>

              <DateTimePicker label="입력 시작" icon="📅" value={startPick} onChange={setStartPick} />
              <DateTimePicker label="입력 마감" icon="🔒" value={endPick} onChange={setEndPick} />

              <div style={{ background:"#F8F9FF", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#6B7280", lineHeight:1.6 }}>
                ℹ️ 마감 이후에는 새 게시물 등록이 불가하며, 기존 게시물은 계속 열람할 수 있습니다.
              </div>
            </div>

            <div style={{ display:"flex", gap:10, marginTop:28 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !title.trim()}
                style={{ flex:2, padding:"13px", background:title.trim()?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:title.trim()?"white":"#9CA3AF", cursor:title.trim()?"pointer":"default", boxShadow:title.trim()?`0 4px 16px rgba(124,58,237,0.3)`:"none" }}
              >
                {creating ? "생성 중..." : "📋 보드 생성"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
