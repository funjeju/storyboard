"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  getActionBoard,
  subscribeToBoardPosts,
  addBoardPost,
  deleteBoardPost,
  updateBoardPost,
  updateBoardPostPosition,
  type CloudActionBoard,
  type CloudBoardPost,
} from "@/lib/firestoreHelpers";
import { uploadImageDataUrl, uploadBoardFile } from "@/lib/firebaseStorage";

const P = "#7C3AED";
const PINK = "#EC4899";

type ContentType = "text" | "image" | "audio" | "youtube" | "ppt";

function getBoardStatus(board: CloudActionBoard) {
  const now = Date.now();
  if (now < board.startAt) return "upcoming";
  if (now <= board.endAt) return "open";
  return "closed";
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function getYoutubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Sticky note card ──────────────────────────────────────────────────────────
const NOTE_COLORS = ["#FFF9C4","#FFE0B2","#F8BBD0","#C8E6C9","#B3E5FC","#E1BEE7","#FFFFFF"];
const PALETTE = [
  "#FFF9C4","#FFE0B2","#FFCDD2","#F8BBD0",
  "#C8E6C9","#DCEDC8","#B3E5FC","#BBDEFB",
  "#E1BEE7","#D7CCC8","#FFFFFF","#F5F5F5",
];

function PostCard({ post, canDelete, onDelete, onEdit, onOpenPpt, onMaximize, onMouseDown, isDragging }: {
  post: CloudBoardPost;
  canDelete: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onOpenPpt: (pptUrl: string, pptName: string) => void;
  onMaximize: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
}) {
  const [playing, setPlaying]       = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const color = post.bgColor ?? NOTE_COLORS[Math.abs([...post.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % NOTE_COLORS.length];

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div
      onMouseDown={onMouseDown}
      style={{ background:color, borderRadius:16, padding:"18px 18px 14px", boxShadow: isDragging ? "0 20px 48px rgba(0,0,0,0.22)" : "0 4px 14px rgba(0,0,0,0.09)", position:"relative", minHeight:120, display:"flex", flexDirection:"column", gap:10, cursor: isDragging ? "grabbing" : "grab", userSelect:"none", transform: isDragging ? "scale(1.03)" : "scale(1)", transition: isDragging ? "box-shadow 0.15s,transform 0.1s" : "box-shadow 0.25s,transform 0.25s" }}
    >
      {/* Author */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          {post.authorPhoto
            ? <img src={post.authorPhoto} alt="" style={{ width:22, height:22, borderRadius:"50%", objectFit:"cover" }} />
            : <div style={{ width:22, height:22, borderRadius:"50%", background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"white", fontWeight:800 }}>{post.authorName[0]}</div>
          }
          <span style={{ fontSize:11, fontWeight:600, color:"#374151" }}>{post.authorName}</span>
          <span style={{ fontSize:10, color:"#9CA3AF" }}>{fmtDate(post.createdAt)}</span>
        </div>
        <div style={{ display:"flex", gap:2 }}>
          <button onClick={e => { e.stopPropagation(); onMaximize(); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF", padding:"2px 5px", borderRadius:4, lineHeight:1 }} title="최대화">⛶</button>
          {canDelete && (
            <>
              <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF", padding:"2px 5px", borderRadius:4 }} title="수정">✏️</button>
              <button onClick={onDelete} style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#9CA3AF", padding:"2px 5px", borderRadius:4 }} title="삭제">×</button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {post.contentType === "text" && (
        <p style={{ fontSize:14, color:"#1F2937", lineHeight:1.65, whiteSpace:"pre-wrap", flex:1 }}>{post.text}</p>
      )}

      {post.contentType === "image" && post.imageUrl && (
        <img src={post.imageUrl} alt="첨부 이미지" style={{ width:"100%", borderRadius:10, display:"block" }} />
      )}

      {post.contentType === "audio" && post.audioUrl && (
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>🎵 {post.audioName || "오디오"}</div>
          <audio ref={audioRef} src={post.audioUrl} onEnded={() => setPlaying(false)} style={{ display:"none" }} />
          <button
            onClick={toggleAudio}
            style={{ padding:"8px 18px", background:playing?`linear-gradient(135deg,${P},${PINK})`:"white", border:`2px solid ${P}`, borderRadius:10, fontSize:13, fontWeight:700, color:playing?"white":P, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}
          >
            {playing ? "⏸ 일시정지" : "▶ 재생"}
          </button>
        </div>
      )}

      {post.contentType === "youtube" && post.youtubeUrl && (
        <div>
          {!showPlayer ? (
            <div onClick={() => setShowPlayer(true)} style={{ position:"relative", borderRadius:10, overflow:"hidden", cursor:"pointer" }}>
              {getYoutubeId(post.youtubeUrl) && (
                <img src={`https://img.youtube.com/vi/${getYoutubeId(post.youtubeUrl)}/mqdefault.jpg`} alt="YouTube 썸네일" style={{ width:"100%", display:"block", borderRadius:10 }} />
              )}
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.25)", borderRadius:10 }}>
                <div style={{ width:44, height:44, borderRadius:"50%", background:"rgba(255,0,0,0.9)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ position:"relative", paddingTop:"56.25%", borderRadius:10, overflow:"hidden" }}>
              <iframe src={`https://www.youtube.com/embed/${getYoutubeId(post.youtubeUrl)}?autoplay=1`} style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} allowFullScreen allow="autoplay" />
            </div>
          )}
        </div>
      )}

      {post.contentType === "ppt" && post.pptUrl && (
        <div style={{ background:"rgba(0,0,0,0.05)", borderRadius:10, padding:"16px 14px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:32 }}>📊</div>
          <div style={{ fontSize:12, fontWeight:600, color:"#374151", wordBreak:"break-all", lineHeight:1.4 }}>{post.pptName || "프레젠테이션"}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center" }}>
            <button onClick={() => onOpenPpt(post.pptUrl!, post.pptName || "프레젠테이션")}
              style={{ padding:"5px 12px", background:"#7C3AED", border:"none", borderRadius:8, fontSize:11, fontWeight:700, color:"white", cursor:"pointer" }}>
              🔍 보기
            </button>
            <a href={post.pptUrl} download target="_blank" rel="noreferrer"
              style={{ padding:"5px 12px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:8, fontSize:11, fontWeight:700, color:"#374151", textDecoration:"none" }}>
              ⬇️ 다운로드
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ActionBoardDetail({ boardId }: { boardId: string }) {
  const { user, signIn } = useAuth();
  const [board, setBoard]     = useState<CloudActionBoard | null>(null);
  const [posts, setPosts]     = useState<CloudBoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Drag state ──────────────────────────────────────────────────────────────
  const CARD_W      = 260;
  const SNAP_DIST   = 14;  // px threshold for snap
  type Pos = { x: number; y: number };
  type SnapLine = { axis: "x" | "y"; pos: number };
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [snapLines, setSnapLines]   = useState<SnapLine[]>([]);
  const dragRef = useRef<{ id: string; mouseX: number; mouseY: number; cardX: number; cardY: number } | null>(null);
  const posRef  = useRef<Record<string, Pos>>({});

  // keep posRef in sync so mouseup closure has latest positions
  useEffect(() => { posRef.current = positions; }, [positions]);

  // Find first grid slot not occupied by any existing card
  const findEmptySlot = useCallback((existing: Record<string, Pos>): Pos => {
    const colW = CARD_W + 20;   // 280px per column
    const rowH = 300;            // estimated row height
    const cols = Math.max(1, Math.floor((typeof window !== "undefined" ? Math.min(window.innerWidth, 1280) : 1280) / colW));
    const occupied = Object.values(existing);
    for (let row = 0; row < 40; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = col * colW + 20;
        const cy = row * rowH + 20;
        const conflict = occupied.some(p => Math.abs(p.x - cx) < CARD_W && Math.abs(p.y - cy) < rowH);
        if (!conflict) return { x: cx, y: cy };
      }
    }
    return { x: 20, y: 20 };
  }, [CARD_W]);

  // Assign positions from Firestore data or find empty slot
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      posts.forEach(p => {
        if (next[p.id]) return; // already positioned locally
        next[p.id] = p.x !== undefined && p.y !== undefined
          ? { x: p.x, y: p.y }     // use saved Firestore position
          : findEmptySlot(next);    // find first empty slot
      });
      return next;
    });
  }, [posts, findEmptySlot]);

  const handleCardMouseDown = useCallback((e: React.MouseEvent, postId: string) => {
    const tag = (e.target as HTMLElement).closest("button,a,audio,iframe,select");
    if (tag) return; // don't intercept interactive elements
    e.preventDefault();
    const pos = posRef.current[postId] ?? { x: 0, y: 0 };
    dragRef.current = { id: postId, mouseX: e.clientX, mouseY: e.clientY, cardX: pos.x, cardY: pos.y };
    setDraggingId(postId);
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const { id, mouseX, mouseY, cardX, cardY } = dragRef.current;
    let x = Math.max(0, cardX + e.clientX - mouseX);
    let y = Math.max(0, cardY + e.clientY - mouseY);

    // ── Snap alignment ──────────────────────────────────────────────────────
    const lines: SnapLine[] = [];
    const others = Object.entries(posRef.current).filter(([otherId]) => otherId !== id);

    for (const [, op] of others) {
      // X: left-left, left-right, right-left, right-right
      const checks: [number, number, number][] = [
        [x,          op.x,          op.x],
        [x,          op.x + CARD_W, op.x + CARD_W],
        [x + CARD_W, op.x,          op.x - CARD_W],
        [x + CARD_W, op.x + CARD_W, op.x],
      ];
      for (const [edge, target, snapX] of checks) {
        if (Math.abs(edge - target) < SNAP_DIST) {
          x = snapX; lines.push({ axis:"x", pos: target }); break;
        }
      }
      // Y: top-top, top-bottom
      if (Math.abs(y - op.y) < SNAP_DIST) { y = op.y; lines.push({ axis:"y", pos:op.y }); }
    }

    setSnapLines(lines);
    setPositions(prev => ({ ...prev, [id]: { x, y } }));
  }, [CARD_W, SNAP_DIST]);

  const handleCanvasMouseUp = useCallback(async () => {
    if (!dragRef.current) return;
    const { id } = dragRef.current;
    dragRef.current = null;
    setDraggingId(null);
    setSnapLines([]);
    const pos = posRef.current[id];
    if (pos) updateBoardPostPosition(boardId, id, pos.x, pos.y).catch(() => {});
  }, [boardId]);

  // form
  const [cType, setCType]       = useState<ContentType>("text");
  const [text, setText]         = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [ytUrl, setYtUrl]       = useState("");
  const [pptFile, setPptFile]   = useState<File | null>(null);
  const [pptName, setPptName]   = useState("");
  const [cardColor, setCardColor] = useState(PALETTE[0]);
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  // PPT full-screen viewer
  const [pptViewer, setPptViewer] = useState<{ url: string; name: string } | null>(null);
  // Card maximize overlay
  const [maximizedPost, setMaximizedPost] = useState<CloudBoardPost | null>(null);

  // edit post state
  const [editPost, setEditPost]       = useState<CloudBoardPost | null>(null);
  const [editText, setEditText]       = useState("");
  const [editField, setEditField]     = useState(""); // audioName / youtubeUrl / pptName
  const [editColor, setEditColor]     = useState(PALETTE[0]);
  const [editSaving, setEditSaving]   = useState(false);

  const openEditPost = (post: CloudBoardPost) => {
    setEditPost(post);
    setEditText(post.text ?? "");
    setEditField(
      post.contentType === "audio"   ? (post.audioName   ?? "") :
      post.contentType === "youtube" ? (post.youtubeUrl  ?? "") :
      post.contentType === "ppt"     ? (post.pptName     ?? "") : ""
    );
    setEditColor(post.bgColor ?? PALETTE[0]);
  };

  const handleEditSave = async () => {
    if (!editPost) return;
    setEditSaving(true);
    try {
      const fields: Parameters<typeof updateBoardPost>[2] = { bgColor: editColor };
      if (editPost.contentType === "text")    fields.text       = editText;
      if (editPost.contentType === "audio")   fields.audioName  = editField;
      if (editPost.contentType === "youtube") fields.youtubeUrl = editField;
      if (editPost.contentType === "ppt")     fields.pptName    = editField;
      await updateBoardPost(boardId, editPost.id, fields);
      setEditPost(null);
    } catch (e) { console.error(e); }
    setEditSaving(false);
  };

  const fileRef     = useRef<HTMLInputElement>(null);
  const audioRef2   = useRef<HTMLInputElement>(null);
  const pptFileRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getActionBoard(boardId).then(b => { setBoard(b); setLoading(false); });
    const unsub = subscribeToBoardPosts(boardId, setPosts);
    return unsub;
  }, [boardId]);

  const status = board ? getBoardStatus(board) : "closed";
  const canPost = status === "open" && !!user;
  const isAdmin = !!user && !!board && user.uid === board.uid;
  const announcements = posts.filter(p => p.isAnnouncement);
  const normalPosts   = posts.filter(p => !p.isAnnouncement);

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setImageUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!user || !board) return;
    const validContent =
      (cType === "text"    && text.trim()) ||
      (cType === "image"   && imageUrl) ||
      (cType === "audio"   && audioFile) ||
      (cType === "youtube" && ytUrl.trim()) ||
      (cType === "ppt"     && pptFile);
    if (!validContent) return;

    setSubmitting(true);
    setUploadPct(0);
    try {
      // Upload image (base64 → Storage)
      let finalImageUrl = imageUrl;
      if (cType === "image" && imageUrl.startsWith("data:")) {
        const { url } = await uploadImageDataUrl(user.uid, `actionboards/${boardId}`, `img_${Date.now()}.png`, imageUrl);
        finalImageUrl = url;
      }

      // Upload audio file → Storage
      let finalAudioUrl = audioUrl;
      if (cType === "audio" && audioFile) {
        const { url } = await uploadBoardFile(boardId, "audio", audioFile, setUploadPct);
        finalAudioUrl = url;
      }

      // Upload PPT file → Storage
      let finalPptUrl = "";
      if (cType === "ppt" && pptFile) {
        const { url } = await uploadBoardFile(boardId, "ppt", pptFile, setUploadPct);
        finalPptUrl = url;
      }

      const post: CloudBoardPost = {
        id: crypto.randomUUID(),
        boardId,
        uid: user.uid,
        authorName: user.displayName ?? "익명",
        authorPhoto: user.photoURL ?? "",
        contentType: cType,
        bgColor: cardColor,
        ...(isAnnouncement && { isAnnouncement: true }),
        createdAt: Date.now(),
        ...(cType === "text"    && { text: text.trim() }),
        ...(cType === "image"   && { imageUrl: finalImageUrl }),
        ...(cType === "audio"   && { audioUrl: finalAudioUrl, audioName: audioName || audioFile?.name || "오디오" }),
        ...(cType === "youtube" && { youtubeUrl: ytUrl.trim() }),
        ...(cType === "ppt"     && { pptUrl: finalPptUrl, pptName: pptName || pptFile?.name || "프레젠테이션" }),
      };
      await addBoardPost(boardId, post);
      setText(""); setImageUrl(""); setAudioUrl(""); setAudioName(""); setAudioFile(null);
      setYtUrl(""); setPptFile(null); setPptName(""); setIsAnnouncement(false);
      setCardColor(PALETTE[0]);
      setShowForm(false);
    } catch (e) {
      console.error("[ActionBoard] submit failed:", e);
      alert("등록 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
    setSubmitting(false);
    setUploadPct(0);
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F4F6FA" }}>
      <div style={{ fontSize:14, color:"#9CA3AF" }}>불러오는 중...</div>
    </div>
  );

  if (!board) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F4F6FA" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>😢</div>
        <div style={{ fontSize:16, color:"#374151" }}>보드를 찾을 수 없어요</div>
        <Link href="/actionboard" style={{ display:"inline-block", marginTop:16, color:P, fontWeight:600 }}>← 목록으로</Link>
      </div>
    </div>
  );

  const statusColors = { open:"#059669", upcoming:"#2563EB", closed:"#6B7280" };
  const statusLabels = { open:"🟢 입력 진행중", upcoming:"🔵 곧 시작", closed:"⚫ 입력 마감" };

  return (
    <div style={{ minHeight:"100vh", background:"#F0F2F8", fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .type-btn { transition:all 0.15s; cursor:pointer; }
        .type-btn:hover { border-color:${P}!important; }
        textarea:focus,input:focus { outline:none; border-color:${P}!important; }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 32px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Link href="/actionboard" style={{ display:"flex", alignItems:"center", gap:6, textDecoration:"none", fontSize:13, color:"#6B7280", fontWeight:600 }}>
            ← 액션보드
          </Link>
          <div style={{ width:1, height:16, background:"#E5E7EB" }} />
          <span style={{ fontSize:14, fontWeight:800, color:"#111827" }}>{board.title}</span>
          <span style={{ fontSize:11, fontWeight:700, color:statusColors[status], background:`${statusColors[status]}18`, padding:"3px 10px", borderRadius:100 }}>
            {statusLabels[status]}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, color:"#9CA3AF" }}>마감: {fmtDate(board.endAt)}</span>
          {status === "open" && (
            user
              ? <button onClick={() => setShowForm(true)} style={{ padding:"8px 18px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>+ 게시물 추가</button>
              : <button onClick={signIn} style={{ padding:"8px 18px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>로그인 후 참여</button>
          )}
        </div>
      </nav>

      {/* Board info bar */}
      <div style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"12px 32px", display:"flex", alignItems:"center", gap:24 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#6B7280" }}>
          {board.creatorPhoto && <img src={board.creatorPhoto} alt="" style={{ width:18, height:18, borderRadius:"50%" }} />}
          <span>개설자: <strong style={{ color:"#374151" }}>{board.creatorName}</strong></span>
        </div>
        <div style={{ fontSize:12, color:"#6B7280" }}>📅 {fmtDate(board.startAt)} ~ {fmtDate(board.endAt)}</div>
        <div style={{ fontSize:12, color:"#6B7280" }}>📝 {posts.length}개 게시물</div>
        {board.description && <div style={{ fontSize:12, color:"#6B7280" }}>💬 {board.description}</div>}
      </div>

      {/* Closed banner */}
      {status === "closed" && (
        <div style={{ background:"#FFF3CD", borderBottom:"1px solid #FCD34D", padding:"10px 32px", fontSize:13, color:"#92400E", fontWeight:600 }}>
          ⚠️ 입력 기간이 종료되었습니다. 게시물 열람만 가능합니다.
        </div>
      )}

      {/* ── Announcement banner ── */}
      {announcements.length > 0 && (
        <div style={{ background:"linear-gradient(135deg,rgba(124,58,237,0.06),rgba(236,72,153,0.04))", borderBottom:"1px solid rgba(124,58,237,0.12)", padding:"12px 24px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#7C3AED", letterSpacing:1, marginBottom:10 }}>📢 공지</div>
          <div style={{ display:"flex", gap:12, overflowX:"auto", paddingBottom:4 }}>
            {announcements.map(post => (
              <div key={post.id} style={{ flexShrink:0, width:260, background:post.bgColor ?? "#FFF9C4", borderRadius:14, padding:"14px 16px", boxShadow:"0 2px 8px rgba(0,0,0,0.08)", position:"relative" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                  {post.authorPhoto && <img src={post.authorPhoto} alt="" style={{ width:18, height:18, borderRadius:"50%" }} />}
                  <span style={{ fontSize:11, fontWeight:600, color:"#374151" }}>{post.authorName}</span>
                  <span style={{ fontSize:10, color:"#9CA3AF" }}>{fmtDate(post.createdAt)}</span>
                </div>
                {post.contentType === "text"  && <p style={{ fontSize:13, color:"#1F2937", lineHeight:1.6, whiteSpace:"pre-wrap" }}>{post.text}</p>}
                {post.contentType === "image" && post.imageUrl && <img src={post.imageUrl} alt="" style={{ width:"100%", borderRadius:8 }} />}
                {post.contentType === "youtube" && post.youtubeUrl && getYoutubeId(post.youtubeUrl) && <img src={`https://img.youtube.com/vi/${getYoutubeId(post.youtubeUrl)}/mqdefault.jpg`} alt="" style={{ width:"100%", borderRadius:8 }} />}
                {isAdmin && (
                  <button onClick={() => deleteBoardPost(boardId, post.id)} style={{ position:"absolute", top:8, right:8, background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF" }}>×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free-position canvas */}
      <div
        style={{ position:"relative", minHeight:"calc(100vh - 120px)", overflow:"visible" }}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Snap guide lines */}
        {snapLines.map((line, i) => (
          <div key={i} style={{
            position:"absolute", pointerEvents:"none", zIndex:998,
            ...(line.axis === "x"
              ? { left:line.pos, top:0, width:1, height:"100%", background:"rgba(37,99,235,0.7)", boxShadow:"0 0 4px rgba(37,99,235,0.5)" }
              : { top:line.pos,  left:0, height:1, width:"100%", background:"rgba(37,99,235,0.7)", boxShadow:"0 0 4px rgba(37,99,235,0.5)" }
            ),
          }} />
        ))}

        {normalPosts.length === 0 ? (
          <div style={{ textAlign:"center", padding:"80px 0", color:"#9CA3AF" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📝</div>
            <div style={{ fontSize:16, fontWeight:600 }}>아직 게시물이 없어요</div>
            {canPost && <div style={{ fontSize:13, marginTop:8 }}>첫 번째 메모를 붙여보세요!</div>}
          </div>
        ) : (
          normalPosts.map(post => {
            const pos = positions[post.id] ?? { x: 20, y: 20 };
            const isDragging = draggingId === post.id;
            return (
              <div
                key={post.id}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: CARD_W,
                  zIndex: isDragging ? 999 : 1,
                  transition: isDragging ? "none" : "left 0.08s ease, top 0.08s ease",
                }}
              >
                <PostCard
                  post={post}
                  canDelete={!!user && (user.uid === post.uid || user.uid === board.uid)}
                  onDelete={() => deleteBoardPost(boardId, post.id)}
                  onEdit={() => openEditPost(post)}
                  onOpenPpt={(url, name) => setPptViewer({ url, name })}
                  onMaximize={() => setMaximizedPost(post)}
                  onMouseDown={e => handleCardMouseDown(e, post.id)}
                  isDragging={isDragging}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Add post modal */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:"24px 24px 0 0", padding:"32px 28px", width:"100%", maxWidth:560, boxShadow:"0 -12px 40px rgba(0,0,0,0.15)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:20 }}>✍️ 게시물 작성</div>

            {/* Content type tabs */}
            <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
              {([["text","📝 텍스트"],["image","🖼️ 이미지"],["audio","🎵 MP3"],["youtube","▶ 유튜브"],["ppt","📊 PPT"]] as [ContentType,string][]).map(([t,label]) => (
                <button key={t} onClick={() => setCType(t)} className="type-btn" style={{ flex:1, minWidth:80, padding:"8px 0", borderRadius:10, border:`2px solid ${cType===t?P:"#E5E7EB"}`, background:cType===t?`rgba(124,58,237,0.07)`:"white", fontSize:12, fontWeight:700, color:cType===t?P:"#6B7280" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Inputs by type */}
            {cType === "text" && (
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="내용을 입력하세요..." rows={5}
                style={{ width:"100%", padding:"12px", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontFamily:"inherit", resize:"vertical" }} />
            )}

            {cType === "image" && (
              <div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { if(e.target.files?.[0]) handleImageFile(e.target.files[0]); }} />
                {imageUrl ? (
                  <div style={{ position:"relative" }}>
                    <img src={imageUrl} alt="" style={{ width:"100%", borderRadius:12, maxHeight:200, objectFit:"cover" }} />
                    <button onClick={() => setImageUrl("")} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.6)", border:"none", borderRadius:"50%", width:28, height:28, color:"white", cursor:"pointer", fontSize:14 }}>×</button>
                  </div>
                ) : (
                  <div onClick={() => fileRef.current?.click()} style={{ border:"2px dashed #E5E7EB", borderRadius:12, padding:"40px", textAlign:"center", cursor:"pointer", color:"#9CA3AF" }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>🖼️</div>
                    <div style={{ fontSize:13 }}>클릭하여 이미지 선택</div>
                  </div>
                )}
              </div>
            )}

            {cType === "audio" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <input ref={audioRef2} type="file" accept="audio/*" style={{ display:"none" }} onChange={e => { const f = e.target.files?.[0]; if(f){ setAudioFile(f); if(!audioName) setAudioName(f.name.replace(/\.[^/.]+$/,"")); } }} />
                <input value={audioName} onChange={e => setAudioName(e.target.value)} placeholder="트랙 제목" style={{ padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit" }} />
                {audioFile ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#F0FDF4", borderRadius:10, border:"1.5px solid #86EFAC" }}>
                    <span style={{ fontSize:20 }}>🎵</span>
                    <span style={{ fontSize:13, fontWeight:600, color:"#15803D", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{audioFile.name}</span>
                    <button onClick={() => setAudioFile(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:16 }}>×</button>
                  </div>
                ) : (
                  <div onClick={() => audioRef2.current?.click()} style={{ border:"2px dashed #E5E7EB", borderRadius:12, padding:"28px", textAlign:"center", cursor:"pointer", color:"#9CA3AF" }}>
                    <div style={{ fontSize:28, marginBottom:6 }}>🎵</div>
                    <div style={{ fontSize:13 }}>클릭하여 MP3 파일 선택</div>
                  </div>
                )}
              </div>
            )}

            {cType === "youtube" && (
              <input value={ytUrl} onChange={e => setYtUrl(e.target.value)} placeholder="YouTube URL (예: https://youtu.be/xxxxx)"
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit" }} />
            )}

            {cType === "ppt" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <input ref={pptFileRef} type="file" accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" style={{ display:"none" }} onChange={e => { const f = e.target.files?.[0]; if(f){ setPptFile(f); setPptName(f.name); } }} />
                {pptFile ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"#FFF7ED", borderRadius:10, border:"1.5px solid #FED7AA" }}>
                    <span style={{ fontSize:24 }}>📊</span>
                    <span style={{ fontSize:13, fontWeight:600, color:"#C2410C", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{pptFile.name}</span>
                    <button onClick={() => { setPptFile(null); setPptName(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:16 }}>×</button>
                  </div>
                ) : (
                  <div onClick={() => pptFileRef.current?.click()} style={{ border:"2px dashed #E5E7EB", borderRadius:12, padding:"28px", textAlign:"center", cursor:"pointer", color:"#9CA3AF" }}>
                    <div style={{ fontSize:28, marginBottom:6 }}>📊</div>
                    <div style={{ fontSize:13 }}>클릭하여 PPT / PPTX 파일 선택</div>
                    <div style={{ fontSize:11, marginTop:4, color:"#C4B5FD" }}>Microsoft Office Online으로 뷰어 제공</div>
                  </div>
                )}
                <input value={pptName} onChange={e => setPptName(e.target.value)} placeholder="발표 제목 (선택)" style={{ padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit" }} />
              </div>
            )}

            {/* Color palette */}
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>🎨 카드 배경색</div>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                {PALETTE.map(c => (
                  <div key={c} onClick={() => setCardColor(c)} style={{ width:28, height:28, borderRadius:8, background:c, border:`2.5px solid ${cardColor===c?"#7C3AED":"#E5E7EB"}`, cursor:"pointer", boxShadow:cardColor===c?"0 0 0 2px rgba(124,58,237,0.25)":"none", transition:"all 0.12s" }} />
                ))}
              </div>
            </div>

            {/* Admin announcement toggle */}
            {isAdmin && (
              <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", padding:"10px 14px", background:"rgba(124,58,237,0.05)", borderRadius:10, border:"1.5px solid rgba(124,58,237,0.15)" }}>
                <input type="checkbox" checked={isAnnouncement} onChange={e => setIsAnnouncement(e.target.checked)} style={{ width:16, height:16, accentColor:"#7C3AED" }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#7C3AED" }}>📢 공지로 등록</div>
                  <div style={{ fontSize:11, color:"#9CA3AF" }}>보드 최상단 고정 — 관리자만 가능</div>
                </div>
              </label>
            )}

            {/* Upload progress */}
            {submitting && uploadPct > 0 && uploadPct < 100 && (
              <div style={{ background:"#EDE9FE", borderRadius:10, height:6, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${uploadPct}%`, background:`linear-gradient(90deg,${P},${PINK})`, transition:"width 0.3s" }} />
              </div>
            )}

            <div style={{ display:"flex", gap:10, marginTop:20 }}>
              <button onClick={() => setShowForm(false)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{ flex:2, padding:"13px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:"white", cursor:"pointer", boxShadow:`0 4px 16px rgba(124,58,237,0.3)` }}
              >
                {submitting ? (uploadPct > 0 ? `업로드 ${uploadPct}%` : "등록 중...") : "📌 게시물 등록"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PPT full-screen viewer — rendered at root level to escape transform stacking context ── */}
      {pptViewer && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:9999, display:"flex", flexDirection:"column" }}>
          <div style={{ background:"#1a1a2e", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <span style={{ color:"white", fontSize:14, fontWeight:700 }}>📊 {pptViewer.name}</span>
            <div style={{ display:"flex", gap:10 }}>
              <a href={pptViewer.url} download target="_blank" rel="noreferrer"
                style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:10, padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:600, textDecoration:"none" }}>
                ⬇️ 다운로드
              </a>
              <button onClick={() => setPptViewer(null)} style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:10, padding:"8px 20px", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕ 닫기</button>
            </div>
          </div>
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(pptViewer.url)}&embedded=true`}
            style={{ flex:1, border:"none", width:"100%" }}
            allowFullScreen
          />
        </div>
      )}

      {/* ── Card maximize overlay ── */}
      {maximizedPost && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:9998, display:"flex", flexDirection:"column" }}>
          {/* Header */}
          <div style={{ background:"#1a1a2e", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {maximizedPost.authorPhoto && <img src={maximizedPost.authorPhoto} alt="" style={{ width:28, height:28, borderRadius:"50%" }} />}
              <span style={{ color:"white", fontSize:14, fontWeight:700 }}>{maximizedPost.authorName}</span>
              <span style={{ color:"rgba(255,255,255,0.5)", fontSize:12 }}>{fmtDate(maximizedPost.createdAt)}</span>
            </div>
            <button onClick={() => setMaximizedPost(null)} style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:10, padding:"8px 20px", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕ 닫기</button>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflow:"auto", display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
            {maximizedPost.contentType === "text" && (
              <div style={{ maxWidth:800, width:"100%", background:maximizedPost.bgColor ?? "#FFF9C4", borderRadius:24, padding:"48px 56px", fontSize:20, lineHeight:1.8, color:"#1F2937", whiteSpace:"pre-wrap" }}>
                {maximizedPost.text}
              </div>
            )}
            {maximizedPost.contentType === "image" && maximizedPost.imageUrl && (
              <img src={maximizedPost.imageUrl} alt="" style={{ maxWidth:"100%", maxHeight:"100%", borderRadius:16, objectFit:"contain" }} />
            )}
            {maximizedPost.contentType === "audio" && maximizedPost.audioUrl && (
              <div style={{ background:maximizedPost.bgColor ?? "#FFF9C4", borderRadius:24, padding:"60px 80px", textAlign:"center" }}>
                <div style={{ fontSize:64, marginBottom:24 }}>🎵</div>
                <div style={{ fontSize:22, fontWeight:700, color:"#1F2937", marginBottom:32 }}>{maximizedPost.audioName}</div>
                <audio controls src={maximizedPost.audioUrl} style={{ width:400 }} />
              </div>
            )}
            {maximizedPost.contentType === "youtube" && maximizedPost.youtubeUrl && (
              <div style={{ width:"100%", maxWidth:960 }}>
                <div style={{ position:"relative", paddingTop:"56.25%", borderRadius:16, overflow:"hidden" }}>
                  <iframe src={`https://www.youtube.com/embed/${getYoutubeId(maximizedPost.youtubeUrl)}?autoplay=1`}
                    style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} allowFullScreen allow="autoplay" />
                </div>
              </div>
            )}
            {maximizedPost.contentType === "ppt" && maximizedPost.pptUrl && (
              <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                  <a href={maximizedPost.pptUrl} download target="_blank" rel="noreferrer"
                    style={{ padding:"8px 20px", background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:10, fontSize:13, fontWeight:600, textDecoration:"none" }}>
                    ⬇️ PPT 다운로드
                  </a>
                </div>
                <iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(maximizedPost.pptUrl)}&embedded=true`}
                  style={{ flex:1, border:"none", width:"100%", minHeight:500, borderRadius:12 }} allowFullScreen />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit post modal ── */}
      {editPost && (
        <div onClick={() => setEditPost(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
            style={{ background:"white", borderRadius:24, padding:"36px 32px", width:"100%", maxWidth:460, boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}
          >
            <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:20 }}>✏️ 게시물 수정</div>

            {editPost.contentType === "text" && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>내용</label>
                <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={5}
                  style={{ width:"100%", padding:"12px", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontFamily:"inherit", resize:"vertical", outline:"none" }} />
              </div>
            )}
            {editPost.contentType === "audio" && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>트랙 제목</label>
                <input value={editField} onChange={e => setEditField(e.target.value)}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
                <div style={{ fontSize:11, color:"#9CA3AF", marginTop:6 }}>오디오 파일 교체는 지원하지 않습니다.</div>
              </div>
            )}
            {editPost.contentType === "youtube" && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>YouTube URL</label>
                <input value={editField} onChange={e => setEditField(e.target.value)} placeholder="https://youtu.be/..."
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
              </div>
            )}
            {editPost.contentType === "ppt" && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>발표 제목</label>
                <input value={editField} onChange={e => setEditField(e.target.value)}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
                <div style={{ fontSize:11, color:"#9CA3AF", marginTop:6 }}>PPT 파일 교체는 지원하지 않습니다.</div>
              </div>
            )}
            {editPost.contentType === "image" && editPost.imageUrl && (
              <div style={{ marginBottom:16 }}>
                <img src={editPost.imageUrl} alt="" style={{ width:"100%", borderRadius:12, maxHeight:160, objectFit:"cover" }} />
                <div style={{ fontSize:11, color:"#9CA3AF", marginTop:6 }}>배경색만 수정 가능합니다.</div>
              </div>
            )}

            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>🎨 카드 배경색</label>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                {PALETTE.map(c => (
                  <div key={c} onClick={() => setEditColor(c)} style={{ width:28, height:28, borderRadius:8, background:c, border:`2.5px solid ${editColor===c?"#7C3AED":"#E5E7EB"}`, cursor:"pointer", boxShadow:editColor===c?"0 0 0 2px rgba(124,58,237,0.25)":"none", transition:"all 0.12s" }} />
                ))}
              </div>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setEditPost(null)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button onClick={handleEditSave} disabled={editSaving}
                style={{ flex:2, padding:"13px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:"white", cursor:"pointer", boxShadow:`0 4px 16px rgba(124,58,237,0.3)` }}
              >
                {editSaving ? "저장 중..." : "✏️ 수정 완료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
