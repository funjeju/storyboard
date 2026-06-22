"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  subscribeToActionBoards,
  createActionBoard,
  updateActionBoard,
  updateBoardOrder,
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
  subscribeToStickyNotes,
  createStickyNote,
  updateStickyNote,
  deleteStickyNote,
  subscribeToTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type CloudActionBoard,
  type CloudFavorite,
  type CloudPoster,
  type PosterImage,
  type CloudStickyNote,
  type CloudTodo,
  type TodoSubtask,
} from "@/lib/firestoreHelpers";
import { uploadPosterImage, deleteStorageFile } from "@/lib/firebaseStorage";

const P = "#7C3AED";
const PINK = "#EC4899";
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com";

// 포스트잇 색상 팔레트
const STICKY_COLORS = ["#FFF59D", "#FFCDD2", "#C8E6C9", "#BBDEFB", "#FFE0B2", "#E1BEE7", "#B2EBF2"];

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

type EditItem =
  | { kind: "existing"; img: PosterImage }
  | { kind: "new"; file: File; preview: string };

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

  // 공용 삭제 확인
  const [confirmDel, setConfirmDel] = useState<{ text: string; run: () => void } | null>(null);
  const confirmDelete = (text: string, run: () => void) => setConfirmDel({ text, run });

  // QR state
  const [qrBoard, setQrBoard]   = useState<CloudActionBoard | null>(null);
  const [qrUrl, setQrUrl]       = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrCopied, setQrCopied] = useState(false);

  const openQr = async (b: CloudActionBoard, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const url = `${window.location.origin}/actionboard/${b.id}`;
    setQrBoard(b); setQrUrl(url); setQrDataUrl(""); setQrCopied(false);
    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(url, { width: 520, margin: 2, color: { dark: "#0F172A", light: "#FFFFFF" } });
      setQrDataUrl(dataUrl);
    } catch { /* silent */ }
  };

  const downloadQr = () => {
    if (!qrDataUrl || !qrBoard) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR_${qrBoard.title.replace(/[^a-zA-Z0-9가-힣]+/g, "_")}.png`;
    a.click();
  };

  const copyQrUrl = () => {
    navigator.clipboard?.writeText(qrUrl).then(() => {
      setQrCopied(true);
      setTimeout(() => setQrCopied(false), 1800);
    }).catch(() => {});
  };

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
  const [posterBody, setPosterBody]   = useState("");
  const [posterLink, setPosterLink]   = useState("");
  const [posterFiles, setPosterFiles]     = useState<File[]>([]);
  const [posterPreviews, setPosterPreviews] = useState<string[]>([]);
  const [posterSaving, setPosterSaving]   = useState(false);
  const [posterProgress, setPosterProgress] = useState(0);
  const [showAllPosters, setShowAllPosters] = useState(false);
  const [viewPoster, setViewPoster]   = useState<CloudPoster | null>(null);
  const [viewIdx, setViewIdx]         = useState(0);
  const swipeStartX = useRef<number | null>(null);

  // poster edit
  const [editPoster, setEditPoster]   = useState<CloudPoster | null>(null);
  const [editPosterTitle, setEditPosterTitle] = useState("");
  const [editPosterBody, setEditPosterBody]   = useState("");
  const [editPosterLink, setEditPosterLink]   = useState("");
  const [editItems, setEditItems]             = useState<EditItem[]>([]);
  const [editRemovedPaths, setEditRemovedPaths] = useState<string[]>([]);
  const [editPosterSaving, setEditPosterSaving] = useState(false);
  const [editPosterProgress, setEditPosterProgress] = useState(0);

  // sticky notes (포스트잇 메모)
  const [notes, setNotes]           = useState<CloudStickyNote[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteColor, setNewNoteColor] = useState(STICKY_COLORS[0]);
  const [editNoteId, setEditNoteId]   = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [viewNote, setViewNote]       = useState<CloudStickyNote | null>(null);
  const isLongNote = (t: string) => t.length > 90 || t.split("\n").length > 6;

  // todos (투두)
  const [todos, setTodos]           = useState<CloudTodo[]>([]);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoDue, setNewTodoDue]   = useState("");  // yyyy-mm-dd
  const [calMonth, setCalMonth]       = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [calSelKey, setCalSelKey]     = useState<string | null>(null);
  const dayKey = (y: number, m: number, d: number) => `${y}-${m}-${d}`;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;
    if (!user) { await signIn(); return; }
    try {
      await createStickyNote({
        id: crypto.randomUUID(),
        uid: user.uid,
        creatorName: user.displayName ?? "익명",
        text: newNoteText.trim(),
        color: newNoteColor,
        createdAt: Date.now(),
      });
      setNewNoteText("");
    } catch { /* silent */ }
  };

  const startEditNote = (n: CloudStickyNote) => { setEditNoteId(n.id); setEditNoteText(n.text); };
  const saveEditNote = async (n: CloudStickyNote) => {
    if (!editNoteText.trim()) return;
    try { await updateStickyNote(n.id, { text: editNoteText.trim() }); } catch { /* silent */ }
    setEditNoteId(null);
  };
  const changeNoteColor = (n: CloudStickyNote, color: string) => {
    updateStickyNote(n.id, { color }).catch(() => {});
  };

  const dateInputToTs = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
  const tsToDateInput = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const fmtDay = (ts: number) => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}`; };

  const handleAddTodo = async () => {
    if (!newTodoText.trim()) return;
    if (!user) { await signIn(); return; }
    try {
      await createTodo({
        id: crypto.randomUUID(),
        uid: user.uid,
        creatorName: user.displayName ?? "익명",
        text: newTodoText.trim(),
        done: false,
        createdAt: Date.now(),
        ...(newTodoDue ? { dueAt: dateInputToTs(newTodoDue) } : {}),
      });
      setNewTodoText(""); setNewTodoDue("");
    } catch { /* silent */ }
  };

  const toggleTodo = (t: CloudTodo) => { updateTodo(t.id, { done: !t.done }).catch(() => {}); };
  const setTodoDue = (t: CloudTodo, s: string) => { updateTodo(t.id, { dueAt: s ? dateInputToTs(s) : null }).catch(() => {}); };

  // 하위 항목(subtask) 관련
  const [expandedTodos, setExpandedTodos] = useState<Record<string, boolean>>({});
  const [subInputs, setSubInputs]         = useState<Record<string, string>>({});
  const [todoNotice, setTodoNotice]       = useState<string | null>(null);

  const toggleExpand = (id: string) => setExpandedTodos(p => ({ ...p, [id]: !p[id] }));

  // 부모 체크 시도: 미완료 하위가 있으면 안내 후 막기
  const tryToggleTodo = (t: CloudTodo) => {
    const subs = t.subtasks ?? [];
    if (!t.done && subs.length > 0 && subs.some(s => !s.done)) {
      setTodoNotice(t.id);
      setExpandedTodos(p => ({ ...p, [t.id]: true }));
      setTimeout(() => setTodoNotice(n => (n === t.id ? null : n)), 2800);
      return;
    }
    toggleTodo(t);
  };

  const addSubtask = (t: CloudTodo) => {
    const text = (subInputs[t.id] ?? "").trim();
    if (!text) return;
    const subs: TodoSubtask[] = [...(t.subtasks ?? []), { id: crypto.randomUUID(), text, done: false }];
    updateTodo(t.id, { subtasks: subs, ...(t.done ? { done: false } : {}) }).catch(() => {});
    setSubInputs(p => ({ ...p, [t.id]: "" }));
  };

  const toggleSubtask = (t: CloudTodo, sid: string) => {
    const subs = (t.subtasks ?? []).map(s => (s.id === sid ? { ...s, done: !s.done } : s));
    updateTodo(t.id, { subtasks: subs }).catch(() => {});
  };

  const deleteSubtask = (t: CloudTodo, sid: string) => {
    const subs = (t.subtasks ?? []).filter(s => s.id !== sid);
    updateTodo(t.id, { subtasks: subs }).catch(() => {});
  };

  const normUrl = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`;

  // 텍스트 속 URL을 클릭 가능한 링크로 변환
  const linkify = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi);
    return parts.map((part, i) => {
      if (/^(https?:\/\/|www\.)/i.test(part)) {
        const href = part.startsWith("http") ? part : `https://${part}`;
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color:"#2563EB", textDecoration:"underline", wordBreak:"break-all" }}
          >{part}</a>
        );
      }
      return part;
    });
  };

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
    setPosterTitle(""); setPosterBody(""); setPosterLink("");
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

  // 표지로 지정 = 해당 이미지를 맨 앞으로 이동
  const setPosterCover = (idx: number) => {
    setPosterFiles(prev => { const a = [...prev]; const [m] = a.splice(idx, 1); a.unshift(m); return a; });
    setPosterPreviews(prev => { const a = [...prev]; const [m] = a.splice(idx, 1); a.unshift(m); return a; });
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
        ...(posterBody.trim() ? { body: posterBody.trim() } : {}),
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

  const handleDeletePoster = (p: CloudPoster, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    confirmDelete("이 포스터를 삭제할까요?", async () => {
      try {
        await deletePoster(p.id);
        posterImages(p).forEach(img => { if (img.path) deleteStorageFile(img.path); });
      } catch { /* silent */ }
    });
  };

  const openPoster = (p: CloudPoster) => { setViewPoster(p); setViewIdx(0); };

  const posterCard = (p: CloudPoster, i: number) => {
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
          {p.body
            ? <div style={{ fontSize:11, color:"#6B7280", marginTop:3, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{p.body}</div>
            : <div style={{ fontSize:11, color:"#9CA3AF", marginTop:2 }}>{p.creatorName}</div>}
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
  };

  const openEditPoster = (p: CloudPoster, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setEditPoster(p);
    setEditPosterTitle(p.title);
    setEditPosterBody(p.body ?? "");
    setEditPosterLink(p.linkUrl ?? "");
    setEditItems(posterImages(p).map(img => ({ kind: "existing" as const, img })));
    setEditRemovedPaths([]);
    setEditPosterProgress(0);
  };

  const addEditFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files).filter(f => f.type.startsWith("image/"));
    setEditItems(prev => [...prev, ...list.map(f => ({ kind: "new" as const, file: f, preview: URL.createObjectURL(f) }))]);
  };

  const removeEditItem = (idx: number) => {
    setEditItems(prev => {
      const it = prev[idx];
      if (it?.kind === "existing" && it.img.path) setEditRemovedPaths(r => [...r, it.img.path]);
      if (it?.kind === "new") URL.revokeObjectURL(it.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // 표지로 지정 = 맨 앞으로 이동 (기존/새 이미지 모두 가능)
  const setEditCover = (idx: number) => {
    setEditItems(prev => { const a = [...prev]; const [m] = a.splice(idx, 1); a.unshift(m); return a; });
  };

  const handleEditPoster = async () => {
    if (!editPoster) return;
    if (editItems.length === 0) return; // 최소 1장
    setEditPosterSaving(true);
    setEditPosterProgress(0);
    try {
      const newCount = editItems.filter(i => i.kind === "new").length;
      let done = 0;
      const images: PosterImage[] = [];
      for (let i = 0; i < editItems.length; i++) {
        const it = editItems[i];
        if (it.kind === "existing") {
          images.push(it.img);
        } else {
          const { path, url } = await uploadPosterImage(editPoster.id, it.file, undefined, Date.now() % 100000 + i);
          images.push({ url, path });
          done++;
          if (newCount) setEditPosterProgress(Math.round((done / newCount) * 100));
        }
      }
      await updatePoster(editPoster.id, {
        title: editPosterTitle.trim() || "포스터",
        body: editPosterBody.trim(),
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
    const unsubNotes  = subscribeToStickyNotes(setNotes);
    const unsubTodos  = subscribeToTodos(setTodos);
    return () => { unsubBoards(); unsubFavs(); unsubPost(); unsubNotes(); unsubTodos(); };
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

  const isAdmin = !!user && !!ADMIN_EMAIL && user.email === ADMIN_EMAIL;

  // 수동 순서(order) 우선, 없으면 최신순
  const sortedBoards = [...boards].sort((a, b) => {
    const ao = a.order, bo = b.order;
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return b.createdAt - a.createdAt;
  });
  const filtered = sortedBoards.filter(b => filter === "all" || getBoardStatus(b) === filter);

  // 보드 순서 이동(관리자) — 전체 정렬 목록 기준으로 스왑 후 전체 재인덱싱
  const moveBoard = async (id: string, dir: "left" | "right", e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const list = [...sortedBoards];
    const i = list.findIndex(b => b.id === id);
    const j = dir === "left" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((b, idx) => updateBoardOrder(b.id, idx).catch(() => {})));
  };

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
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Gowun+Dodum&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .sec { scroll-margin-top:84px; }
        .sec-menu-btn { transition:all 0.15s; cursor:pointer; }
        .sec-menu-btn:hover { background:rgba(124,58,237,0.1)!important; color:${P}!important; }
        .sticky-note { transition:transform 0.18s ease, box-shadow 0.18s ease; }
        .sticky-note:hover { transform:translateY(-4px) rotate(0deg)!important; box-shadow:0 14px 30px rgba(0,0,0,0.18)!important; z-index:5; }
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
          <span style={{ fontSize:14, fontWeight:700, color:P, whiteSpace:"nowrap" }}>📋 액션보드</span>
        </div>

        {/* 섹션 이동 메뉴 (nav 중앙) */}
        <div className="hscroll" style={{ flex:1, display:"flex", gap:6, justifyContent:"center", alignItems:"center", overflowX:"auto", margin:"0 16px" }}>
          {[
            { id:"sec-fav",    label:"⭐ 즐겨찾기" },
            { id:"sec-posters",label:"🖼️ 포스터" },
            { id:"sec-notes",  label:"📝 메모" },
            { id:"sec-todos",  label:"✅ 투두" },
            { id:"sec-boards", label:"📋 액션보드" },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => scrollToSection(m.id)}
              className="sec-menu-btn"
              style={{ flex:"0 0 auto", padding:"6px 13px", borderRadius:100, border:"none", background:"#F4F6FA", fontSize:13, fontWeight:700, color:"#6B7280", whiteSpace:"nowrap" }}
            >
              {m.label}
            </button>
          ))}
          <Link
            href="/mapboard"
            className="sec-menu-btn"
            style={{ flex:"0 0 auto", padding:"6px 13px", borderRadius:100, background:"rgba(124,58,237,0.1)", fontSize:13, fontWeight:700, color:P, whiteSpace:"nowrap", textDecoration:"none" }}
          >
            🗺️ 지도
          </Link>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:12, flex:"0 0 auto" }}>
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

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"28px 32px 80px", display:"flex", flexDirection:"column" }}>

        {/* ── 즐겨찾기 (Favorites) ── */}
        <section id="sec-fav" className="sec" style={{ order:0, marginBottom:28, animation:"fadeUp 0.4s ease both" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <span style={{ fontSize:15, fontWeight:800, color:"#0F172A" }}>⭐ 즐겨찾기</span>
            <span style={{ fontSize:12, color:"#9CA3AF" }}>자주 쓰는 링크를 버튼으로 모아두세요</span>
          </div>
          <div className="hscroll" style={{ display:"flex", gap:10, alignItems:"center", overflowX:"auto", paddingBottom:6 }}>
            {favorites.map(fav => (
              <a
                key={fav.id}
                href={fav.url}
                target="_blank"
                rel="noopener noreferrer"
                className="fav-chip"
                style={{ flex:"0 0 auto", position:"relative", display:"inline-flex", alignItems:"center", gap:8, padding:"9px 16px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:100, fontSize:13, fontWeight:700, color:"#374151", textDecoration:"none", boxShadow:"0 1px 3px rgba(0,0,0,0.05)", transition:"all 0.15s" }}
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
                      onClick={e => { e.preventDefault(); e.stopPropagation(); confirmDelete(`즐겨찾기 '${fav.name}'을(를) 삭제할까요?`, () => deleteFavorite(fav.id).catch(()=>{})); }}
                      style={{ width:16, height:16, display:"inline-flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:"#F3F4F6", color:"#9CA3AF", fontSize:11, fontWeight:700, cursor:"pointer" }}
                      title="삭제"
                    >×</span>
                  </>
                )}
              </a>
            ))}
            <button
              onClick={() => user ? setShowFavAdd(true) : signIn()}
              style={{ flex:"0 0 auto", display:"inline-flex", alignItems:"center", gap:6, padding:"9px 16px", background:"rgba(124,58,237,0.07)", border:`1.5px dashed ${P}`, borderRadius:100, fontSize:13, fontWeight:700, color:P, cursor:"pointer", whiteSpace:"nowrap" }}
            >
              + 즐겨찾기 추가
            </button>
          </div>
        </section>

        {/* ── 메모 + 투두 (한 줄, 2열) ── */}
        <div style={{ order:2, display:"flex", gap:24, alignItems:"flex-start", flexWrap:"wrap", marginBottom:36 }}>

        {/* ── 포스트잇 메모 (Sticky Notes) ── */}
        <section id="sec-notes" className="sec" style={{ flex:"1 1 420px", minWidth:0, animation:"fadeUp 0.42s ease both" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
            <span style={{ fontSize:15, fontWeight:800, color:"#0F172A" }}>📝 메모</span>
            <span style={{ fontSize:12, color:"#9CA3AF" }}>아이디어·키워드를 가볍게 적어두세요</span>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-start" }}>
            {/* 새 메모 입력 포스트잇 */}
            <div style={{ width:172, minHeight:172, background:newNoteColor, borderRadius:"2px 2px 14px 2px", boxShadow:"0 6px 14px rgba(0,0,0,0.12)", padding:"16px 14px 12px", display:"flex", flexDirection:"column" }}>
              <textarea
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                placeholder="메모 입력..."
                rows={3}
                style={{ flex:1, width:"100%", background:"transparent", border:"none", outline:"none", resize:"none", fontFamily:"'Gowun Dodum',sans-serif", fontSize:15, lineHeight:1.5, color:"#3A3A3A" }}
              />
              <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:8 }}>
                {STICKY_COLORS.map(c => (
                  <span key={c} onClick={() => setNewNoteColor(c)} style={{ width:15, height:15, borderRadius:"50%", background:c, cursor:"pointer", border:newNoteColor===c?"2px solid #0F172A":"1px solid rgba(0,0,0,0.15)" }} />
                ))}
                <button
                  onClick={handleAddNote}
                  disabled={!newNoteText.trim()}
                  style={{ marginLeft:"auto", padding:"5px 12px", borderRadius:8, border:"none", background:newNoteText.trim()?"#0F172A":"rgba(0,0,0,0.15)", color:"white", fontSize:12, fontWeight:700, cursor:newNoteText.trim()?"pointer":"default" }}
                >붙이기</button>
              </div>
            </div>

            {/* 메모 목록 */}
            {notes.map((n, i) => {
              const rot = [-2.5, 1.5, -1, 2, -3, 0.8][i % 6];
              const editing = editNoteId === n.id;
              return (
                <div
                  key={n.id}
                  className="sticky-note"
                  style={{ position:"relative", width:172, minHeight:172, background:n.color, borderRadius:"2px 2px 14px 2px", boxShadow:"0 6px 14px rgba(0,0,0,0.12)", padding:"18px 14px 12px", transform:`rotate(${rot}deg)`, display:"flex", flexDirection:"column" }}
                >
                  {/* 테이프 */}
                  <div style={{ position:"absolute", top:-8, left:"50%", transform:"translateX(-50%) rotate(-2deg)", width:54, height:16, background:"rgba(255,255,255,0.5)", boxShadow:"0 1px 2px rgba(0,0,0,0.1)" }} />
                  {editing ? (
                    <>
                      <textarea
                        value={editNoteText}
                        onChange={e => setEditNoteText(e.target.value)}
                        rows={4}
                        autoFocus
                        style={{ flex:1, width:"100%", background:"transparent", border:"none", outline:"none", resize:"none", fontFamily:"'Gowun Dodum',sans-serif", fontSize:15, lineHeight:1.5, color:"#3A3A3A" }}
                      />
                      <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:6 }}>
                        {STICKY_COLORS.map(c => (
                          <span key={c} onClick={() => changeNoteColor(n, c)} style={{ width:14, height:14, borderRadius:"50%", background:c, cursor:"pointer", border:n.color===c?"2px solid #0F172A":"1px solid rgba(0,0,0,0.15)" }} />
                        ))}
                        <button onClick={() => saveEditNote(n)} style={{ marginLeft:"auto", padding:"4px 10px", borderRadius:7, border:"none", background:"#0F172A", color:"white", fontSize:11, fontWeight:700, cursor:"pointer" }}>저장</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
                        <div style={{ fontFamily:"'Gowun Dodum',sans-serif", fontSize:15, lineHeight:1.5, color:"#3A3A3A", whiteSpace:"pre-wrap", wordBreak:"break-word", maxHeight:isLongNote(n.text)?108:"none", overflow:"hidden" }}>{linkify(n.text)}</div>
                        {isLongNote(n.text) && (
                          <>
                            <div style={{ position:"absolute", bottom:0, left:0, right:0, height:34, background:`linear-gradient(transparent, ${n.color})`, pointerEvents:"none" }} />
                            <button onClick={() => setViewNote(n)} style={{ position:"relative", marginTop:2, padding:"3px 0", width:"100%", background:"rgba(0,0,0,0.06)", border:"none", borderRadius:6, fontSize:11, fontWeight:700, color:"#374151", cursor:"pointer" }}>더보기 ↓</button>
                          </>
                        )}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8 }}>
                        <span style={{ fontSize:11, color:"rgba(0,0,0,0.4)", fontWeight:600 }}>{n.creatorName}</span>
                        {user?.uid === n.uid && (
                          <div style={{ display:"flex", gap:8 }}>
                            <span onClick={() => startEditNote(n)} style={{ fontSize:12, cursor:"pointer" }} title="수정">✏️</span>
                            <span onClick={() => confirmDelete("이 메모를 삭제할까요?", () => deleteStickyNote(n.id).catch(()=>{}))} style={{ fontSize:12, cursor:"pointer" }} title="삭제">🗑</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 투두 (Todo) ── */}
        <section id="sec-todos" className="sec" style={{ flex:"1 1 340px", minWidth:0, maxWidth:520, animation:"fadeUp 0.44s ease both" }}>
          {/* 캘린더 (투두 마감일 연동) */}
          {(() => {
            const year = calMonth.getFullYear(), month = calMonth.getMonth();
            const startDow = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const today = new Date();
            const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());
            const byDay: Record<string, CloudTodo[]> = {};
            todos.forEach(t => { if (t.dueAt) { const d = new Date(t.dueAt); const k = dayKey(d.getFullYear(), d.getMonth(), d.getDate()); (byDay[k] ??= []).push(t); } });
            const cells: (number | null)[] = [];
            for (let i = 0; i < startDow; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);
            const selList = calSelKey ? (byDay[calSelKey] ?? []) : [];
            const navBtn: React.CSSProperties = { width:28, height:28, borderRadius:8, border:"none", background:"#F3F4F6", color:"#6B7280", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" };
            return (
              <div style={{ background:"white", borderRadius:18, boxShadow:"0 2px 12px rgba(0,0,0,0.07)", padding:"16px 18px", marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <span style={{ fontSize:15, fontWeight:800, color:"#0F172A" }}>📅 {year}년 {month + 1}월</span>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <button onClick={() => { setCalMonth(new Date(year, month - 1, 1)); setCalSelKey(null); }} style={navBtn}>‹</button>
                    <button onClick={() => { setCalMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setCalSelKey(null); }} style={{ ...navBtn, width:"auto", padding:"0 10px", fontSize:12, fontWeight:700 }}>오늘</button>
                    <button onClick={() => { setCalMonth(new Date(year, month + 1, 1)); setCalSelKey(null); }} style={navBtn}>›</button>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4 }}>
                  {["일","월","화","수","목","금","토"].map((w, wi) => (
                    <div key={w} style={{ textAlign:"center", fontSize:11, fontWeight:700, color:wi===0?"#EF4444":wi===6?"#3B82F6":"#9CA3AF" }}>{w}</div>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
                  {cells.map((d, ci) => {
                    if (d === null) return <div key={`e${ci}`} />;
                    const k = dayKey(year, month, d);
                    const list = byDay[k] ?? [];
                    const hasIncomplete = list.some(t => !t.done);
                    const allDone = list.length > 0 && !hasIncomplete;
                    const isToday = k === todayKey;
                    const isSel = k === calSelKey;
                    const overdueDay = hasIncomplete && new Date(year, month, d).getTime() < todayMid;
                    return (
                      <div
                        key={k}
                        onClick={() => list.length ? setCalSelKey(isSel ? null : k) : undefined}
                        style={{ aspectRatio:"1", borderRadius:8, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, cursor:list.length?"pointer":"default", background:isSel?"rgba(124,58,237,0.12)":(isToday?"rgba(124,58,237,0.06)":"transparent"), border:isToday?`1.5px solid ${P}`:"1.5px solid transparent" }}
                      >
                        <span style={{ fontSize:12, fontWeight:isToday?800:600, color:list.length?(overdueDay?"#DC2626":(allDone?"#059669":"#1F2937")):"#C0C4CC" }}>{d}</span>
                        {list.length > 0 && <span style={{ width:5, height:5, borderRadius:"50%", background:overdueDay?"#DC2626":(allDone?"#10B981":P) }} />}
                      </div>
                    );
                  })}
                </div>
                {calSelKey && selList.length > 0 && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #F3F4F6", display:"flex", flexDirection:"column", gap:7 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#6B7280", marginBottom:2 }}>🚩 이 날 마감</div>
                    {selList.map(t => (
                      <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:t.done?"#10B981":"#EF4444", flex:"0 0 auto" }} />
                        <span style={{ flex:1, fontSize:12, color:t.done?"#9CA3AF":"#374151", textDecoration:t.done?"line-through":"none", wordBreak:"break-word" }}>{t.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
            <span style={{ fontSize:15, fontWeight:800, color:"#0F172A" }}>✅ 투두</span>
            <span style={{ fontSize:12, color:"#9CA3AF" }}>할 일을 체크리스트로 관리하세요</span>
          </div>
          <div style={{ background:"white", borderRadius:18, boxShadow:"0 2px 12px rgba(0,0,0,0.07)", padding:"18px 20px" }}>
            {/* 입력 */}
            <div style={{ display:"flex", gap:8, marginBottom:todos.length?14:0, flexWrap:"wrap" }}>
              <input
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddTodo(); }}
                placeholder="할 일을 입력하고 Enter"
                style={{ flex:"1 1 180px", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
              />
              <input
                type="date"
                value={newTodoDue}
                onChange={e => setNewTodoDue(e.target.value)}
                title="마감일 (선택)"
                style={{ flex:"0 0 auto", padding:"11px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", color:newTodoDue?"#1F2937":"#9CA3AF", outline:"none", cursor:"pointer" }}
              />
              <button
                onClick={handleAddTodo}
                disabled={!newTodoText.trim()}
                style={{ flex:"0 0 auto", padding:"11px 18px", borderRadius:10, border:"none", background:newTodoText.trim()?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", color:newTodoText.trim()?"white":"#9CA3AF", fontSize:14, fontWeight:700, cursor:newTodoText.trim()?"pointer":"default" }}
              >추가</button>
            </div>
            {/* 목록 */}
            {todos.map((t, i) => {
              const overdue = !!t.dueAt && !t.done && t.dueAt < Date.now();
              const isOwner = user?.uid === t.uid;
              const subs = t.subtasks ?? [];
              const subDone = subs.filter(s => s.done).length;
              const hasSubs = subs.length > 0;
              const allSubsDone = hasSubs && subDone === subs.length;
              const expanded = !!expandedTodos[t.id];
              const showNotice = todoNotice === t.id;
              return (
              <div key={t.id} style={{ borderTop:i===0?"none":"1px solid #F3F4F6", padding:"10px 4px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span
                    onClick={() => isOwner ? tryToggleTodo(t) : undefined}
                    style={{ width:22, height:22, flex:"0 0 auto", borderRadius:7, border:`2px solid ${t.done?"#10B981":(hasSubs && !allSubsDone ? "#FCD34D" : "#D1D5DB")}`, background:t.done?"#10B981":"white", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:13, fontWeight:800, cursor:isOwner?"pointer":"default" }}
                    title={hasSubs && !allSubsDone ? "하위 항목을 모두 끝내야 체크할 수 있어요" : ""}
                  >{t.done ? "✓" : (hasSubs && !allSubsDone ? <span style={{ color:"#FCD34D", fontSize:11 }}>•</span> : "")}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:500, color:t.done?"#9CA3AF":"#1F2937", textDecoration:t.done?"line-through":"none", wordBreak:"break-word" }}>{t.text}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, color:"#9CA3AF" }}>📅 작성 {fmtDay(t.createdAt)}</span>
                      {isOwner ? (
                        <label style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:11, color:overdue?"#DC2626":(t.dueAt?"#7C3AED":"#9CA3AF"), fontWeight:overdue?700:600, cursor:"pointer" }}>
                          🚩 마감
                          <input
                            type="date"
                            value={t.dueAt ? tsToDateInput(t.dueAt) : ""}
                            onChange={e => setTodoDue(t, e.target.value)}
                            style={{ border:"none", background:"transparent", fontFamily:"inherit", fontSize:11, color:"inherit", outline:"none", cursor:"pointer", padding:0 }}
                          />
                        </label>
                      ) : t.dueAt ? (
                        <span style={{ fontSize:11, color:overdue?"#DC2626":"#7C3AED", fontWeight:overdue?700:600 }}>🚩 마감 {fmtDay(t.dueAt)}</span>
                      ) : null}
                      {overdue && <span style={{ fontSize:10, color:"#DC2626", fontWeight:800, background:"#FEF2F2", padding:"1px 6px", borderRadius:6 }}>지남</span>}
                      {/* 하위 항목 배지 */}
                      {hasSubs && (
                        <span
                          onClick={() => toggleExpand(t.id)}
                          style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, fontWeight:800, color:allSubsDone?"#059669":"#6366F1", background:allSubsDone?"rgba(16,185,129,0.12)":"rgba(99,102,241,0.12)", padding:"2px 9px", borderRadius:100, cursor:"pointer" }}
                          title="하위 항목 보기"
                        >📋 하위 {subDone}/{subs.length} {expanded ? "▾" : "▸"}</span>
                      )}
                      {isOwner && !hasSubs && (
                        <span onClick={() => toggleExpand(t.id)} style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", cursor:"pointer" }} title="하위 항목 추가">＋ 하위</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize:11, color:"#C0C4CC", fontWeight:600, flex:"0 0 auto" }}>{t.creatorName}</span>
                  {isOwner && (
                    <span onClick={() => confirmDelete(`'${t.text}' 할 일을 삭제할까요?`, () => deleteTodo(t.id).catch(()=>{}))} style={{ fontSize:13, cursor:"pointer", color:"#9CA3AF", flex:"0 0 auto" }} title="삭제">🗑</span>
                  )}
                </div>

                {/* 체크 막힘 안내 */}
                {showNotice && (
                  <div style={{ margin:"8px 0 0 34px", fontSize:12, fontWeight:700, color:"#B45309", background:"#FEF3C7", borderRadius:8, padding:"7px 12px" }}>
                    ⚠️ 하위 항목 {subs.length - subDone}개가 남아있어요. 먼저 끝내야 완료 체크할 수 있어요.
                  </div>
                )}

                {/* 하위 항목 목록 + 입력 */}
                {expanded && (
                  <div style={{ margin:"8px 0 2px 34px", paddingLeft:12, borderLeft:"2px solid #EEF0F4", display:"flex", flexDirection:"column", gap:6 }}>
                    {subs.map(s => (
                      <div key={s.id} style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <span
                          onClick={() => isOwner ? toggleSubtask(t, s.id) : undefined}
                          style={{ width:17, height:17, flex:"0 0 auto", borderRadius:5, border:`2px solid ${s.done?"#10B981":"#D1D5DB"}`, background:s.done?"#10B981":"white", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:10, fontWeight:800, cursor:isOwner?"pointer":"default" }}
                        >{s.done ? "✓" : ""}</span>
                        <span style={{ flex:1, fontSize:13, color:s.done?"#9CA3AF":"#374151", textDecoration:s.done?"line-through":"none", wordBreak:"break-word" }}>{s.text}</span>
                        {isOwner && (
                          <span onClick={() => confirmDelete("이 하위 항목을 삭제할까요?", () => deleteSubtask(t, s.id))} style={{ fontSize:11, cursor:"pointer", color:"#C0C4CC" }} title="삭제">✕</span>
                        )}
                      </div>
                    ))}
                    {isOwner && (
                      <div style={{ display:"flex", gap:6, marginTop:2 }}>
                        <input
                          value={subInputs[t.id] ?? ""}
                          onChange={e => setSubInputs(p => ({ ...p, [t.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") addSubtask(t); }}
                          placeholder="하위 항목 추가"
                          style={{ flex:1, padding:"7px 10px", border:"1.5px solid #E5E7EB", borderRadius:8, fontSize:12, fontFamily:"inherit", outline:"none" }}
                        />
                        <button
                          onClick={() => addSubtask(t)}
                          disabled={!(subInputs[t.id] ?? "").trim()}
                          style={{ padding:"7px 12px", borderRadius:8, border:"none", background:(subInputs[t.id] ?? "").trim()?"#6366F1":"#E5E7EB", color:(subInputs[t.id] ?? "").trim()?"white":"#9CA3AF", fontSize:12, fontWeight:700, cursor:(subInputs[t.id] ?? "").trim()?"pointer":"default" }}
                        >추가</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
            {todos.length === 0 && (
              <div style={{ textAlign:"center", padding:"24px 0 8px", color:"#9CA3AF", fontSize:13 }}>아직 할 일이 없어요</div>
            )}
          </div>
        </section>

        </div>{/* /메모+투두 row */}

        {/* ── 포스터 (공모전 / 프로젝트) ── */}
        <section id="sec-posters" className="sec" style={{ order:1, marginBottom:36, animation:"fadeUp 0.45s ease both" }}>
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
              {posters.slice(0, 3).map((p, i) => posterCard(p, i))}
              {posters.length > 3 && (
                <div
                  onClick={() => setShowAllPosters(true)}
                  className="poster-card"
                  style={{ flex:"0 0 auto", width:200, borderRadius:16, background:"linear-gradient(135deg,#F8F7FF,#F3EEFF)", border:`2px dashed ${P}`, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, color:P, transition:"transform 0.2s ease, box-shadow 0.2s ease" }}
                >
                  <div style={{ fontSize:30 }}>➕</div>
                  <div style={{ fontSize:14, fontWeight:800 }}>더보기</div>
                  <div style={{ fontSize:12, fontWeight:600, opacity:0.8 }}>+{posters.length - 3}개</div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 액션보드 (Boards) ── */}
        <section id="sec-boards" className="sec" style={{ order:3 }}>
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

                      {/* 순서 이동 (관리자, 전체 보기) */}
                      {isAdmin && filter === "all" && (
                        <div style={{ position:"absolute", top:14, right:14, display:"flex", gap:4, zIndex:2 }}>
                          <button
                            onClick={e => moveBoard(board.id, "left", e)}
                            disabled={i === 0}
                            style={{ width:24, height:24, borderRadius:7, border:"none", background:"rgba(255,255,255,0.22)", color:"white", fontSize:13, fontWeight:800, cursor:i===0?"default":"pointer", opacity:i===0?0.35:1, backdropFilter:"blur(4px)" }}
                            title="앞으로"
                          >‹</button>
                          <button
                            onClick={e => moveBoard(board.id, "right", e)}
                            disabled={i === filtered.length - 1}
                            style={{ width:24, height:24, borderRadius:7, border:"none", background:"rgba(255,255,255,0.22)", color:"white", fontSize:13, fontWeight:800, cursor:i===filtered.length-1?"default":"pointer", opacity:i===filtered.length-1?0.35:1, backdropFilter:"blur(4px)" }}
                            title="뒤로"
                          >›</button>
                        </div>
                      )}

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
                          <button
                            onClick={e => openQr(board, e)}
                            style={{ padding:"4px 10px", background:"rgba(124,58,237,0.08)", border:"none", borderRadius:7, fontSize:12, fontWeight:600, color:P, cursor:"pointer" }}
                            title="QR 코드"
                          >🔳 QR</button>
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
        </section>
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

      {/* ── 공용 삭제 확인 모달 ── */}
      {confirmDel && (
        <div onClick={() => setConfirmDel(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:650, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"32px", width:"100%", maxWidth:360, textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.2s ease both" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🗑</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:8, lineHeight:1.4, wordBreak:"break-word" }}>{confirmDel.text}</div>
            <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:22 }}>이 작업은 되돌릴 수 없어요.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex:1, padding:"12px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button onClick={() => { confirmDel.run(); setConfirmDel(null); }} style={{ flex:1, padding:"12px", background:"#EF4444", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:"white", cursor:"pointer" }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 메모 크게 보기 모달 ── */}
      {viewNote && (
        <div onClick={() => setViewNote(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:550, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:viewNote.color, borderRadius:"4px 4px 18px 4px", padding:"28px 26px", width:"100%", maxWidth:440, maxHeight:"84vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.25)", animation:"fadeUp 0.25s ease both" }} className="hscroll">
            <div style={{ fontFamily:"'Gowun Dodum',sans-serif", fontSize:18, lineHeight:1.6, color:"#3A3A3A", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{linkify(viewNote.text)}</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:20, paddingTop:14, borderTop:"1px solid rgba(0,0,0,0.1)" }}>
              <span style={{ fontSize:12, color:"rgba(0,0,0,0.5)", fontWeight:600 }}>📝 {viewNote.creatorName}</span>
              <button onClick={() => setViewNote(null)} style={{ padding:"7px 16px", background:"rgba(0,0,0,0.7)", border:"none", borderRadius:9, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 보드 QR 코드 모달 ── */}
      {qrBoard && (
        <div onClick={() => setQrBoard(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:550, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"34px", width:"100%", maxWidth:380, textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}>
            <div style={{ fontSize:20, fontWeight:800, color:"#111827", marginBottom:4 }}>🔳 보드 QR 코드</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:22, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{qrBoard.title}</div>

            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:248, height:248, margin:"0 auto", background:"white", borderRadius:16, border:"1.5px solid #EEF0F4", boxShadow:"0 4px 16px rgba(0,0,0,0.06)" }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR" style={{ width:220, height:220 }} />
                : <span style={{ fontSize:13, color:"#9CA3AF" }}>생성 중...</span>}
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:18, padding:"9px 12px", background:"#F8F9FF", borderRadius:10 }}>
              <span style={{ flex:1, fontSize:12, color:"#6B7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"left" }}>{qrUrl}</span>
              <button onClick={copyQrUrl} style={{ flex:"0 0 auto", padding:"5px 10px", borderRadius:8, border:"none", background:qrCopied?"#10B981":"#E5E7EB", color:qrCopied?"white":"#374151", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                {qrCopied ? "복사됨" : "복사"}
              </button>
            </div>

            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button onClick={() => setQrBoard(null)} style={{ flex:1, padding:"12px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>닫기</button>
              <button
                onClick={downloadQr}
                disabled={!qrDataUrl}
                style={{ flex:2, padding:"12px", background:qrDataUrl?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:qrDataUrl?"white":"#9CA3AF", cursor:qrDataUrl?"pointer":"default" }}
              >⬇ PNG 저장</button>
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
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>여러 장 올리고 표지를 직접 고를 수 있어요. 클릭 시 좌우로 넘겨볼 수 있어요</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* 선택된 이미지 미리보기 그리드 */}
              {posterPreviews.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
                  {posterPreviews.map((src, idx) => (
                    <div key={idx} style={{ position:"relative", aspectRatio:"3 / 4", borderRadius:10, overflow:"hidden", border:idx===0?`2px solid ${P}`:"1.5px solid #E5E7EB", background:"#F3F4F6" }}>
                      <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                      {idx === 0 ? (
                        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"3px 0", textAlign:"center", background:P, color:"white", fontSize:10, fontWeight:700 }}>표지</div>
                      ) : !posterSaving && (
                        <button
                          onClick={() => setPosterCover(idx)}
                          style={{ position:"absolute", bottom:0, left:0, right:0, padding:"3px 0", textAlign:"center", background:"rgba(0,0,0,0.6)", border:"none", color:"white", fontSize:10, fontWeight:700, cursor:"pointer" }}
                        >표지로 지정</button>
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
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>본문 (선택)</label>
                <textarea
                  value={posterBody}
                  onChange={e => setPosterBody(e.target.value)}
                  placeholder="공모전 일정, 상금, 참가 방법 등 자유롭게 적어보세요"
                  rows={4}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none", resize:"vertical", lineHeight:1.6 }}
                />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>바로가기 링크 (선택)</label>
                <input
                  value={posterLink}
                  onChange={e => setPosterLink(e.target.value)}
                  placeholder="입력하면 포스터 뷰어에 바로가기 버튼이 생겨요 (선택)"
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
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>이미지를 추가·삭제하고, 원하는 이미지를 표지로 지정하세요 (첫 장이 표지)</div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* 이미지 그리드: 기존 + 새 이미지 통합, 표지 선택 가능 */}
              {editItems.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
                  {editItems.map((it, idx) => {
                    const src = it.kind === "existing" ? it.img.url : it.preview;
                    return (
                    <div key={idx} style={{ position:"relative", aspectRatio:"3 / 4", borderRadius:10, overflow:"hidden", border:idx===0?`2px solid ${P}`:"1.5px solid #E5E7EB", background:"#F3F4F6" }}>
                      <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                      {it.kind === "new" && idx !== 0 && (
                        <div style={{ position:"absolute", top:4, left:4, padding:"2px 6px", borderRadius:6, background:"rgba(16,185,129,0.9)", color:"white", fontSize:9, fontWeight:700 }}>NEW</div>
                      )}
                      {idx === 0 ? (
                        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"3px 0", textAlign:"center", background:P, color:"white", fontSize:10, fontWeight:700 }}>표지</div>
                      ) : !editPosterSaving && (
                        <button onClick={() => setEditCover(idx)} style={{ position:"absolute", bottom:0, left:0, right:0, padding:"3px 0", textAlign:"center", background:"rgba(0,0,0,0.6)", border:"none", color:"white", fontSize:10, fontWeight:700, cursor:"pointer" }}>표지로 지정</button>
                      )}
                      {!editPosterSaving && (
                        <button onClick={() => removeEditItem(idx)} style={{ position:"absolute", top:4, right:4, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"50%", background:"rgba(0,0,0,0.6)", border:"none", color:"white", fontSize:12, cursor:"pointer" }}>×</button>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
              {editItems.length === 0 && (
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
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>본문 (선택)</label>
                <textarea
                  value={editPosterBody}
                  onChange={e => setEditPosterBody(e.target.value)}
                  placeholder="공모전 일정, 상금, 참가 방법 등 자유롭게 적어보세요"
                  rows={4}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none", resize:"vertical", lineHeight:1.6 }}
                />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>바로가기 링크 (선택)</label>
                <input
                  value={editPosterLink}
                  onChange={e => setEditPosterLink(e.target.value)}
                  placeholder="입력하면 포스터 뷰어에 바로가기 버튼이 생겨요 (선택)"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:26 }}>
              <button onClick={() => { if(!editPosterSaving){ setEditPoster(null); } }} disabled={editPosterSaving} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:editPosterSaving?"default":"pointer" }}>취소</button>
              <button
                onClick={handleEditPoster}
                disabled={editPosterSaving || editItems.length === 0}
                style={{ flex:2, padding:"13px", background:editItems.length?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:editItems.length?"white":"#9CA3AF", cursor:editItems.length?"pointer":"default" }}
              >
                {editPosterSaving ? (editItems.some(i=>i.kind==="new") ? `저장 중... ${editPosterProgress}%` : "저장 중...") : "✏️ 수정 완료"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 전체 포스터 모달 (더보기) ── */}
      {showAllPosters && (
        <div onClick={() => setShowAllPosters(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:550, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"32px", width:"100%", maxWidth:900, maxHeight:"86vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }} className="hscroll">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:"#111827" }}>🖼️ 전체 포스터</div>
                <div style={{ fontSize:13, color:"#6B7280", marginTop:4 }}>총 {posters.length}개</div>
              </div>
              <button onClick={() => setShowAllPosters(false)} style={{ width:36, height:36, borderRadius:"50%", background:"#F3F4F6", border:"none", color:"#6B7280", fontSize:18, cursor:"pointer" }}>×</button>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:16, justifyContent:"flex-start" }}>
              {posters.map((p, i) => posterCard(p, i))}
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

          {/* 이미지 바로 아래: 바로가기 버튼 */}
          {viewPoster.linkUrl && (
            <a
              onClick={e => e.stopPropagation()}
              href={viewPoster.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"12px 28px", background:`linear-gradient(135deg,${P},${PINK})`, borderRadius:12, fontSize:15, fontWeight:800, color:"white", textDecoration:"none", boxShadow:"0 8px 24px rgba(124,58,237,0.4)" }}
            >
              🔗 바로가기
            </a>
          )}

          {/* 페이지 인디케이터 (점) */}
          {imgs.length > 1 && (
            <div onClick={e => e.stopPropagation()} style={{ display:"flex", gap:8, alignItems:"center" }}>
              {imgs.map((_, i) => (
                <span key={i} onClick={() => setViewIdx(i)} style={{ width:i===idx?22:8, height:8, borderRadius:100, background:i===idx?"white":"rgba(255,255,255,0.4)", cursor:"pointer", transition:"all 0.2s" }} />
              ))}
              <span style={{ color:"rgba(255,255,255,0.7)", fontSize:12, fontWeight:600, marginLeft:6 }}>{idx+1} / {imgs.length}</span>
            </div>
          )}

          <div onClick={e => e.stopPropagation()} style={{ color:"white", fontSize:16, fontWeight:700 }}>{viewPoster.title}</div>
          {viewPoster.body && (
            <div onClick={e => e.stopPropagation()} style={{ maxWidth:560, maxHeight:"22vh", overflowY:"auto", color:"rgba(255,255,255,0.85)", fontSize:14, lineHeight:1.7, whiteSpace:"pre-wrap", textAlign:"center", background:"rgba(255,255,255,0.06)", borderRadius:12, padding:"14px 18px" }} className="hscroll">
              {viewPoster.body}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
