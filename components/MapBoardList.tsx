"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  subscribeToMapBoards,
  createMapBoard,
  updateMapBoard,
  deleteMapBoard,
  type CloudMapBoard,
} from "@/lib/firestoreHelpers";

const P = "#7C3AED";
const PINK = "#EC4899";

const CARD_GRADIENTS = [
  "linear-gradient(135deg,#0EA5E9,#2563EB,#1E3A8A)",
  "linear-gradient(135deg,#10B981,#059669,#065F46)",
  "linear-gradient(135deg,#7C3AED,#A855F7,#EC4899)",
  "linear-gradient(135deg,#F59E0B,#EA580C,#9A3412)",
  "linear-gradient(135deg,#EC4899,#DB2777,#9D174D)",
  "linear-gradient(135deg,#0891B2,#0E7490,#155E75)",
];

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function MapBoardList() {
  const { user, signIn } = useAuth();
  const [boards, setBoards] = useState<CloudMapBoard[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [editBoard, setEditBoard] = useState<CloudMapBoard | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CloudMapBoard | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => subscribeToMapBoards(setBoards), []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    if (!user) { await signIn(); return; }
    setCreating(true);
    try {
      await createMapBoard({
        id: crypto.randomUUID(),
        uid: user.uid,
        creatorName: user.displayName ?? "익명",
        creatorPhoto: user.photoURL ?? "",
        title: title.trim(),
        description: desc.trim(),
        postCount: 0,
        createdAt: Date.now(),
      });
      setShowCreate(false); setTitle(""); setDesc("");
    } catch { /* silent */ }
    setCreating(false);
  };

  const openEdit = (b: CloudMapBoard, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setEditBoard(b); setEditTitle(b.title); setEditDesc(b.description);
  };
  const handleEdit = async () => {
    if (!editBoard || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await updateMapBoard(editBoard.id, { title: editTitle.trim(), description: editDesc.trim() });
      setEditBoard(null);
    } catch { /* silent */ }
    setEditSaving(false);
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await deleteMapBoard(deleteTarget.id); setDeleteTarget(null); } catch { /* silent */ }
    setDeleting(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .mb-card:hover { transform:translateY(-6px)!important; box-shadow:0 24px 48px rgba(0,0,0,0.14)!important; }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none" }}>
            <div style={{ width:38, height:38, borderRadius:11, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"white", fontWeight:800 }}>✦</div>
            <span style={{ fontSize:16, fontWeight:800, color:"#111827" }}>AI Studio</span>
          </Link>
          <div style={{ width:1, height:24, background:"#E5E7EB" }} />
          <Link href="/actionboard" style={{ fontSize:13, fontWeight:700, color:"#6B7280", textDecoration:"none" }}>📋 액션보드</Link>
          <span style={{ fontSize:14, fontWeight:700, color:P }}>🗺️ 지도</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {user ? (
            <img src={user.photoURL ?? ""} alt="" style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover" }} />
          ) : (
            <button onClick={signIn} style={{ padding:"8px 18px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>로그인</button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"40px 24px 80px" }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:28, animation:"fadeUp 0.4s ease both", flexWrap:"wrap", gap:16 }}>
          <div>
            <h1 style={{ fontSize:30, fontWeight:800, color:"#0F172A", letterSpacing:-0.8, marginBottom:6 }}>🗺️ 지도 보드</h1>
            <p style={{ fontSize:14, color:"#6B7280" }}>장소에 핀을 꽂아 함께 모으는 위치 기반 보드</p>
          </div>
          <button onClick={() => user ? setShowCreate(true) : signIn()} style={{ padding:"12px 22px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:14, fontSize:14, fontWeight:700, color:"white", cursor:"pointer", boxShadow:"0 4px 16px rgba(124,58,237,0.3)" }}>
            + 새 지도 보드
          </button>
        </div>

        {boards.length === 0 ? (
          <div style={{ textAlign:"center", padding:"80px 0", color:"#9CA3AF" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🗺️</div>
            <div style={{ fontSize:16, fontWeight:600 }}>아직 지도 보드가 없어요</div>
            <div style={{ fontSize:13, marginTop:8 }}>첫 번째 지도 보드를 만들어보세요!</div>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:20 }}>
            {boards.map((b, i) => (
              <Link key={b.id} href={`/mapboard/${b.id}`} style={{ textDecoration:"none" }}>
                <div className="mb-card" style={{ borderRadius:20, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.08)", transition:"transform 0.25s ease,box-shadow 0.25s ease", background:"white", animation:`fadeUp 0.4s ease ${i*0.06}s both` }}>
                  <div style={{ background:CARD_GRADIENTS[i % CARD_GRADIENTS.length], padding:"26px 22px 22px", position:"relative", overflow:"hidden" }}>
                    <div style={{ position:"absolute", right:-20, top:-20, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.08)" }} />
                    <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", background:"rgba(255,255,255,0.2)", borderRadius:100, fontSize:11, fontWeight:700, color:"white", marginBottom:12 }}>📍 {b.postCount}개 장소</div>
                    <div style={{ fontSize:19, fontWeight:800, color:"white", lineHeight:1.3, marginBottom:6 }}>{b.title}</div>
                    {b.description && <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", lineHeight:1.5 }}>{b.description}</div>}
                  </div>
                  <div style={{ padding:"14px 20px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#6B7280", marginBottom:12 }}>
                      {b.creatorPhoto ? <img src={b.creatorPhoto} alt="" style={{ width:18, height:18, borderRadius:"50%" }} /> : <span>👤</span>}
                      <span>{b.creatorName}</span>
                      <span style={{ marginLeft:"auto" }}>{fmtDate(b.createdAt)}</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:"1px solid #F3F4F6", paddingTop:10 }}>
                      <div style={{ display:"flex", gap:8 }}>
                        {user?.uid === b.uid && (
                          <>
                            <button onClick={e => openEdit(b, e)} style={{ padding:"4px 10px", background:"#F3F4F6", border:"none", borderRadius:7, fontSize:12, fontWeight:600, color:"#374151", cursor:"pointer" }}>✏️ 수정</button>
                            <button onClick={e => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(b); }} style={{ padding:"4px 10px", background:"#FEF2F2", border:"none", borderRadius:7, fontSize:12, fontWeight:600, color:"#DC2626", cursor:"pointer" }}>🗑 삭제</button>
                          </>
                        )}
                      </div>
                      <span style={{ fontSize:13, fontWeight:700, color:P }}>열기 →</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"36px", width:"100%", maxWidth:440, animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:6 }}>🗺️ 새 지도 보드</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>주제를 정하고 지도에 장소를 모아보세요</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>제목 *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 제주 생태탐방 지도" style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>설명 (선택)</label>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="보드 설명" style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:26 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button onClick={handleCreate} disabled={creating || !title.trim()} style={{ flex:2, padding:"13px", background:title.trim()?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:title.trim()?"white":"#9CA3AF", cursor:title.trim()?"pointer":"default" }}>{creating ? "생성 중..." : "🗺️ 보드 생성"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editBoard && (
        <div onClick={() => setEditBoard(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"36px", width:"100%", maxWidth:440, animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:20, fontWeight:800, color:"#111827", marginBottom:20 }}>✏️ 지도 보드 수정</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
              <input value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
            </div>
            <div style={{ display:"flex", gap:10, marginTop:26 }}>
              <button onClick={() => setEditBoard(null)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button onClick={handleEdit} disabled={editSaving || !editTitle.trim()} style={{ flex:2, padding:"13px", background:editTitle.trim()?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:editTitle.trim()?"white":"#9CA3AF", cursor:editTitle.trim()?"pointer":"default" }}>{editSaving ? "저장 중..." : "수정 완료"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div onClick={() => setDeleteTarget(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"36px", width:"100%", maxWidth:360, textAlign:"center", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:44, marginBottom:14 }}>🗑</div>
            <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:8 }}>지도 보드를 삭제할까요?</div>
            <div style={{ fontSize:13, color:"#EF4444", background:"#FEF2F2", borderRadius:10, padding:"10px 14px", marginBottom:24 }}>⚠️ 보드 안의 모든 핀도 함께 삭제됩니다.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex:1, padding:"13px", background:"#EF4444", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:"white", cursor:"pointer" }}>{deleting ? "삭제 중..." : "삭제"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
