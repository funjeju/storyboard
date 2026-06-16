"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  subscribeToActionBoards,
  createActionBoard,
  updateActionBoard,
  deleteActionBoard,
  subscribeToFavorites,
  createFavorite,
  updateFavorite,
  deleteFavorite,
  subscribeToPosters,
  createPoster,
  updatePoster,
  deletePoster,
  posterImages,
  type CloudActionBoard,
  type CloudFavorite,
  type CloudPoster,
  type PosterImage,
} from "@/lib/firestoreHelpers";
import { uploadPosterImage, deleteStorageFile } from "@/lib/firebaseStorage";

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

function tsToDatePick(ts: number): DatePick {
  const d = new Date(ts);
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

  // create form state
  const [title, setTitle]         = useState("");
  const [desc, setDesc]           = useState("");
  const [startPick, setStartPick] = useState<DatePick>(() => nowPick(0));
  const [endPick, setEndPick]     = useState<DatePick>(() => nowPick(9));

  // edit state
  const [editBoard, setEditBoard]     = useState<CloudActionBoard | null>(null);
  const [editTitle, setEditTitle]     = useState("");
  const [editDesc, setEditDesc]       = useState("");
  const [editStart, setEditStart]     = useState<DatePick>(() => nowPick(0));
  const [editEnd, setEditEnd]         = useState<DatePick>(() => nowPick(9));
  const [editSaving, setEditSaving]   = useState(false);

  // delete state
  const [deleteTarget, setDeleteTarget] = useState<CloudActionBoard | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // favorites (즐겨찾기)
  const [favorites, setFavorites]   = useState<CloudFavorite[]>([]);
  const [showFavAdd, setShowFavAdd] = useState(false);
  const [favName, setFavName]       = useState("");
  const [favUrl, setFavUrl]         = useState("");
  const [favSaving, setFavSaving]   = useState(false);
  const [editFav, setEditFav]       = useState<CloudFavorite | null>(null);
  const [editFavName, setEditFavName] = useState("");
  const [editFavUrl, setEditFavUrl]   = useState("");
  const [editFavSaving, setEditFavSaving] = useState(false);

  // posters (공모전 / 프로젝트 포스터)
  const [posters, setPosters]         = useState<CloudPoster[]>([]);
  const [showPosterAdd, setShowPosterAdd] = useState(false);
  const [posterTitle, setPosterTitle] = useState("");
  const [posterLink, setPosterLink]   = useState("");
  const [posterFiles, setPosterFiles]     = useState<File[]>([]);
  const [posterPreviews, setPosterPreviews] = useState<string[]>([]);
  const [posterSaving, setPosterSaving]   = useState(false);
  const [posterProgress, setPosterProgress] = useState(0);
  const [viewPoster, setViewPoster]   = useState<CloudPoster | null>(null);
  const [viewIdx, setViewIdx]         = useState(0);
  const swipeStartX = useRef<number | null>(null);

  // poster edit
  const [editPoster, setEditPoster]   = useState<CloudPoster | null>(null);
  const [editPosterTitle, setEditPosterTitle] = useState("");
  const [editPosterLink, setEditPosterLink]   = useState("");
  const [editKeepImages, setEditKeepImages]   = useState<PosterImage[]>([]);
  const [editNewFiles, setEditNewFiles]       = useState<File[]>([]);
  const [editNewPreviews, setEditNewPreviews] = useState<string[]>([]);
  const [editRemovedPaths, setEditRemovedPaths] = useState<string[]>([]);
  const [editPosterSaving, setEditPosterSaving] = useState(false);
  const [editPosterProgress, setEditPosterProgress] = useState(0);

  const normUrl = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`;

  const handleAddFavorite = async () => {
    if (!favName.trim() || !favUrl.trim()) return;
    if (!user) { await signIn(); return; }
    setFavSaving(true);
    try {
      await createFavorite({
        id: crypto.randomUUID(),
        uid: user.uid,
        creatorName: user.displayName ?? "익명",
        name: favName.trim(),
        url: normUrl(favUrl.trim()),
        createdAt: Date.now(),
      });
      setShowFavAdd(false);
      setFavName(""); setFavUrl("");
    } catch { /* silent */ }
    setFavSaving(false);
  };

  const openEditFav = (fav: CloudFavorite, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setEditFav(fav);
    setEditFavName(fav.name);
    setEditFavUrl(fav.url);
  };

  const handleEditFavorite = async () => {
    if (!editFav || !editFavName.trim() || !editFavUrl.trim()) return;
    setEditFavSaving(true);
    try {
      await updateFavorite(editFav.id, {
        name: editFavName.trim(),
        url: normUrl(editFavUrl.trim()),
      });
      setEditFav(null);
    } catch { /* silent */ }
    setEditFavSaving(false);
  };

  const resetPosterForm = () => {
    setPosterTitle(""); setPosterLink("");
    setPosterFiles([]); setPosterPreviews([]); setPosterProgress(0);
  };

  const addPosterFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files).filter(f => f.type.startsWith("image/"));
    setPosterFiles(prev => [...prev, ...list]);
    list.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setPosterPreviews(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removePosterFile = (idx: number) => {
    setPosterFiles(prev => prev.filter((_, i) => i !== idx));
    setPosterPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddPoster = async () => {
    if (!posterFiles.length) return;
    if (!user) { await signIn(); return; }
    setPosterSaving(true);
    setPosterProgress(0);
    try {
      const id = crypto.randomUUID();
      const images: { url: string; path: string }[] = [];
      for (let i = 0; i < posterFiles.length; i++) {
        const { path, url } = await uploadPosterImage(id, posterFiles[i], undefined, i);
        images.push({ url, path });
        setPosterProgress(Math.round(((i + 1) / posterFiles.length) * 100));
      }
      await createPoster({
        id,
        uid: user.uid,
        creatorName: user.displayName ?? "익명",
        title: posterTitle.trim() || posterFiles[0].name,
        images,
        imageUrl: images[0].url,
        imagePath: images[0].path,
        ...(posterLink.trim() ? { linkUrl: normUrl(posterLink.trim()) } : {}),
        createdAt: Date.now(),
      });
      setShowPosterAdd(false);
      resetPosterForm();
    } catch { /* silent */ }
    setPosterSaving(false);
  };

  const handleDeletePoster = async (p: CloudPoster, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await deletePoster(p.id);
      posterImages(p).forEach(img => { if (img.path) deleteStorageFile(img.path); });
    } catch { /* silent */ }
  };

  const openPoster = (p: CloudPoster) => { setViewPoster(p); setViewIdx(0); };

  const openEditPoster = (p: CloudPoster, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setEditPoster(p);
    setEditPosterTitle(p.title);
    setEditPosterLink(p.linkUrl ?? "");
    setEditKeepImages(posterImages(p));
    setEditNewFiles([]); setEditNewPreviews([]); setEditRemovedPaths([]);
    setEditPosterProgress(0);
  };

  const removeKeepImage = (idx: number) => {
    setEditKeepImages(prev => {
      const img = prev[idx];
      if (img?.path) setEditRemovedPaths(r => [...r, img.path]);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const addEditFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files).filter(f => f.type.startsWith("image/"));
    setEditNewFiles(prev => [...prev, ...list]);
    list.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setEditNewPreviews(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removeEditNewFile = (idx: number) => {
    setEditNewFiles(prev => prev.filter((_, i) => i !== idx));
    setEditNewPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleEditPoster = async () => {
    if (!editPoster) return;
    if (editKeepImages.length + editNewFiles.length === 0) return; // 최소 1장
    setEditPosterSaving(true);
    setEditPosterProgress(0);
    try {
      const uploaded: PosterImage[] = [];
      for (let i = 0; i < editNewFiles.length; i++) {
        const { path, url } = await uploadPosterImage(editPoster.id, editNewFiles[i], undefined, Date.now() % 100000 + i);
        uploaded.push({ url, path });
        setEditPosterProgress(Math.round(((i + 1) / editNewFiles.length) * 100));
      }
      const images = [...editKeepImages, ...uploaded];
      await updatePoster(editPoster.id, {
        title: editPosterTitle.trim() || images[0].url.split("/").pop() || "포스터",
        linkUrl: editPosterLink.trim() ? normUrl(editPosterLink.trim()) : "",
        images,
        imageUrl: images[0].url,
        imagePath: images[0].path,
      });
      // 제거된 이미지 스토리지 정리
      editRemovedPaths.forEach(p => { if (p) deleteStorageFile(p); });
      setEditPoster(null);
    } catch { /* silent */ }
    setEditPosterSaving(false);
  };

  const openEdit = (b: CloudActionBoard, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setEditBoard(b);
    setEditTitle(b.title);
    setEditDesc(b.description);
    setEditStart(tsToDatePick(b.startAt));
    setEditEnd(tsToDatePick(b.endAt));
  };

  const openDelete = (b: CloudActionBoard, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDeleteTarget(b);
  };

  const handleEdit = async () => {
    if (!editBoard || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await updateActionBoard(editBoard.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        startAt: datepickToTs(editStart),
        endAt: datepickToTs(editEnd),
      });
      setEditBoard(null);
    } catch { /* silent */ }
    setEditSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteActionBoard(deleteTarget.id);
      setDeleteTarget(null);
    } catch { /* silent */ }
    setDeleting(false);
  };

  useEffect(() => {
    const unsubBoards = subscribeToActionBoards(setBoards);
    const unsubFavs   = subscribeToFavorites(setFavorites);
    const unsubPost   = subscribeToPosters(setPosters);
    return () => { unsubBoards(); unsubFavs(); unsubPost(); };
  }, []);

  // 포스터 뷰어 키보드 네비게이션
  useEffect(() => {
    if (!viewPoster) return;
    const imgs = posterImages(viewPoster);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setViewIdx(i => (i + 1) % imgs.length);
      else if (e.key === "ArrowLeft") setViewIdx(i => (i - 1 + imgs.length) % imgs.length);
      else if (e.key === "Escape") setViewPoster(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewPoster]);

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
        .fav-chip:hover { border-color:${P}!important; color:${P}!important; box-shadow:0 4px 12px rgba(124,58,237,0.18)!important; transform:translateY(-2px); }
        .poster-card:hover { transform:translateY(-5px); box-shadow:0 18px 36px rgba(0,0,0,0.16)!important; }
        .hscroll { scrollbar-width:thin; scrollbar-color:#CBD5E1 transparent; }
        .hscroll::-webkit-scrollbar { height:8px; }
        .hscroll::-webkit-scrollbar-track { background:transparent; }
        .hscroll::-webkit-scrollbar-thumb { background:#CBD5E1; border-radius:100px; }
        .hscroll::-webkit-scrollbar-thumb:hover { background:#94A3B8; }
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

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"40px 32px 80px" }}>

        {/* ── 즐겨찾기 (Favorites) ── */}
        <div style={{ marginBottom:28, animation:"fadeUp 0.4s ease both" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <span style={{ fontSize:15, fontWeight:800, color:"#0F172A" }}>⭐ 즐겨찾기</span>
            <span style={{ fontSize:12, color:"#9CA3AF" }}>자주 쓰는 링크를 버튼으로 모아두세요</span>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
            {favorites.map(fav => (
              <a
                key={fav.id}
                href={fav.url}
                target="_blank"
                rel="noopener noreferrer"
                className="fav-chip"
                style={{ position:"relative", display:"inline-flex", alignItems:"center", gap:8, padding:"9px 16px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:100, fontSize:13, fontWeight:700, color:"#374151", textDecoration:"none", boxShadow:"0 1px 3px rgba(0,0,0,0.05)", transition:"all 0.15s" }}
              >
                <span style={{ fontSize:14 }}>🔗</span>
                <span style={{ maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fav.name}</span>
                {user?.uid === fav.uid && (
                  <>
                    <span
                      onClick={e => openEditFav(fav, e)}
                      style={{ marginLeft:2, width:16, height:16, display:"inline-flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:"#F3F4F6", fontSize:10, cursor:"pointer" }}
                      title="수정"
                    >✏️</span>
                    <span
                      onClick={e => { e.preventDefault(); e.stopPropagation(); deleteFavorite(fav.id).catch(()=>{}); }}
                      style={{ width:16, height:16, display:"inline-flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:"#F3F4F6", color:"#9CA3AF", fontSize:11, fontWeight:700, cursor:"pointer" }}
                      title="삭제"
                    >×</span>
                  </>
                )}
              </a>
            ))}
            <button
              onClick={() => user ? setShowFavAdd(true) : signIn()}
              style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"9px 16px", background:"rgba(124,58,237,0.07)", border:`1.5px dashed ${P}`, borderRadius:100, fontSize:13, fontWeight:700, color:P, cursor:"pointer" }}
            >
              + 즐겨찾기 추가
            </button>
          </div>
        </div>

        {/* ── 포스터 (공모전 / 프로젝트) ── */}
        <div style={{ marginBottom:36, animation:"fadeUp 0.45s ease both" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <span style={{ fontSize:15, fontWeight:800, color:"#0F172A" }}>🖼️ 공모전 · 프로젝트 포스터</span>
            <span style={{ fontSize:12, color:"#9CA3AF" }}>포스터 이미지를 업로드해 보드처럼 모아보세요</span>
            <button
              onClick={() => user ? setShowPosterAdd(true) : signIn()}
              style={{ marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:6, padding:"8px 16px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer", boxShadow:"0 4px 14px rgba(124,58,237,0.28)" }}
            >
              + 포스터 업로드
            </button>
          </div>
          {posters.length === 0 ? (
            <div
              onClick={() => user ? setShowPosterAdd(true) : signIn()}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, padding:"44px 0", border:"2px dashed #E5E7EB", borderRadius:18, color:"#9CA3AF", cursor:"pointer", background:"rgba(255,255,255,0.5)" }}
            >
              <div style={{ fontSize:34 }}>🖼️</div>
              <div style={{ fontSize:14, fontWeight:600 }}>첫 번째 포스터를 올려보세요</div>
            </div>
          ) : (
            <div className="hscroll" style={{ display:"flex", gap:16, overflowX:"auto", paddingBottom:10, scrollSnapType:"x proximity" }}>
              {posters.map((p, i) => {
                const imgs = posterImages(p);
                return (
                <div
                  key={p.id}
                  onClick={() => openPoster(p)}
                  className="poster-card"
                  style={{ flex:"0 0 auto", width:200, scrollSnapAlign:"start", borderRadius:16, overflow:"hidden", background:"white", boxShadow:"0 2px 12px rgba(0,0,0,0.08)", cursor:"pointer", position:"relative", transition:"transform 0.2s ease, box-shadow 0.2s ease", animation:`fadeUp 0.4s ease ${i*0.05}s both` }}
                >
                  <div style={{ width:"100%", aspectRatio:"3 / 4", background:"#F3F4F6", overflow:"hidden", position:"relative" }}>
                    <img src={imgs[0]?.url} alt={p.title} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                    {imgs.length > 1 && (
                      <div style={{ position:"absolute", bottom:8, right:8, display:"flex", alignItems:"center", gap:4, padding:"3px 9px", borderRadius:100, background:"rgba(0,0,0,0.6)", color:"white", fontSize:11, fontWeight:700, backdropFilter:"blur(4px)" }}>
                        🖼️ {imgs.length}
                      </div>
                    )}
                  </div>
                  <div style={{ padding:"10px 12px" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1F2937", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.title}</div>
                    <div style={{ fontSize:11, color:"#9CA3AF", marginTop:2 }}>{p.creatorName}</div>
                  </div>
                  {user?.uid === p.uid && (
                    <div style={{ position:"absolute", top:8, right:8, display:"flex", gap:6 }}>
                      <button
                        onClick={e => openEditPoster(p, e)}
                        style={{ width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:8, background:"rgba(0,0,0,0.55)", border:"none", color:"white", fontSize:12, cursor:"pointer", backdropFilter:"blur(4px)" }}
                        title="수정"
                      >✏️</button>
                      <button
                        onClick={e => handleDeletePoster(p, e)}
                        style={{ width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:8, background:"rgba(0,0,0,0.55)", border:"none", color:"white", fontSize:13, cursor:"pointer", backdropFilter:"blur(4px)" }}
                        title="삭제"
                      >🗑</button>
                    </div>
                  )}
                  {p.linkUrl && (
                    <div style={{ position:"absolute", top:8, left:8, padding:"3px 8px", borderRadius:8, background:"rgba(0,0,0,0.55)", color:"white", fontSize:10, fontWeight:700, backdropFilter:"blur(4px)" }}>🔗 링크</div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

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
          <div className="hscroll" style={{ display:"flex", gap:20, overflowX:"auto", paddingBottom:12, scrollSnapType:"x proximity" }}>
            {filtered.map((board, i) => {
              const status = getBoardStatus(board);
              const st = STATUS_LABEL[status];
              const grad = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
              return (
                <Link key={board.id} href={`/actionboard/${board.id}`} style={{ textDecoration:"none", flex:"0 0 auto", width:300, scrollSnapAlign:"start" }}>
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
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {user?.uid === board.uid && (
                            <>
                              <button
                                onClick={e => openEdit(board, e)}
                                style={{ padding:"4px 10px", background:"#F3F4F6", border:"none", borderRadius:7, fontSize:12, fontWeight:600, color:"#374151", cursor:"pointer" }}
                              >✏️ 수정</button>
                              <button
                                onClick={e => openDelete(board, e)}
                                style={{ padding:"4px 10px", background:"#FEF2F2", border:"none", borderRadius:7, fontSize:12, fontWeight:600, color:"#DC2626", cursor:"pointer" }}
                              >🗑 삭제</button>
                            </>
                          )}
                          <span style={{ fontSize:13, fontWeight:700, color:P }}>열기 →</span>
                        </div>
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
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"40px 36px", width:"100%", maxWidth:460, boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
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

      {/* ── Edit modal ── */}
      {editBoard && (
        <div onClick={() => setEditBoard(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"40px 36px", width:"100%", maxWidth:460, boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:20, fontWeight:800, color:"#111827", marginBottom:6 }}>✏️ 보드 수정</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>{editBoard.title}</div>

            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>보드 제목 *</label>
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>설명 (선택)</label>
                <input
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
              <DateTimePicker label="입력 시작" icon="📅" value={editStart} onChange={setEditStart} />
              <DateTimePicker label="입력 마감" icon="🔒" value={editEnd} onChange={setEditEnd} />
            </div>

            <div style={{ display:"flex", gap:10, marginTop:28 }}>
              <button onClick={() => setEditBoard(null)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>
                취소
              </button>
              <button
                onClick={handleEdit}
                disabled={editSaving || !editTitle.trim()}
                style={{ flex:2, padding:"13px", background:editTitle.trim()?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:editTitle.trim()?"white":"#9CA3AF", cursor:editTitle.trim()?"pointer":"default", boxShadow:editTitle.trim()?`0 4px 16px rgba(124,58,237,0.3)`:"none" }}
              >
                {editSaving ? "저장 중..." : "✏️ 수정 완료"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <div onClick={() => setDeleteTarget(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"36px", width:"100%", maxWidth:380, textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:44, marginBottom:14 }}>🗑</div>
            <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:8 }}>보드를 삭제할까요?</div>
            <div style={{ fontSize:14, color:"#6B7280", lineHeight:1.6, marginBottom:8 }}>
              <strong style={{ color:"#374151" }}>"{deleteTarget.title}"</strong>
            </div>
            <div style={{ fontSize:13, color:"#EF4444", background:"#FEF2F2", borderRadius:10, padding:"10px 14px", marginBottom:24 }}>
              ⚠️ 보드 안의 모든 게시물도 함께 삭제됩니다.<br />이 작업은 되돌릴 수 없습니다.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ flex:1, padding:"13px", background:"#EF4444", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:"white", cursor:"pointer" }}
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 즐겨찾기 추가 모달 ── */}
      {showFavAdd && (
        <div onClick={() => setShowFavAdd(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"36px", width:"100%", maxWidth:420, boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:6 }}>⭐ 즐겨찾기 추가</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>이름과 주소를 입력하면 버튼으로 추가됩니다</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>이름 *</label>
                <input
                  value={favName}
                  onChange={e => setFavName(e.target.value)}
                  placeholder="예: Suno AI"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>주소 (URL) *</label>
                <input
                  value={favUrl}
                  onChange={e => setFavUrl(e.target.value)}
                  placeholder="예: suno.com"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:26 }}>
              <button onClick={() => setShowFavAdd(false)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button
                onClick={handleAddFavorite}
                disabled={favSaving || !favName.trim() || !favUrl.trim()}
                style={{ flex:2, padding:"13px", background:(favName.trim()&&favUrl.trim())?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:(favName.trim()&&favUrl.trim())?"white":"#9CA3AF", cursor:(favName.trim()&&favUrl.trim())?"pointer":"default" }}
              >
                {favSaving ? "추가 중..." : "⭐ 추가"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 즐겨찾기 수정 모달 ── */}
      {editFav && (
        <div onClick={() => setEditFav(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"36px", width:"100%", maxWidth:420, boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:6 }}>✏️ 즐겨찾기 수정</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>이름과 주소를 변경하세요</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>이름 *</label>
                <input
                  value={editFavName}
                  onChange={e => setEditFavName(e.target.value)}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>주소 (URL) *</label>
                <input
                  value={editFavUrl}
                  onChange={e => setEditFavUrl(e.target.value)}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:26 }}>
              <button onClick={() => setEditFav(null)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button
                onClick={handleEditFavorite}
                disabled={editFavSaving || !editFavName.trim() || !editFavUrl.trim()}
                style={{ flex:2, padding:"13px", background:(editFavName.trim()&&editFavUrl.trim())?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:(editFavName.trim()&&editFavUrl.trim())?"white":"#9CA3AF", cursor:(editFavName.trim()&&editFavUrl.trim())?"pointer":"default" }}
              >
                {editFavSaving ? "저장 중..." : "✏️ 수정 완료"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 포스터 업로드 모달 ── */}
      {showPosterAdd && (
        <div onClick={() => { if(!posterSaving){ setShowPosterAdd(false); } }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"36px", width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:6 }}>🖼️ 포스터 업로드</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>여러 장 올리면 첫 장이 표지가 되고, 클릭 시 넘겨볼 수 있어요</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* 선택된 이미지 미리보기 그리드 */}
              {posterPreviews.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
                  {posterPreviews.map((src, idx) => (
                    <div key={idx} style={{ position:"relative", aspectRatio:"3 / 4", borderRadius:10, overflow:"hidden", border:idx===0?`2px solid ${P}`:"1.5px solid #E5E7EB", background:"#F3F4F6" }}>
                      <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                      {idx === 0 && (
                        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"3px 0", textAlign:"center", background:P, color:"white", fontSize:10, fontWeight:700 }}>표지</div>
                      )}
                      {!posterSaving && (
                        <button
                          onClick={() => removePosterFile(idx)}
                          style={{ position:"absolute", top:4, right:4, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:"rgba(0,0,0,0.6)", border:"none", color:"white", fontSize:12, cursor:"pointer" }}
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* 이미지 선택 (추가) */}
              <label style={{ display:"block", cursor:"pointer" }}>
                <input type="file" accept="image/*" multiple onChange={e => { addPosterFiles(e.target.files); e.target.value=""; }} style={{ display:"none" }} />
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, padding:posterPreviews.length?"22px 0":"40px 0", border:"2px dashed #E5E7EB", borderRadius:12, color:"#9CA3AF" }}>
                  <div style={{ fontSize:posterPreviews.length?22:30 }}>📤</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{posterPreviews.length ? "이미지 더 추가" : "클릭해서 이미지 선택 (여러 장 가능)"}</div>
                </div>
              </label>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>제목 (선택)</label>
                <input
                  value={posterTitle}
                  onChange={e => setPosterTitle(e.target.value)}
                  placeholder="예: 2026 AI 해커톤"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>링크 (선택)</label>
                <input
                  value={posterLink}
                  onChange={e => setPosterLink(e.target.value)}
                  placeholder="클릭 시 이동할 주소 (선택)"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:26 }}>
              <button onClick={() => { if(!posterSaving){ setShowPosterAdd(false); } }} disabled={posterSaving} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:posterSaving?"default":"pointer" }}>취소</button>
              <button
                onClick={handleAddPoster}
                disabled={posterSaving || !posterFiles.length}
                style={{ flex:2, padding:"13px", background:posterFiles.length?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:posterFiles.length?"white":"#9CA3AF", cursor:posterFiles.length?"pointer":"default" }}
              >
                {posterSaving ? `업로드 중... ${posterProgress}%` : `🖼️ 업로드${posterFiles.length>1?` (${posterFiles.length}장)`:""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 포스터 수정 모달 ── */}
      {editPoster && (
        <div onClick={() => { if(!editPosterSaving){ setEditPoster(null); } }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"36px", width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:6 }}>✏️ 포스터 수정</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>이미지를 추가·삭제하거나 정보를 변경하세요 (첫 장이 표지)</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* 이미지 그리드: 기존 + 새 추가 */}
              {(editKeepImages.length + editNewPreviews.length) > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
                  {editKeepImages.map((img, idx) => (
                    <div key={`k${idx}`} style={{ position:"relative", aspectRatio:"3 / 4", borderRadius:10, overflow:"hidden", border:idx===0?`2px solid ${P}`:"1.5px solid #E5E7EB", background:"#F3F4F6" }}>
                      <img src={img.url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                      {idx === 0 && <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"3px 0", textAlign:"center", background:P, color:"white", fontSize:10, fontWeight:700 }}>표지</div>}
                      {!editPosterSaving && (
                        <button onClick={() => removeKeepImage(idx)} style={{ position:"absolute", top:4, right:4, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:"rgba(0,0,0,0.6)", border:"none", color:"white", fontSize:12, cursor:"pointer" }}>×</button>
                      )}
                    </div>
                  ))}
                  {editNewPreviews.map((src, idx) => {
                    const coverIdx = editKeepImages.length === 0 && idx === 0;
                    return (
                    <div key={`n${idx}`} style={{ position:"relative", aspectRatio:"3 / 4", borderRadius:10, overflow:"hidden", border:coverIdx?`2px solid ${P}`:"1.5px solid #E5E7EB", background:"#F3F4F6" }}>
                      <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"3px 0", textAlign:"center", background:coverIdx?P:"rgba(16,185,129,0.9)", color:"white", fontSize:10, fontWeight:700 }}>{coverIdx ? "표지" : "새 이미지"}</div>
                      {!editPosterSaving && (
                        <button onClick={() => removeEditNewFile(idx)} style={{ position:"absolute", top:4, right:4, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:"rgba(0,0,0,0.6)", border:"none", color:"white", fontSize:12, cursor:"pointer" }}>×</button>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
              {(editKeepImages.length + editNewPreviews.length) === 0 && (
                <div style={{ padding:"10px 14px", borderRadius:10, background:"#FEF2F2", color:"#DC2626", fontSize:12, fontWeight:600 }}>⚠️ 최소 1장의 이미지가 필요합니다</div>
              )}
              <label style={{ display:"block", cursor:"pointer" }}>
                <input type="file" accept="image/*" multiple onChange={e => { addEditFiles(e.target.files); e.target.value=""; }} style={{ display:"none" }} />
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, padding:"20px 0", border:"2px dashed #E5E7EB", borderRadius:12, color:"#9CA3AF" }}>
                  <div style={{ fontSize:22 }}>📤</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>이미지 더 추가</div>
                </div>
              </label>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>제목 (선택)</label>
                <input
                  value={editPosterTitle}
                  onChange={e => setEditPosterTitle(e.target.value)}
                  placeholder="예: 2026 AI 해커톤"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>링크 (선택)</label>
                <input
                  value={editPosterLink}
                  onChange={e => setEditPosterLink(e.target.value)}
                  placeholder="클릭 시 이동할 주소 (선택)"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:26 }}>
              <button onClick={() => { if(!editPosterSaving){ setEditPoster(null); } }} disabled={editPosterSaving} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:editPosterSaving?"default":"pointer" }}>취소</button>
              <button
                onClick={handleEditPoster}
                disabled={editPosterSaving || (editKeepImages.length + editNewFiles.length === 0)}
                style={{ flex:2, padding:"13px", background:(editKeepImages.length + editNewFiles.length)?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:(editKeepImages.length + editNewFiles.length)?"white":"#9CA3AF", cursor:(editKeepImages.length + editNewFiles.length)?"pointer":"default" }}
              >
                {editPosterSaving ? (editNewFiles.length ? `저장 중... ${editPosterProgress}%` : "저장 중...") : "✏️ 수정 완료"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 포스터 크게 보기 모달 (캐러셀) ── */}
      {viewPoster && (() => {
        const imgs = posterImages(viewPoster);
        const idx = Math.min(viewIdx, imgs.length - 1);
        const go = (dir: number) => setViewIdx((idx + dir + imgs.length) % imgs.length);
        return (
        <div onClick={() => setViewPoster(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:600, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32, gap:16 }}>
          {/* 닫기 */}
          <button onClick={() => setViewPoster(null)} style={{ position:"absolute", top:20, right:24, width:40, height:40, borderRadius:"50%", background:"rgba(255,255,255,0.12)", border:"none", color:"white", fontSize:20, cursor:"pointer" }}>×</button>

          <div
            onClick={e => e.stopPropagation()}
            onTouchStart={e => { swipeStartX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
              if (swipeStartX.current == null || imgs.length < 2) return;
              const dx = e.changedTouches[0].clientX - swipeStartX.current;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
              swipeStartX.current = null;
            }}
            style={{ position:"relative", display:"flex", alignItems:"center", justifyContent:"center", width:"100%", maxWidth:900 }}
          >
            {imgs.length > 1 && (
              <button onClick={() => go(-1)} style={{ position:"absolute", left:0, transform:"translateX(-120%)", width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,0.15)", border:"none", color:"white", fontSize:24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>‹</button>
            )}
            <img src={imgs[idx]?.url} alt={viewPoster.title} style={{ maxWidth:"90vw", maxHeight:"74vh", objectFit:"contain", borderRadius:14, boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }} />
            {imgs.length > 1 && (
              <button onClick={() => go(1)} style={{ position:"absolute", right:0, transform:"translateX(120%)", width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,0.15)", border:"none", color:"white", fontSize:24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>›</button>
            )}
          </div>

          {/* 페이지 인디케이터 (점) */}
          {imgs.length > 1 && (
            <div onClick={e => e.stopPropagation()} style={{ display:"flex", gap:8, alignItems:"center" }}>
              {imgs.map((_, i) => (
                <span key={i} onClick={() => setViewIdx(i)} style={{ width:i===idx?22:8, height:8, borderRadius:100, background:i===idx?"white":"rgba(255,255,255,0.4)", cursor:"pointer", transition:"all 0.2s" }} />
              ))}
              <span style={{ color:"rgba(255,255,255,0.7)", fontSize:12, fontWeight:600, marginLeft:6 }}>{idx+1} / {imgs.length}</span>
            </div>
          )}

          <div onClick={e => e.stopPropagation()} style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ color:"white", fontSize:16, fontWeight:700 }}>{viewPoster.title}</div>
            {viewPoster.linkUrl && (
              <a href={viewPoster.linkUrl} target="_blank" rel="noopener noreferrer" style={{ padding:"8px 16px", background:`linear-gradient(135deg,${P},${PINK})`, borderRadius:10, fontSize:13, fontWeight:700, color:"white", textDecoration:"none" }}>🔗 링크 열기</a>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
