"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  getActionBoard,
  subscribeToBoardPosts,
  addBoardPost,
  deleteBoardPost,
  updateBoardPost,
  updateBoardPostPosition,
  updateBoardPostQr,
  updateBoardPostAnnOrder,
  createFeedPost,
  addBoardComment,
  deleteBoardComment,
  subscribeToBoardComments,
  type CloudActionBoard,
  type CloudBoardPost,
  type CloudBoardComment,
  type CloudFeedPost,
  type FeedCategory,
  type BoardFileItem,
} from "@/lib/firestoreHelpers";
import { uploadImageDataUrl, uploadBoardFile, deleteStorageByUrl } from "@/lib/firebaseStorage";
import DocViewer, { DocContent } from "@/components/DocViewer";
import { fileIcon, fmtBytes, previewKind, getExt, downloadFile } from "@/lib/docParser";

const P = "#7C3AED";
const PINK = "#EC4899";

type ContentType = "text" | "image" | "audio" | "youtube" | "ppt" | "pdf" | "file";

/** 첨부파일 1개당 업로드 상한 (Storage 비용·뷰어 성능 고려) */
const MAX_ATTACH_BYTES = 50 * 1024 * 1024;
/** 게시물 1개당 첨부 개수 상한 */
const MAX_ATTACH_COUNT = 10;

/** files[] 도입 이전의 단일 첨부 게시물도 같은 형태로 읽는다. */
function postFiles(post: CloudBoardPost): BoardFileItem[] {
  if (post.files?.length) return post.files;
  if (post.fileUrl) {
    return [{
      url: post.fileUrl,
      name: post.fileOrigName || post.fileName || "첨부파일",
      size: post.fileSize ?? 0,
    }];
  }
  return [];
}

/**
 * 뷰어는 확장자로 형식을 판별한다. 제목만 저장돼 있거나("발표자료"),
 * 제목에 점이 섞인 경우("보고서 v1.2") 알려진 확장자로 끝날 때만 그대로 쓴다.
 */
function withExt(name: string, fallbackExt: string) {
  return previewKind(name) !== "none" ? name : `${name}.${fallbackExt}`;
}

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
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Convert URLs inside plain text into clickable links
function linkify(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        style={{ color:"#2563EB", textDecoration:"underline", wordBreak:"break-all" }}>
        {part}
      </a>
    ) : part
  );
}

// ── Copy bar (used inside text maximize overlay) ──────────────────────────────
function CopyBar({ text, position }: { text: string; position: "top" | "bottom" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{
      display:"flex", justifyContent:"flex-end", padding:"10px 20px",
      borderBottom: position === "top" ? "1px solid rgba(0,0,0,0.06)" : "none",
      borderTop:    position === "bottom" ? "1px solid rgba(0,0,0,0.06)" : "none",
      background:"rgba(0,0,0,0.03)",
    }}>
      <button
        onClick={handleCopy}
        style={{ padding:"5px 14px", background:copied?"#059669":"white", border:`1.5px solid ${copied?"#059669":"#D1D5DB"}`, borderRadius:8, fontSize:12, fontWeight:700, color:copied?"white":"#374151", cursor:"pointer", transition:"all 0.2s", display:"flex", alignItems:"center", gap:5 }}
      >
        {copied ? "✓ 복사됨" : "📋 전체 복사"}
      </button>
    </div>
  );
}

// ── 첨부파일 한 줄 (카드 / 확대 오버레이 공용) ───────────────────────────────
function FileRow({ file, onOpen, compact = false, dark = false, active = false }: {
  file: BoardFileItem;
  onOpen: () => void;
  compact?: boolean;   // 카드 안 좁은 영역용
  dark?: boolean;      // 확대 오버레이(어두운 배경)용
  active?: boolean;    // 확대 오버레이에서 현재 미리보기 중인 파일
}) {
  const [saving, setSaving] = useState(false);
  const canPreview = previewKind(file.name) !== "none";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    await downloadFile(file.url, file.name);
    setSaving(false);
  };

  const btn = (bg: string, color: string, border: string): React.CSSProperties => ({
    padding: compact ? "3px 8px" : "6px 12px",
    background: bg, color, border, borderRadius: 8,
    fontSize: compact ? 10 : 12, fontWeight: 700, cursor: "pointer",
    whiteSpace: "nowrap", flexShrink: 0,
  });

  return (
    <div
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={e => { e.stopPropagation(); if (canPreview) onOpen(); }}
      title={file.name}
      style={{
        display: "flex", alignItems: "center", gap: compact ? 7 : 10,
        padding: compact ? "6px 8px" : "10px 14px",
        borderRadius: 10,
        background: dark
          ? (active ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.08)")
          : "white",
        border: dark
          ? `1px solid ${active ? "rgba(196,181,253,0.7)" : "rgba(255,255,255,0.12)"}`
          : "1px solid #E5E7EB",
        cursor: canPreview ? "pointer" : "default",
      }}
    >
      <span style={{ fontSize: compact ? 16 : 22, flexShrink: 0 }}>{fileIcon(file.name)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: compact ? 11 : 14, fontWeight: 600,
          color: dark ? "rgba(255,255,255,0.95)" : "#1F2937",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{file.name}</div>
        <div style={{ fontSize: compact ? 9 : 11, color: dark ? "rgba(255,255,255,0.5)" : "#9CA3AF" }}>
          {getExt(file.name).toUpperCase()}{file.size ? ` · ${fmtBytes(file.size)}` : ""}
          {!canPreview && " · 미리보기 미지원"}
        </div>
      </div>
      {canPreview && (
        <button onClick={e => { e.stopPropagation(); onOpen(); }} onPointerDown={stop}
          style={btn("#0F766E", "white", "none")}>
          {compact ? "보기" : "🔍 보기"}
        </button>
      )}
      <button onClick={save} onPointerDown={stop} disabled={saving}
        style={btn(dark ? "rgba(255,255,255,0.15)" : "white", dark ? "white" : "#374151",
          dark ? "1px solid rgba(255,255,255,0.3)" : "1.5px solid #E5E7EB")}>
        {saving ? "저장 중" : compact ? "⬇" : "⬇️ 다운로드"}
      </button>
    </div>
  );
}

// ── 단일 첨부(ppt/pdf/audio/image) 교체 위젯 ─────────────────────────────────
function AttachSwap({ currentName, pending, accept, onPick, onClear }: {
  currentName: string;
  pending: File | null;
  accept?: string;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
      <input ref={ref} type="file" accept={accept} style={{ display:"none" }}
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > MAX_ATTACH_BYTES) {
            alert(`파일이 너무 큽니다 (${fmtBytes(f.size)}). 최대 ${fmtBytes(MAX_ATTACH_BYTES)}까지 올릴 수 있어요.`);
            return;
          }
          onPick(f);
        }} />
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:pending?"#F0FDFA":"#F9FAFB", borderRadius:10, border:`1.5px solid ${pending?"#99F6E4":"#E5E7EB"}` }}>
        <span style={{ fontSize:20 }}>{fileIcon(pending?.name ?? currentName)}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:pending?"#0F766E":"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {pending?.name ?? currentName}
          </div>
          <div style={{ fontSize:11, color:pending?"#14B8A6":"#9CA3AF" }}>
            {pending ? `새 파일로 교체 · ${fmtBytes(pending.size)}` : "현재 첨부 — 저장 시 그대로 유지"}
          </div>
        </div>
        {pending && (
          <button onClick={onClear} title="교체 취소"
            style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:16 }}>×</button>
        )}
      </div>
      <button onClick={() => ref.current?.click()}
        style={{ padding:"9px 0", background:"white", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:12, fontWeight:700, color:"#374151", cursor:"pointer" }}>
        🔄 다른 파일로 교체
      </button>
    </div>
  );
}

// ── Sticky note card ──────────────────────────────────────────────────────────
const NOTE_COLORS = ["#FFF9C4","#FFE0B2","#F8BBD0","#C8E6C9","#B3E5FC","#E1BEE7","#FFFFFF"];
const PALETTE = [
  "#FFF9C4","#FFE0B2","#FFCDD2","#F8BBD0","#E1BEE7",
  "#C8E6C9","#B3E5FC","#BBDEFB","#D7CCC8","#FFFFFF",
];

// Color swatches + custom picker, reusable for create & edit forms
function ColorPalette({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const isCustom = !PALETTE.includes(value);
  return (
    <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
      {PALETTE.map(c => (
        <div key={c} onClick={() => onChange(c)}
          style={{ width:28, height:28, borderRadius:8, background:c, border:`2.5px solid ${value===c?"#7C3AED":"#E5E7EB"}`, cursor:"pointer", boxShadow:value===c?"0 0 0 2px rgba(124,58,237,0.25)":"none", transition:"all 0.12s" }} />
      ))}
      {/* Custom color picker */}
      <label title="직접 색상 선택"
        style={{ width:28, height:28, borderRadius:8, cursor:"pointer", position:"relative", overflow:"hidden",
          border:`2.5px solid ${isCustom?"#7C3AED":"#E5E7EB"}`,
          boxShadow:isCustom?"0 0 0 2px rgba(124,58,237,0.25)":"none",
          background: isCustom ? value : "conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
          display:"flex", alignItems:"center", justifyContent:"center" }}>
        <input type="color" value={isCustom ? value : "#7C3AED"} onChange={e => onChange(e.target.value)}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", border:"none", padding:0 }} />
        {!isCustom && <span style={{ fontSize:11, filter:"drop-shadow(0 0 1px white)" }}>🎨</span>}
      </label>
    </div>
  );
}

function PostCard({ post, canDelete, onDelete, onEdit, onOpenDoc, onPointerDown, isDragging, onOpen }: {
  post: CloudBoardPost;
  canDelete: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onOpenDoc: (url: string, name: string, size?: number) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  isDragging: boolean;
  onOpen: () => void;
}) {
  const [playing, setPlaying]       = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const textRef  = useRef<HTMLParagraphElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const color = post.bgColor ?? NOTE_COLORS[Math.abs([...post.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % NOTE_COLORS.length];

  const MAX_TEXT_HEIGHT = 12 * 14 * 1.65; // 12 lines × font-size × line-height

  useEffect(() => {
    if (!textRef.current) return;
    setIsOverflow(textRef.current.scrollHeight > textRef.current.clientHeight + 2);
  }, [post.text]);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div
      onPointerDown={onPointerDown}
      style={{ background:color, borderRadius:16, padding:"18px 18px 14px", boxShadow: isDragging ? "0 20px 48px rgba(0,0,0,0.22)" : "0 4px 14px rgba(0,0,0,0.09)", position:"relative", minHeight:120, display:"flex", flexDirection:"column", gap:10, cursor: isDragging ? "grabbing" : "grab", userSelect:"none", WebkitUserSelect:"none", transform: isDragging ? "scale(1.03)" : "scale(1)", transition: isDragging ? "box-shadow 0.15s,transform 0.1s" : "box-shadow 0.25s,transform 0.25s" }}
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
          {canDelete && (
            <>
              <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF", padding:"2px 5px", borderRadius:4 }} title="수정">✏️</button>
              <button onClick={onDelete} style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#9CA3AF", padding:"2px 5px", borderRadius:4 }} title="삭제">×</button>
            </>
          )}
        </div>
      </div>

      {/* 제목 (도드라지게) */}
      {post.title && (
        <div style={{ fontSize:17, fontWeight:800, color:"#0F172A", lineHeight:1.3, letterSpacing:-0.3, marginBottom:8, paddingBottom:8, borderBottom:"2px solid rgba(0,0,0,0.08)", wordBreak:"break-word" }}>
          {post.title}
        </div>
      )}

      {/* Content */}
      {post.contentType === "text" && (
        <div style={{ flex:1, position:"relative" }}>
          <p
            ref={textRef}
            style={{ fontSize:14, color:"#1F2937", lineHeight:1.65, whiteSpace:"pre-wrap", maxHeight:`${MAX_TEXT_HEIGHT}px`, overflow:"hidden" }}
          >{post.text}</p>
          {isOverflow && (
            <>
              <div style={{ position:"absolute", bottom:32, left:0, right:0, height:52, background:`linear-gradient(transparent, ${color})`, pointerEvents:"none" }} />
              <button
                onClick={e => { e.stopPropagation(); onOpen(); }}
                onMouseDown={e => e.stopPropagation()}
                style={{ display:"block", width:"100%", marginTop:4, padding:"6px 0", background:"rgba(0,0,0,0.07)", border:"none", borderRadius:8, fontSize:12, fontWeight:700, color:"#374151", cursor:"pointer" }}
              >
                더보기 ↓
              </button>
            </>
          )}
        </div>
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
              <iframe
                src={`https://www.youtube.com/embed/${getYoutubeId(post.youtubeUrl) ?? ""}?autoplay=1`}
                style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              />
            </div>
          )}
        </div>
      )}

      {post.contentType === "ppt" && post.pptUrl && (
        <div style={{ background:"rgba(0,0,0,0.05)", borderRadius:10, padding:"16px 14px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:32 }}>📊</div>
          <div style={{ fontSize:12, fontWeight:600, color:"#374151", wordBreak:"break-all", lineHeight:1.4 }}>{post.pptName || "프레젠테이션"}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center" }}
            onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <button onClick={() => onOpenDoc(post.pptUrl!, withExt(post.pptName || "프레젠테이션", "pptx"))}
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

      {post.contentType === "pdf" && post.pdfUrl && (
        <div style={{ background:"rgba(0,0,0,0.05)", borderRadius:10, padding:"16px 14px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:32 }}>📄</div>
          <div style={{ fontSize:12, fontWeight:600, color:"#374151", wordBreak:"break-all", lineHeight:1.4 }}>{post.pdfName || "PDF 문서"}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center" }}
            onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <button onClick={() => onOpenDoc(post.pdfUrl!, withExt(post.pdfName || "PDF 문서", "pdf"))}
              style={{ padding:"5px 12px", background:"#DC2626", border:"none", borderRadius:8, fontSize:11, fontWeight:700, color:"white", cursor:"pointer" }}>
              🔍 보기
            </button>
            <a href={post.pdfUrl} download target="_blank" rel="noreferrer"
              style={{ padding:"5px 12px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:8, fontSize:11, fontWeight:700, color:"#374151", textDecoration:"none" }}>
              ⬇️ 다운로드
            </a>
          </div>
        </div>
      )}

      {post.contentType === "file" && (() => {
        const files = postFiles(post);
        if (!files.length) return null;
        const shown = files.slice(0, 3);
        return (
          <div style={{ background:"rgba(0,0,0,0.05)", borderRadius:10, padding:"12px 10px", display:"flex", flexDirection:"column", gap:7 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6, padding:"0 2px" }}>
              <span style={{ fontSize:11, fontWeight:700, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                📎 {post.fileName || "첨부파일"}
              </span>
              <span style={{ fontSize:10, fontWeight:700, color:"white", background:"#0F766E", borderRadius:20, padding:"1px 7px", flexShrink:0 }}>{files.length}</span>
            </div>
            {shown.map((f, i) => (
              <FileRow key={f.url + i} file={f} compact onOpen={() => onOpenDoc(f.url, f.name, f.size)} />
            ))}
            {files.length > shown.length && (
              <button
                onClick={e => { e.stopPropagation(); onOpen(); }}
                onPointerDown={e => e.stopPropagation()}
                style={{ padding:"5px 0", background:"rgba(0,0,0,0.05)", border:"none", borderRadius:8, fontSize:11, fontWeight:700, color:"#374151", cursor:"pointer" }}>
                + {files.length - shown.length}개 더 보기
              </button>
            )}
          </div>
        );
      })()}

      {/* Comment count badge */}
      {(post.commentCount ?? 0) > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#6B7280" }}>
          <span>💬</span>
          <span>{post.commentCount}개의 댓글</span>
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
  // 비밀번호 잠금
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput]   = useState("");
  const [pwError, setPwError]   = useState(false);
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
  const dragRef = useRef<{ id: string; mouseX: number; mouseY: number; cardX: number; cardY: number; hasMoved: boolean; pointerType: string; armed: boolean } | null>(null);
  const posRef  = useRef<Record<string, Pos>>({});
  const postsRef = useRef<CloudBoardPost[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const lpTimer = useRef<number | null>(null); // 모바일: 길게 눌러 드래그 시작 타이머
  // Card maximize overlay — declared here so handleCanvasPointerUp can reference it
  const [maximizedPost, setMaximizedPost] = useState<CloudBoardPost | null>(null);

  // ── 공지 카드 좌우 드래그 재정렬 (보드 개설자 전용) ──────────────────────────
  const [annOrderIds, setAnnOrderIds] = useState<string[] | null>(null); // 낙관적 순서 오버라이드
  const [draggingAnnId, setDraggingAnnId] = useState<string | null>(null); // 드래그 중 카드(스타일용)
  const dragAnnId = useRef<string | null>(null);

  // Comments for maximized post
  const [comments, setComments] = useState<CloudBoardComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  // 저장된 서버 순서가 낙관적 순서를 따라잡으면 오버라이드 해제 (다른 관리자의 변경 반영)
  useEffect(() => {
    if (!annOrderIds) return;
    const serverIds = posts.filter(p => p.isAnnouncement).sort((a, b) => {
      const ao = a.annOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.annOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return b.createdAt - a.createdAt;
    }).map(p => p.id);
    if (serverIds.length === annOrderIds.length && serverIds.every((id, i) => id === annOrderIds[i])) {
      setAnnOrderIds(null);
    }
  }, [posts, annOrderIds]);

  // keep refs in sync so mouseup closures have latest state
  useEffect(() => { posRef.current = positions; }, [positions]);
  useEffect(() => { postsRef.current = posts; }, [posts]);

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

  const clearLp = useCallback(() => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
  }, []);

  const handleCardPointerDown = useCallback((e: React.PointerEvent, postId: string) => {
    const tag = (e.target as HTMLElement).closest("button,a,audio,iframe,select");
    if (tag) return; // don't intercept interactive elements
    const pos = posRef.current[postId] ?? { x: 0, y: 0 };
    const touch = e.pointerType === "touch";
    // 마우스/펜은 즉시 드래그, 터치는 길게 눌러야(250ms) 드래그 시작 → 탭·스크롤과 구분
    dragRef.current = { id: postId, mouseX: e.clientX, mouseY: e.clientY, cardX: pos.x, cardY: pos.y, hasMoved: false, pointerType: e.pointerType, armed: !touch };
    if (touch) {
      clearLp();
      lpTimer.current = window.setTimeout(() => {
        if (dragRef.current && dragRef.current.id === postId) {
          dragRef.current.armed = true;
          setDraggingId(postId);
          try { navigator.vibrate?.(15); } catch { /* no haptics */ }
        }
      }, 250);
    } else {
      e.preventDefault();
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* older browsers */ }
      setDraggingId(postId);
    }
  }, [clearLp]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { id, mouseX, mouseY, cardX, cardY } = d;
    if (!d.armed) {
      // 터치: 아직 드래그 준비 전인데 움직이면 스크롤/탭으로 보고 취소
      if (Math.abs(e.clientX - mouseX) > 8 || Math.abs(e.clientY - mouseY) > 8) { clearLp(); dragRef.current = null; }
      return;
    }
    if (!d.hasMoved &&
        (Math.abs(e.clientX - mouseX) > 5 || Math.abs(e.clientY - mouseY) > 5)) {
      d.hasMoved = true;
    }
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
  }, [CARD_W, SNAP_DIST, clearLp]);

  const handleCanvasPointerUp = useCallback(async () => {
    clearLp();
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDraggingId(null);
    setSnapLines([]);

    if (!d.hasMoved) {
      // 탭(또는 움직임 없는 길게누름) → 게시물 열기. 스크롤로 취소된 경우 dragRef가 이미 null.
      const post = postsRef.current.find(p => p.id === d.id);
      if (post) setMaximizedPost(post);
      return;
    }

    if (!d.armed) return; // 안전장치
    const pos = posRef.current[d.id];
    if (pos) updateBoardPostPosition(boardId, d.id, pos.x, pos.y).catch(() => {});
  }, [boardId, setMaximizedPost, clearLp]);

  // 모바일 터치 드래그 중에는 페이지 스크롤을 막는다(패시브가 아닌 네이티브 리스너 필요)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onTouchMove = (ev: TouchEvent) => {
      if (dragRef.current?.armed && dragRef.current.pointerType === "touch") ev.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  // form
  const [cType, setCType]       = useState<ContentType>("text");
  const [postTitle, setPostTitle] = useState("");
  const [text, setText]         = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [ytUrl, setYtUrl]       = useState("");
  const [pptFile, setPptFile]   = useState<File | null>(null);
  const [pptName, setPptName]   = useState("");
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [pdfName, setPdfName]   = useState("");
  const [etcFiles, setEtcFiles] = useState<File[]>([]);
  const [etcName, setEtcName]   = useState("");
  const [cardColor, setCardColor] = useState(PALETTE[0]);
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [shareToFeed, setShareToFeed] = useState(false);
  const [feedTitle, setFeedTitle]     = useState("");
  const [uploadPct, setUploadPct] = useState(0);

  // 문서 전체화면 뷰어 (ppt / pdf / hwpx / xlsx / 기타 파일 공용)
  const [docViewer, setDocViewer] = useState<{ url: string; name: string; size?: number } | null>(null);

  // 첨부가 여러 개인 게시물 — 확대 화면에서 미리보기 중인 파일 / 일괄 다운로드 상태
  const [selFileIdx, setSelFileIdx] = useState(0);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDone, setBulkDone]     = useState(0);

  const downloadAllFiles = async (files: BoardFileItem[]) => {
    setBulkSaving(true);
    setBulkDone(0);
    for (let i = 0; i < files.length; i++) {
      await downloadFile(files[i].url, files[i].name);
      setBulkDone(i + 1);
    }
    setBulkSaving(false);
  };

  // edit post state
  const [editPost, setEditPost]       = useState<CloudBoardPost | null>(null);
  const [editTitle, setEditTitle]     = useState("");
  const [editText, setEditText]       = useState("");
  const [editField, setEditField]     = useState(""); // audioName / youtubeUrl / pptName
  const [editColor, setEditColor]     = useState(PALETTE[0]);
  const [editSaving, setEditSaving]   = useState(false);
  // 첨부 수정: 남겨둘 기존 파일 / 새로 추가할 파일 / 단일 첨부(ppt·pdf·audio·image) 교체본
  const [editFiles, setEditFiles]       = useState<BoardFileItem[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [editSwapFile, setEditSwapFile] = useState<File | null>(null);
  const [editUploadPct, setEditUploadPct] = useState(0);
  const editFileRef = useRef<HTMLInputElement>(null);

  // ── Question form state ─────────────────────────────────────────────────────
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [qText, setQText]           = useState("");
  const [qRefType, setQRefType]     = useState<"none" | "url" | "image" | "text">("none");
  const [qRefUrl, setQRefUrl]       = useState("");
  const [qRefImage, setQRefImage]   = useState("");
  const [qRefText, setQRefText]     = useState("");
  const [qSubmitting, setQSubmitting] = useState(false);
  const qImageRef = useRef<HTMLInputElement>(null);

  const handleQuestionImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setQRefImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleQuestionSubmit = async () => {
    if (!user || !board || !qText.trim()) return;
    setQSubmitting(true);
    try {
      let finalImageUrl = qRefImage;
      if (qRefType === "image" && qRefImage.startsWith("data:")) {
        const { url } = await uploadImageDataUrl(user.uid, `actionboards/${boardId}`, `qimg_${Date.now()}.png`, qRefImage);
        finalImageUrl = url;
      }
      const post: CloudBoardPost = {
        id: crypto.randomUUID(),
        boardId,
        uid: user.uid,
        authorName: user.displayName ?? "익명",
        authorPhoto: user.photoURL ?? "",
        contentType: "text",
        text: qText.trim(),
        isQuestion: true,
        bgColor: "#FFFBEB",
        createdAt: Date.now(),
        ...(qRefType === "url"   && qRefUrl.trim()  && { refUrl: qRefUrl.trim() }),
        ...(qRefType === "image" && finalImageUrl    && { imageUrl: finalImageUrl }),
        ...(qRefType === "text"  && qRefText.trim()  && { refText: qRefText.trim() }),
      };
      await addBoardPost(boardId, post);
      setQText(""); setQRefUrl(""); setQRefImage(""); setQRefText(""); setQRefType("none");
      setShowQuestionForm(false);
    } catch (e) { console.error(e); }
    setQSubmitting(false);
  };

  // 확대해 둔 게시물은 스냅샷이라 수정 결과가 반영되지 않는다 → 구독 데이터로 갱신
  useEffect(() => {
    if (!maximizedPost) return;
    const fresh = posts.find(p => p.id === maximizedPost.id);
    if (fresh && fresh !== maximizedPost) setMaximizedPost(fresh);
  }, [posts, maximizedPost]);

  // 게시물을 열 때마다 미리보기 가능한 첫 파일을 기본 선택
  // (게시물이 바뀔 때만 — 다른 사람의 새 글로 목록이 갱신돼도 선택이 풀리지 않도록)
  const maximizedId = maximizedPost?.id;
  useEffect(() => {
    if (!maximizedPost) return;
    const files = postFiles(maximizedPost);
    const first = files.findIndex(f => previewKind(f.name) !== "none");
    setSelFileIdx(first >= 0 ? first : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maximizedId]);

  const openEditPost = (post: CloudBoardPost) => {
    setEditPost(post);
    setEditTitle(post.title ?? "");
    setEditText(post.text ?? "");
    setEditField(
      post.contentType === "audio"   ? (post.audioName   ?? "") :
      post.contentType === "youtube" ? (post.youtubeUrl  ?? "") :
      post.contentType === "ppt"     ? (post.pptName     ?? "") :
      post.contentType === "pdf"     ? (post.pdfName     ?? "") :
      post.contentType === "file"    ? (post.fileName    ?? "") : ""
    );
    setEditColor(post.bgColor ?? PALETTE[0]);
    setEditFiles(postFiles(post));
    setEditNewFiles([]);
    setEditSwapFile(null);
    setEditUploadPct(0);
  };

  const handleEditSave = async () => {
    if (!editPost) return;
    const type = editPost.contentType;

    if (type === "file" && editFiles.length + editNewFiles.length === 0) {
      alert("첨부파일이 하나도 없어요. 파일을 추가하거나 게시물을 삭제해주세요.");
      return;
    }

    setEditSaving(true);
    setEditUploadPct(0);
    try {
      const fields: Parameters<typeof updateBoardPost>[2] = { bgColor: editColor, title: editTitle.trim() };
      // 저장에 성공한 뒤 Storage에서 지울 대상 (실패 시 파일이 사라지면 안 되므로 나중에 처리)
      const orphaned: string[] = [];

      if (type === "text")    fields.text       = editText;
      if (type === "audio")   fields.audioName  = editField;
      if (type === "youtube") fields.youtubeUrl = editField;
      if (type === "ppt")     fields.pptName    = editField;
      if (type === "pdf")     fields.pdfName    = editField;

      // ── 기타(다중 첨부): 제거된 파일 반영 + 새 파일 업로드 ────────────────
      if (type === "file") {
        const uploaded: BoardFileItem[] = [];
        for (let i = 0; i < editNewFiles.length; i++) {
          const f = editNewFiles[i];
          const { url } = await uploadBoardFile(
            boardId, "files", f,
            pct => setEditUploadPct(Math.round(((i + pct / 100) / editNewFiles.length) * 100)),
            i,
          );
          uploaded.push({ url, name: f.name, size: f.size });
        }
        fields.files    = [...editFiles, ...uploaded];
        fields.fileName = editField || (fields.files.length === 1
          ? fields.files[0].name
          : `첨부파일 ${fields.files.length}개`);
        // files[] 이전 스키마로 저장된 게시물의 잔여 필드 정리
        fields.fileUrl = "";
        fields.fileOrigName = "";
        fields.fileSize = 0;

        const kept = new Set(fields.files.map(f => f.url));
        orphaned.push(...postFiles(editPost).filter(f => !kept.has(f.url)).map(f => f.url));
      }

      // ── 단일 첨부(ppt/pdf/audio/image) 교체 ────────────────────────────────
      if (editSwapFile && (type === "ppt" || type === "pdf" || type === "audio" || type === "image")) {
        const sub = type === "image" ? "image" : type;
        const { url } = await uploadBoardFile(boardId, sub, editSwapFile, setEditUploadPct);
        if (type === "ppt")   { fields.pptUrl   = url; if (!editField) fields.pptName   = editSwapFile.name; }
        if (type === "pdf")   { fields.pdfUrl   = url; if (!editField) fields.pdfName   = editSwapFile.name; }
        if (type === "audio") { fields.audioUrl = url; if (!editField) fields.audioName = editSwapFile.name; }
        if (type === "image") { fields.imageUrl = url; }

        // 피드에 공유됐을 수 있는 이미지·오디오 원본은 남겨둔다 (피드 게시물이 깨짐)
        const oldUrl = type === "ppt" ? editPost.pptUrl : type === "pdf" ? editPost.pdfUrl : "";
        if (oldUrl) orphaned.push(oldUrl);
      }

      await updateBoardPost(boardId, editPost.id, fields);
      orphaned.forEach(u => deleteStorageByUrl(u).catch(() => {}));
      setEditPost(null);
    } catch (e) {
      console.error("[ActionBoard] edit failed:", e);
      alert("수정 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
    setEditSaving(false);
    setEditUploadPct(0);
  };

  const handleCommentSubmit = async () => {
    if (!user || !maximizedPost || !commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      const comment: CloudBoardComment = {
        id: crypto.randomUUID(),
        postId: maximizedPost.id,
        boardId,
        uid: user.uid,
        authorName: user.displayName ?? "익명",
        authorPhoto: user.photoURL ?? "",
        text: commentText.trim(),
        createdAt: Date.now(),
      };
      await addBoardComment(boardId, maximizedPost.id, comment);
      setCommentText("");
    } catch (e) {
      console.error(e);
      alert("댓글 등록에 실패했습니다. 다시 시도해주세요.");
    }
    setCommentSubmitting(false);
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/actionboard/${boardId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("아래 링크를 복사하세요:", url);
    }
  };

  // 모바일 감지
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const onR = () => setIsMobile(window.innerWidth <= 640);
    onR(); window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // ── QR 코드 ──
  const [showQr, setShowQr]       = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrCopied, setQrCopied]   = useState(false);
  const boardUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/actionboard/${boardId}`;

  const openQr = async () => {
    setShowQr(true); setQrDataUrl(""); setQrCopied(false);
    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(boardUrl, { width: 520, margin: 2, color: { dark: "#0F172A", light: "#FFFFFF" } });
      setQrDataUrl(dataUrl);
    } catch { /* silent */ }
  };
  const downloadQr = () => {
    if (!qrDataUrl || !board) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR_${board.title.replace(/[^a-zA-Z0-9가-힣]+/g, "_")}.png`;
    a.click();
  };
  const copyQrUrl = () => {
    navigator.clipboard?.writeText(boardUrl).then(() => { setQrCopied(true); setTimeout(() => setQrCopied(false), 1800); }).catch(() => {});
  };

  // ── 게시물 QR 코드 (특정 게시물로 바로 가는 딥링크) ──
  // 한 번 생성하면 Firestore(post.qrDataUrl)에 영구 저장 → 새로고침·모든 사용자에게 그대로 표시
  const [postQrLoading, setPostQrLoading] = useState(false);
  const [showPostQrBig, setShowPostQrBig] = useState(false);
  const [postQrCopied, setPostQrCopied]   = useState(false);
  const [localQrs, setLocalQrs]           = useState<Record<string, string>>({}); // 저장 반영 전 즉시 표시용
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const postUrl = maximizedPost ? `${origin}/actionboard/${boardId}?post=${maximizedPost.id}` : "";
  // 저장된 값(구독 반영) 우선, 없으면 방금 만든 로컬 값
  const livePost = maximizedPost ? posts.find(p => p.id === maximizedPost.id) : null;
  const postQrDataUrl = (livePost?.qrDataUrl ?? (maximizedPost ? localQrs[maximizedPost.id] : "")) ?? "";

  // 게시물이 바뀌면 확대/복사 UI 상태만 초기화
  useEffect(() => { setShowPostQrBig(false); setPostQrCopied(false); }, [maximizedPost?.id]);

  const generatePostQr = async () => {
    if (!maximizedPost) return;
    const id = maximizedPost.id;
    setPostQrLoading(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(`${origin}/actionboard/${boardId}?post=${id}`, { width: 520, margin: 2, color: { dark: "#0F172A", light: "#FFFFFF" } });
      setLocalQrs(prev => ({ ...prev, [id]: dataUrl }));   // 즉시 표시
      await updateBoardPostQr(boardId, id, dataUrl);        // Firestore에 영구 저장
    } catch { /* silent */ }
    setPostQrLoading(false);
  };
  const downloadPostQr = () => {
    if (!postQrDataUrl || !maximizedPost) return;
    const a = document.createElement("a");
    a.href = postQrDataUrl;
    a.download = `QR_${(maximizedPost.title || "post").replace(/[^a-zA-Z0-9가-힣]+/g, "_")}.png`;
    a.click();
  };
  const copyPostQrUrl = () => {
    navigator.clipboard?.writeText(postUrl).then(() => { setPostQrCopied(true); setTimeout(() => setPostQrCopied(false), 1800); }).catch(() => {});
  };

  const fileRef     = useRef<HTMLInputElement>(null);
  const audioRef2   = useRef<HTMLInputElement>(null);
  const pptFileRef  = useRef<HTMLInputElement>(null);
  const pdfFileRef  = useRef<HTMLInputElement>(null);
  const etcFileRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getActionBoard(boardId).then(b => {
      setBoard(b);
      setLoading(false);
      // 비밀번호가 없거나, 이전에 인증했으면 잠금 해제
      if (!b?.password) setUnlocked(true);
      else if (typeof window !== "undefined" && sessionStorage.getItem(`ab-unlock-${boardId}`) === "1") setUnlocked(true);
    });
    const unsub = subscribeToBoardPosts(boardId, setPosts);
    return unsub;
  }, [boardId]);

  useEffect(() => {
    if (!maximizedPost) { setComments([]); setCommentText(""); return; }
    const unsub = subscribeToBoardComments(boardId, maximizedPost.id, setComments);
    return unsub;
  }, [boardId, maximizedPost?.id]);

  // 딥링크: URL에 ?post=<id>가 있으면 해당 게시물을 자동으로 크게 열기 (최초 1회)
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current) return;
    if (!unlocked || posts.length === 0) return;
    const pid = new URLSearchParams(window.location.search).get("post");
    if (!pid) { deepLinkedRef.current = true; return; }
    const post = posts.find(p => p.id === pid);
    if (post) { setMaximizedPost(post); deepLinkedRef.current = true; }
  }, [posts, unlocked]);

  const status = board ? getBoardStatus(board) : "closed";
  const canPost = status === "open" && !!user;
  const isAdmin = !!user && !!board && user.uid === board.uid;
  // 공지: 저장된 수동 순서(annOrder) 우선, 없으면 최신순
  const announcements = useMemo(() => {
    const arr = posts.filter(p => p.isAnnouncement);
    return arr.sort((a, b) => {
      const ao = a.annOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.annOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return b.createdAt - a.createdAt;
    });
  }, [posts]);
  const questions     = posts.filter(p => p.isQuestion);
  const normalPosts   = posts.filter(p => !p.isAnnouncement && !p.isQuestion);

  // 드래그 중에는 낙관적 순서(annOrderIds)를 우선 적용, 새 공지는 뒤에 붙임
  const displayAnnouncements = useMemo(() => {
    if (!annOrderIds) return announcements;
    const map = new Map(announcements.map(p => [p.id, p]));
    const ordered = annOrderIds.map(id => map.get(id)).filter(Boolean) as CloudBoardPost[];
    announcements.forEach(p => { if (!annOrderIds.includes(p.id)) ordered.push(p); });
    return ordered;
  }, [announcements, annOrderIds]);

  const handleAnnDragStart = (id: string) => {
    dragAnnId.current = id;
    setDraggingAnnId(id);
    setAnnOrderIds(displayAnnouncements.map(p => p.id));
  };
  const handleAnnDragEnter = (overId: string) => {
    const from = dragAnnId.current;
    if (!from || from === overId) return;
    setAnnOrderIds(prev => {
      const list = [...(prev ?? displayAnnouncements.map(p => p.id))];
      const fi = list.indexOf(from), oi = list.indexOf(overId);
      if (fi < 0 || oi < 0) return prev;
      list.splice(fi, 1);
      list.splice(oi, 0, from);
      return list;
    });
  };
  const handleAnnDrop = () => {
    const list = annOrderIds;
    dragAnnId.current = null;
    setDraggingAnnId(null);
    if (!list) return;
    // 순차 인덱스를 annOrder로 영구 저장
    list.forEach((id, i) => updateBoardPostAnnOrder(boardId, id, i).catch(() => {}));
  };

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
      (cType === "ppt"     && pptFile) ||
      (cType === "pdf"     && pdfFile) ||
      (cType === "file"    && etcFiles.length > 0);
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

      // Upload PDF file → Storage
      let finalPdfUrl = "";
      if (cType === "pdf" && pdfFile) {
        const { url } = await uploadBoardFile(boardId, "pdf", pdfFile, setUploadPct);
        finalPdfUrl = url;
      }

      // Upload 기타 파일 여러 개 (hwpx / xlsx / pptx / zip 등) → Storage
      const uploadedFiles: BoardFileItem[] = [];
      if (cType === "file" && etcFiles.length) {
        for (let i = 0; i < etcFiles.length; i++) {
          const f = etcFiles[i];
          const { url } = await uploadBoardFile(
            boardId, "files", f,
            pct => setUploadPct(Math.round(((i + pct / 100) / etcFiles.length) * 100)),
            i,
          );
          uploadedFiles.push({ url, name: f.name, size: f.size });
        }
        setUploadPct(100);
      }

      const post: CloudBoardPost = {
        id: crypto.randomUUID(),
        boardId,
        uid: user.uid,
        authorName: user.displayName ?? "익명",
        authorPhoto: user.photoURL ?? "",
        contentType: cType,
        bgColor: cardColor,
        ...(postTitle.trim() && { title: postTitle.trim() }),
        ...(isAnnouncement && { isAnnouncement: true }),
        createdAt: Date.now(),
        ...(cType === "text"    && { text: text.trim() }),
        ...(cType === "image"   && { imageUrl: finalImageUrl }),
        ...(cType === "audio"   && { audioUrl: finalAudioUrl, audioName: audioName || audioFile?.name || "오디오" }),
        ...(cType === "youtube" && { youtubeUrl: ytUrl.trim() }),
        ...(cType === "ppt"     && { pptUrl: finalPptUrl, pptName: pptName || pptFile?.name || "프레젠테이션" }),
        ...(cType === "pdf"     && { pdfUrl: finalPdfUrl, pdfName: pdfName || pdfFile?.name || "PDF 문서" }),
        ...(cType === "file"    && {
          files: uploadedFiles,
          fileName: etcName || (uploadedFiles.length === 1
            ? uploadedFiles[0].name
            : `첨부파일 ${uploadedFiles.length}개`),
        }),
      };
      await addBoardPost(boardId, post);

      // ── Auto-share to feed (image/audio/youtube only) ──────────────────────
      const feedCat: FeedCategory | null =
        cType === "image"   ? "image" :
        cType === "audio"   ? "music" :
        cType === "youtube" ? "video" : null;
      if (shareToFeed && feedCat) {
        const feedPost: CloudFeedPost = {
          id: crypto.randomUUID(),
          uid: user.uid,
          authorName: user.displayName ?? "익명",
          authorPhoto: user.photoURL ?? "",
          category: feedCat,
          title: feedTitle.trim() || audioName || audioFile?.name || board.title,
          ...(feedCat === "image" && { imageUrl: finalImageUrl }),
          ...(feedCat === "music" && { audioUrl: finalAudioUrl }),
          ...(feedCat === "video" && { youtubeUrl: ytUrl.trim() }),
          likes: 0,
          views: 0,
          fromBoardId: boardId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        createFeedPost(feedPost).catch(e => console.error("[feed share]", e));
      }

      setPostTitle("");
      setText(""); setImageUrl(""); setAudioUrl(""); setAudioName(""); setAudioFile(null);
      setYtUrl(""); setPptFile(null); setPptName(""); setPdfFile(null); setPdfName("");
      setEtcFiles([]); setEtcName(""); setIsAnnouncement(false);
      setShareToFeed(false); setFeedTitle("");
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

  // 비밀번호 잠금 화면 (작성자는 통과)
  if (board.password && !unlocked && !isAdmin) {
    const submitPw = () => {
      if (pwInput === board.password) {
        setUnlocked(true);
        setPwError(false);
        try { sessionStorage.setItem(`ab-unlock-${boardId}`, "1"); } catch {}
      } else {
        setPwError(true);
      }
    };
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F4F6FA", padding:24, fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
        <div style={{ background:"white", borderRadius:24, padding:"40px 32px", width:"100%", maxWidth:380, boxShadow:"0 24px 80px rgba(0,0,0,0.12)", textAlign:"center" }}>
          <div style={{ fontSize:44, marginBottom:12 }}>🔒</div>
          <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:6 }}>{board.title}</div>
          <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>이 보드는 비밀번호로 보호되어 있어요</div>
          <input
            type="password"
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(false); }}
            onKeyDown={e => { if (e.key === "Enter") submitPw(); }}
            placeholder="비밀번호 입력"
            autoFocus
            style={{ width:"100%", padding:"12px 14px", border:`1.5px solid ${pwError ? "#DC2626" : "#E5E7EB"}`, borderRadius:12, fontSize:15, fontFamily:"inherit", outline:"none", textAlign:"center", marginBottom:pwError ? 8 : 16 }}
          />
          {pwError && <div style={{ fontSize:12, color:"#DC2626", marginBottom:16 }}>비밀번호가 일치하지 않습니다</div>}
          <button
            onClick={submitPw}
            style={{ width:"100%", padding:"13px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:"white", cursor:"pointer", boxShadow:`0 4px 16px rgba(124,58,237,0.3)` }}
          >입장하기</button>
          <Link href="/actionboard" style={{ display:"inline-block", marginTop:16, color:"#9CA3AF", fontSize:13, fontWeight:600 }}>← 목록으로</Link>
        </div>
      </div>
    );
  }

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

      {/* ── 모바일 전용 헤더 ── */}
      {isMobile && (
        <div style={{ position:"sticky", top:0, zIndex:100, background:"white", borderBottom:"1px solid #E5E7EB", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px" }}>
            <Link href="/actionboard" style={{ textDecoration:"none", fontSize:20, color:"#6B7280", flexShrink:0, lineHeight:1 }}>←</Link>
            <span style={{ flex:1, minWidth:0, fontSize:15, fontWeight:800, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{board.title}</span>
            <span style={{ flexShrink:0, fontSize:10, fontWeight:700, color:statusColors[status], background:`${statusColors[status]}18`, padding:"3px 8px", borderRadius:100 }}>{statusLabels[status]}</span>
            <button onClick={openQr} style={{ flexShrink:0, background:"none", border:"none", fontSize:19, cursor:"pointer", padding:0 }} title="QR">🔳</button>
          </div>
          {status === "open" ? (
            <div style={{ display:"flex", gap:8, padding:"0 12px 11px" }}>
              {user ? (
                <>
                  <button onClick={() => setShowQuestionForm(true)} style={{ flex:1, padding:"14px 0", background:"white", border:"2px solid #F59E0B", borderRadius:13, fontSize:15, fontWeight:800, color:"#D97706", cursor:"pointer" }}>❓ 질문하기</button>
                  <button onClick={() => setShowForm(true)} style={{ flex:1.5, padding:"14px 0", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:13, fontSize:15, fontWeight:800, color:"white", cursor:"pointer", boxShadow:"0 4px 14px rgba(124,58,237,0.3)" }}>＋ 게시물 추가</button>
                </>
              ) : (
                <button onClick={signIn} style={{ flex:1, padding:"14px 0", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:13, fontSize:15, fontWeight:800, color:"white", cursor:"pointer" }}>로그인하고 참여하기</button>
              )}
            </div>
          ) : (
            <div style={{ padding:"0 14px 11px", fontSize:12, color:"#92400E", fontWeight:600 }}>⚠️ 입력 기간이 종료되어 열람만 가능해요</div>
          )}
        </div>
      )}

      {/* Nav (데스크탑) */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 32px", height:60, display:isMobile?"none":"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
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
          <button
            onClick={handleCopyLink}
            style={{ padding:"7px 14px", background:copied?"#059669":"white", border:`1.5px solid ${copied?"#059669":"#E5E7EB"}`, borderRadius:10, fontSize:12, fontWeight:700, color:copied?"white":"#374151", cursor:"pointer", transition:"all 0.2s", display:"flex", alignItems:"center", gap:5 }}
          >
            {copied ? "✓ 복사됨!" : "🔗 퍼가기"}
          </button>
          <button
            onClick={openQr}
            style={{ padding:"7px 14px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:12, fontWeight:700, color:"#374151", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}
          >🔳 QR</button>
          <span style={{ fontSize:12, color:"#9CA3AF" }}>마감: {fmtDate(board.endAt)}</span>
          {status === "open" && (
            user ? (
              <div style={{ display:"flex", gap:8 }}>
                <button
                  onClick={() => setShowQuestionForm(true)}
                  style={{ padding:"8px 18px", background:"white", border:"2px solid #F59E0B", borderRadius:10, fontSize:13, fontWeight:700, color:"#D97706", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}
                >❓ 질문하기</button>
                <button onClick={() => setShowForm(true)} style={{ padding:"8px 18px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>+ 게시물 추가</button>
              </div>
            ) : (
              <button onClick={signIn} style={{ padding:"8px 18px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>로그인 후 참여</button>
            )
          )}
        </div>
      </nav>

      {/* Board info bar (데스크탑) */}
      <div style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"12px 32px", display:isMobile?"none":"flex", alignItems:"center", gap:24 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#6B7280" }}>
          {board.creatorPhoto && <img src={board.creatorPhoto} alt="" style={{ width:18, height:18, borderRadius:"50%" }} />}
          <span>개설자: <strong style={{ color:"#374151" }}>{board.creatorName}</strong></span>
        </div>
        <div style={{ fontSize:12, color:"#6B7280" }}>📅 {fmtDate(board.startAt)} ~ {fmtDate(board.endAt)}</div>
        <div style={{ fontSize:12, color:"#6B7280" }}>📝 {posts.length}개 게시물</div>
        {board.description && <div style={{ fontSize:12, color:"#6B7280" }}>💬 {board.description}</div>}
      </div>

      {/* Closed banner (데스크탑) */}
      {status === "closed" && !isMobile && (
        <div style={{ background:"#FFF3CD", borderBottom:"1px solid #FCD34D", padding:"10px 32px", fontSize:13, color:"#92400E", fontWeight:600 }}>
          ⚠️ 입력 기간이 종료되었습니다. 게시물 열람만 가능합니다.
        </div>
      )}

      {/* ── Announcement banner ── */}
      {announcements.length > 0 && (
        <div style={{ background:"linear-gradient(135deg,rgba(124,58,237,0.06),rgba(236,72,153,0.04))", borderBottom:"1px solid rgba(124,58,237,0.12)", padding:"12px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#7C3AED", letterSpacing:1 }}>📢 공지</span>
            {isAdmin && announcements.length > 1 && (
              <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:600 }}>⇄ 카드를 좌우로 드래그해 순서를 바꿀 수 있어요</span>
            )}
          </div>
          <div style={{ display:"flex", gap:12, overflowX:"auto", paddingBottom:4 }}>
            {displayAnnouncements.map(post => (
              <div
                key={post.id}
                onClick={() => { if (dragAnnId.current) return; setMaximizedPost(post); }}
                draggable={isAdmin}
                onDragStart={isAdmin ? () => handleAnnDragStart(post.id) : undefined}
                onDragEnter={isAdmin ? () => handleAnnDragEnter(post.id) : undefined}
                onDragOver={isAdmin ? (e => e.preventDefault()) : undefined}
                onDrop={isAdmin ? handleAnnDrop : undefined}
                onDragEnd={isAdmin ? handleAnnDrop : undefined}
                style={{ flexShrink:0, width:260, background:post.bgColor ?? "#FFF9C4", borderRadius:14, padding:"14px 16px", boxShadow: draggingAnnId === post.id ? "0 12px 32px rgba(124,58,237,0.28)" : "0 2px 8px rgba(0,0,0,0.08)", position:"relative", cursor: isAdmin ? "grab" : "pointer", opacity: draggingAnnId === post.id ? 0.85 : 1, transition:"box-shadow 0.15s,opacity 0.15s" }}
              >
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                  {post.authorPhoto && <img src={post.authorPhoto} alt="" style={{ width:18, height:18, borderRadius:"50%" }} />}
                  <span style={{ fontSize:11, fontWeight:600, color:"#374151" }}>{post.authorName}</span>
                  <span style={{ fontSize:10, color:"#9CA3AF" }}>{fmtDate(post.createdAt)}</span>
                  <div style={{ marginLeft:"auto", display:"flex", gap:2 }}>
                    {user && (user.uid === post.uid || user.uid === board.uid) && (
                      <button
                        onClick={e => { e.stopPropagation(); openEditPost(post); }}
                        style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF", padding:"2px 4px" }}
                        title="수정"
                      >✏️</button>
                    )}
                    {user && (user.uid === post.uid || user.uid === board.uid) && (
                      <button
                        onClick={e => { e.stopPropagation(); if (window.confirm("이 게시물을 삭제할까요?")) deleteBoardPost(boardId, post.id); }}
                        style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF", padding:"2px 4px" }}
                        title="삭제"
                      >×</button>
                    )}
                  </div>
                </div>
                {post.title && (
                  <div style={{ fontSize:15, fontWeight:800, color:"#0F172A", lineHeight:1.3, marginBottom:6, paddingBottom:6, borderBottom:"2px solid rgba(0,0,0,0.08)", wordBreak:"break-word" }}>{post.title}</div>
                )}
                {post.contentType === "text"  && (() => {
                  const txt = post.text ?? "";
                  const long = txt.length > 80 || txt.split("\n").length > 4;
                  const bg = post.bgColor ?? "#FFF9C4";
                  return (
                    <div style={{ position:"relative", overflow:"hidden" }}>
                      <p style={{ fontSize:13, color:"#1F2937", lineHeight:1.6, whiteSpace:"pre-wrap", maxHeight:long?84:"none", overflow:"hidden" }}>{linkify(txt)}</p>
                      {long && (
                        <>
                          <div style={{ position:"absolute", bottom:18, left:0, right:0, height:30, background:`linear-gradient(transparent, ${bg})`, pointerEvents:"none" }} />
                          <div style={{ marginTop:2, fontSize:12, fontWeight:700, color:"#7C3AED" }}>더보기 ↓</div>
                        </>
                      )}
                    </div>
                  );
                })()}
                {post.contentType === "image" && post.imageUrl && <img src={post.imageUrl} alt="" style={{ width:"100%", borderRadius:8 }} />}
                {post.contentType === "youtube" && post.youtubeUrl && getYoutubeId(post.youtubeUrl) && <img src={`https://img.youtube.com/vi/${getYoutubeId(post.youtubeUrl)}/mqdefault.jpg`} alt="" style={{ width:"100%", borderRadius:8 }} />}
                {post.contentType === "ppt" && post.pptUrl && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:"rgba(0,0,0,0.05)", borderRadius:8 }}>
                    <span style={{ fontSize:20 }}>📊</span>
                    <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{post.pptName || "프레젠테이션"}</span>
                  </div>
                )}
                {post.contentType === "pdf" && post.pdfUrl && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:"rgba(0,0,0,0.05)", borderRadius:8 }}>
                    <span style={{ fontSize:20 }}>📄</span>
                    <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{post.pdfName || "PDF 문서"}</span>
                  </div>
                )}
                {post.contentType === "audio" && post.audioUrl && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:"rgba(0,0,0,0.05)", borderRadius:8 }}>
                    <span style={{ fontSize:20 }}>🎵</span>
                    <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{post.audioName || "오디오"}</span>
                  </div>
                )}
                {post.contentType === "file" && postFiles(post).length > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:"rgba(0,0,0,0.05)", borderRadius:8 }}>
                    <span style={{ fontSize:20 }}>{fileIcon(postFiles(post)[0].name)}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {post.fileName || postFiles(post)[0].name}
                    </span>
                    {postFiles(post).length > 1 && (
                      <span style={{ fontSize:10, fontWeight:700, color:"white", background:"#0F766E", borderRadius:20, padding:"1px 7px", flexShrink:0 }}>
                        {postFiles(post).length}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Question section ── */}
      {questions.length > 0 && (
        <div style={{ background:"linear-gradient(135deg,rgba(245,158,11,0.07),rgba(239,68,68,0.03))", borderBottom:"1px solid rgba(245,158,11,0.18)", padding:"12px 24px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#D97706", letterSpacing:1, marginBottom:10 }}>❓ 질문</div>
          <div style={{ display:"flex", gap:14, overflowX:"auto", paddingBottom:4 }}>
            {questions.map(post => (
              <div
                key={post.id}
                onClick={() => setMaximizedPost(post)}
                style={{ flexShrink:0, width:280, borderRadius:16, overflow:"hidden", boxShadow:"0 4px 16px rgba(245,158,11,0.15)", cursor:"pointer", border:"2px solid rgba(245,158,11,0.35)", background:"white" }}
              >
                {/* Question card header strip */}
                <div style={{ background:"linear-gradient(135deg,#F59E0B,#EF4444)", padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:16 }}>❓</span>
                    <span style={{ fontSize:11, fontWeight:800, color:"white", letterSpacing:1 }}>QUESTION</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    {post.authorPhoto && <img src={post.authorPhoto} alt="" style={{ width:18, height:18, borderRadius:"50%", border:"1.5px solid rgba(255,255,255,0.6)" }} />}
                    <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.9)" }}>{post.authorName}</span>
                    <span style={{ fontSize:10, color:"rgba(255,255,255,0.65)" }}>{fmtDate(post.createdAt)}</span>
                  </div>
                </div>
                {/* Body */}
                <div style={{ padding:"14px 16px", background:"#FFFBEB" }}>
                  <p style={{ fontSize:14, fontWeight:700, color:"#1F2937", lineHeight:1.6, whiteSpace:"pre-wrap", marginBottom: (post.refUrl || post.refText || post.imageUrl) ? 10 : 0 }}>
                    {post.text}
                  </p>
                  {post.refUrl && (
                    <a href={post.refUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#2563EB", background:"rgba(37,99,235,0.06)", padding:"6px 10px", borderRadius:8, textDecoration:"none", border:"1px solid rgba(37,99,235,0.15)", wordBreak:"break-all", lineHeight:1.4 }}>
                      <span>🔗</span><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{post.refUrl}</span>
                    </a>
                  )}
                  {post.imageUrl && (
                    <img src={post.imageUrl} alt="참조 이미지" style={{ width:"100%", borderRadius:8, marginTop:4, maxHeight:120, objectFit:"cover" }} />
                  )}
                  {post.refText && (
                    <div style={{ fontSize:11, color:"#6B7280", background:"rgba(0,0,0,0.04)", padding:"8px 10px", borderRadius:8, borderLeft:"3px solid #F59E0B", fontStyle:"italic", lineHeight:1.5, maxHeight:72, overflow:"hidden", whiteSpace:"pre-wrap" }}>
                      {post.refText}
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div style={{ padding:"8px 16px 10px", background:"#FFF7ED", display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:"1px solid rgba(245,158,11,0.15)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#9CA3AF" }}>
                    {(post.commentCount ?? 0) > 0 && <><span>💬</span><span>{post.commentCount}개 댓글</span></>}
                  </div>
                  <div style={{ display:"flex", gap:4 }}>
                    {user && (user.uid === post.uid || user.uid === board.uid) && (
                      <>
                        <button onClick={e => { e.stopPropagation(); openEditPost(post); }}
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9CA3AF", padding:"2px 5px" }} title="수정">✏️</button>
                        <button onClick={e => { e.stopPropagation(); deleteBoardPost(boardId, post.id); }}
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#9CA3AF", padding:"2px 5px" }} title="삭제">×</button>
                      </>
                    )}
                    <span style={{ fontSize:11, color:"#D97706", fontWeight:700 }}>답변 보기 →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free-position canvas */}
      <div
        ref={canvasRef}
        style={{ position:"relative", minHeight:"calc(100vh - 120px)", overflow:"visible" }}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
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
                  onDelete={() => { if (window.confirm("이 게시물을 삭제할까요?")) deleteBoardPost(boardId, post.id); }}
                  onEdit={() => openEditPost(post)}
                  onOpenDoc={(url, name, size) => setDocViewer({ url, name, size })}
                  onPointerDown={e => handleCardPointerDown(e, post.id)}
                  isDragging={isDragging}
                  onOpen={() => setMaximizedPost(post)}
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
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:6, marginBottom:16 }}>
              {([["text","📝 텍스트"],["image","🖼️ 이미지"],["audio","🎵 MP3"],["youtube","▶ 유튜브"],["ppt","📊 PPT"],["pdf","📄 PDF"],["file","📎 기타"]] as [ContentType,string][]).map(([t,label]) => (
                <button key={t} onClick={() => setCType(t)} className="type-btn" style={{ padding:"8px 0", borderRadius:10, border:`2px solid ${cType===t?P:"#E5E7EB"}`, background:cType===t?`rgba(124,58,237,0.07)`:"white", fontSize:12, fontWeight:700, color:cType===t?P:"#6B7280" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* 제목 (선택) — 모든 타입 공통 */}
            <div style={{ marginBottom:14 }}>
              <input
                value={postTitle}
                onChange={e => setPostTitle(e.target.value)}
                placeholder="제목 (선택) — 입력하면 크게 표시돼요"
                maxLength={60}
                style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:15, fontWeight:700, fontFamily:"inherit", outline:"none" }}
              />
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

            {cType === "pdf" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <input ref={pdfFileRef} type="file" accept=".pdf,application/pdf" style={{ display:"none" }} onChange={e => { const f = e.target.files?.[0]; if(f){ setPdfFile(f); setPdfName(f.name); } }} />
                {pdfFile ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"#FEF2F2", borderRadius:10, border:"1.5px solid #FECACA" }}>
                    <span style={{ fontSize:24 }}>📄</span>
                    <span style={{ fontSize:13, fontWeight:600, color:"#DC2626", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{pdfFile.name}</span>
                    <button onClick={() => { setPdfFile(null); setPdfName(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:16 }}>×</button>
                  </div>
                ) : (
                  <div onClick={() => pdfFileRef.current?.click()} style={{ border:"2px dashed #E5E7EB", borderRadius:12, padding:"28px", textAlign:"center", cursor:"pointer", color:"#9CA3AF" }}>
                    <div style={{ fontSize:28, marginBottom:6 }}>📄</div>
                    <div style={{ fontSize:13 }}>클릭하여 PDF 파일 선택</div>
                    <div style={{ fontSize:11, marginTop:4, color:"#FCA5A5" }}>브라우저 내장 PDF 뷰어로 바로 열람 가능</div>
                  </div>
                )}
                <input value={pdfName} onChange={e => setPdfName(e.target.value)} placeholder="문서 제목 (선택)" style={{ padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit" }} />
              </div>
            )}

            {cType === "file" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <input ref={etcFileRef} type="file" multiple style={{ display:"none" }}
                  onChange={e => {
                    const picked = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (!picked.length) return;

                    const tooBig = picked.filter(f => f.size > MAX_ATTACH_BYTES);
                    if (tooBig.length) {
                      alert(`다음 파일은 ${fmtBytes(MAX_ATTACH_BYTES)}를 넘어 제외됩니다:\n` +
                        tooBig.map(f => `· ${f.name} (${fmtBytes(f.size)})`).join("\n"));
                    }
                    // 같은 파일을 두 번 고른 경우 제외하고 기존 선택에 이어붙인다
                    const merged = [...etcFiles];
                    for (const f of picked.filter(f => f.size <= MAX_ATTACH_BYTES)) {
                      if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
                    }
                    if (merged.length > MAX_ATTACH_COUNT) {
                      alert(`첨부는 게시물당 최대 ${MAX_ATTACH_COUNT}개까지예요.`);
                    }
                    setEtcFiles(merged.slice(0, MAX_ATTACH_COUNT));
                  }} />

                {etcFiles.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {etcFiles.map((f, i) => (
                      <div key={`${f.name}-${f.size}-${i}`} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"#F0FDFA", borderRadius:10, border:"1.5px solid #99F6E4" }}>
                        <span style={{ fontSize:20 }}>{fileIcon(f.name)}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#0F766E", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                          <div style={{ fontSize:11, color:"#14B8A6" }}>
                            {fmtBytes(f.size)}
                            {previewKind(f.name) !== "none" ? " · 뷰어 열람 가능" : " · 다운로드만"}
                          </div>
                        </div>
                        <button onClick={() => setEtcFiles(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:16 }}>×</button>
                      </div>
                    ))}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"0 2px" }}>
                      <span style={{ fontSize:11, color:"#6B7280" }}>
                        총 {etcFiles.length}개 · {fmtBytes(etcFiles.reduce((s, f) => s + f.size, 0))}
                      </span>
                      <div style={{ display:"flex", gap:8 }}>
                        {etcFiles.length < MAX_ATTACH_COUNT && (
                          <button onClick={() => etcFileRef.current?.click()}
                            style={{ padding:"5px 12px", background:"white", border:"1.5px solid #99F6E4", borderRadius:8, fontSize:11, fontWeight:700, color:"#0F766E", cursor:"pointer" }}>
                            + 파일 추가
                          </button>
                        )}
                        <button onClick={() => setEtcFiles([])}
                          style={{ padding:"5px 12px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:8, fontSize:11, fontWeight:700, color:"#9CA3AF", cursor:"pointer" }}>
                          전체 비우기
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {etcFiles.length === 0 && (
                  <div onClick={() => etcFileRef.current?.click()} style={{ border:"2px dashed #E5E7EB", borderRadius:12, padding:"28px", textAlign:"center", cursor:"pointer", color:"#9CA3AF" }}>
                    <div style={{ fontSize:28, marginBottom:6 }}>📎</div>
                    <div style={{ fontSize:13 }}>클릭하여 파일 선택 (여러 개 선택 가능, 형식 제한 없음)</div>
                    <div style={{ fontSize:11, marginTop:4, color:"#14B8A6" }}>
                      HWPX · HWP · XLSX · CSV · DOCX · PPTX · TXT는 뷰어로 열람하고 내용을 복사할 수 있어요
                    </div>
                    <div style={{ fontSize:11, marginTop:2, color:"#D1D5DB" }}>
                      개당 최대 {fmtBytes(MAX_ATTACH_BYTES)} · 게시물당 {MAX_ATTACH_COUNT}개까지
                    </div>
                  </div>
                )}

                <input value={etcName} onChange={e => setEtcName(e.target.value)}
                  placeholder={etcFiles.length > 1 ? "첨부 묶음 제목 (선택) — 예: 3차 회의 자료" : "파일 제목 (선택)"}
                  style={{ padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit" }} />
              </div>
            )}

            {/* Color palette */}
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>🎨 카드 배경색</div>
              <ColorPalette value={cardColor} onChange={setCardColor} />
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

            {/* Share to feed toggle — only for image/audio/youtube */}
            {(cType === "image" || cType === "audio" || cType === "youtube") && (
              <div style={{ background:"rgba(236,72,153,0.05)", borderRadius:10, border:"1.5px solid rgba(236,72,153,0.15)", overflow:"hidden" }}>
                <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", padding:"10px 14px" }}>
                  <input type="checkbox" checked={shareToFeed} onChange={e => setShareToFeed(e.target.checked)} style={{ width:16, height:16, accentColor:"#EC4899" }} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#EC4899" }}>🌐 피드에도 공유</div>
                    <div style={{ fontSize:11, color:"#9CA3AF" }}>크리에이터 피드에 함께 전시됩니다</div>
                  </div>
                </label>
                {shareToFeed && (
                  <input
                    value={feedTitle}
                    onChange={e => setFeedTitle(e.target.value)}
                    placeholder="피드 제목 (비워두면 자동 설정)"
                    style={{ width:"100%", padding:"10px 14px", border:"none", borderTop:"1px solid rgba(236,72,153,0.15)", fontSize:13, fontFamily:"inherit", outline:"none", background:"white" }}
                  />
                )}
              </div>
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

      {/* ── 문서 전체화면 뷰어 — rendered at root level to escape transform stacking context ── */}
      {docViewer && (
        <DocViewer
          url={docViewer.url}
          name={docViewer.name}
          size={docViewer.size}
          onClose={() => setDocViewer(null)}
        />
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
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {postQrDataUrl ? (
                <img
                  src={postQrDataUrl}
                  onClick={() => setShowPostQrBig(true)}
                  title="QR 코드 크게 보기"
                  style={{ width:40, height:40, borderRadius:8, background:"white", padding:3, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.3)" }}
                />
              ) : (
                <button onClick={generatePostQr} disabled={postQrLoading} style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:10, padding:"8px 16px", cursor:postQrLoading?"default":"pointer", fontSize:13, fontWeight:700 }}>
                  {postQrLoading ? "생성 중..." : "📱 QR 생성"}
                </button>
              )}
              <button onClick={() => setMaximizedPost(null)} style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:10, padding:"8px 20px", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕ 닫기</button>
            </div>
          </div>

          {/* Content + Comments */}
          <div style={{ flex:1, overflow:"auto", display:"flex", flexDirection:"column", alignItems:"center", padding:"40px 40px 0" }}>
            <div style={{ width:"100%", maxWidth:960 }}>
              {maximizedPost.title && (
                <div style={{ fontSize:28, fontWeight:800, color:"#0F172A", lineHeight:1.3, letterSpacing:-0.5, marginBottom:20, wordBreak:"break-word" }}>
                  {maximizedPost.title}
                </div>
              )}
              {maximizedPost.contentType === "text" && (
                <div style={{ background:maximizedPost.bgColor ?? "#FFF9C4", borderRadius:24, overflow:"hidden" }}>
                  <CopyBar text={maximizedPost.text ?? ""} position="top" />
                  <div style={{ padding:"32px 48px", fontSize:18, lineHeight:1.8, color:"#1F2937", whiteSpace:"pre-wrap" }}>
                    {linkify(maximizedPost.text ?? "")}
                  </div>
                  <CopyBar text={maximizedPost.text ?? ""} position="bottom" />
                </div>
              )}
              {maximizedPost.contentType === "image" && maximizedPost.imageUrl && (
                <img src={maximizedPost.imageUrl} alt="" style={{ maxWidth:"100%", maxHeight:560, borderRadius:16, objectFit:"contain", display:"block", margin:"0 auto" }} />
              )}
              {maximizedPost.contentType === "audio" && maximizedPost.audioUrl && (
                <div style={{ background:maximizedPost.bgColor ?? "#FFF9C4", borderRadius:24, padding:"60px 80px", textAlign:"center" }}>
                  <div style={{ fontSize:64, marginBottom:24 }}>🎵</div>
                  <div style={{ fontSize:22, fontWeight:700, color:"#1F2937", marginBottom:32 }}>{maximizedPost.audioName}</div>
                  <audio controls src={maximizedPost.audioUrl} style={{ width:400 }} />
                </div>
              )}
              {maximizedPost.contentType === "youtube" && maximizedPost.youtubeUrl && (
                <div style={{ position:"relative", paddingTop:"56.25%", borderRadius:16, overflow:"hidden" }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${getYoutubeId(maximizedPost.youtubeUrl) ?? ""}?autoplay=1`}
                    style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }}
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  />
                </div>
              )}
              {maximizedPost.contentType === "ppt" && maximizedPost.pptUrl && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                    <button onClick={() => setDocViewer({ url: maximizedPost.pptUrl!, name: withExt(maximizedPost.pptName || "프레젠테이션", "pptx") })}
                      style={{ padding:"8px 20px", background:"rgba(124,58,237,0.85)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      ⛶ 전체화면 뷰어
                    </button>
                    <a href={maximizedPost.pptUrl} download target="_blank" rel="noreferrer"
                      style={{ padding:"8px 20px", background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:10, fontSize:13, fontWeight:600, textDecoration:"none" }}>
                      ⬇️ PPT 다운로드
                    </a>
                  </div>
                  <div style={{ height:520 }}>
                    <DocContent url={maximizedPost.pptUrl} name={withExt(maximizedPost.pptName || "프레젠테이션", "pptx")} />
                  </div>
                </div>
              )}

              {maximizedPost.contentType === "file" && (() => {
                const files = postFiles(maximizedPost);
                if (!files.length) return null;
                const sel = files[Math.min(selFileIdx, files.length - 1)];
                const selPreviewable = previewKind(sel.name) !== "none";
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                      <span style={{ fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.9)" }}>
                        📎 첨부파일 {files.length}개
                        <span style={{ fontSize:12, fontWeight:500, color:"rgba(255,255,255,0.5)", marginLeft:8 }}>
                          · 총 {fmtBytes(files.reduce((s, f) => s + (f.size || 0), 0))}
                        </span>
                      </span>
                      {files.length > 1 && (
                        <button onClick={() => downloadAllFiles(files)} disabled={bulkSaving}
                          style={{ padding:"8px 18px", background:"rgba(15,118,110,0.85)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:10, fontSize:13, fontWeight:700, cursor:bulkSaving?"default":"pointer" }}>
                          {bulkSaving ? `저장 중... (${bulkDone}/${files.length})` : "⬇️ 모두 다운로드"}
                        </button>
                      )}
                    </div>

                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {files.map((f, i) => (
                        <FileRow
                          key={f.url + i}
                          file={f}
                          dark
                          active={files.length > 1 && i === Math.min(selFileIdx, files.length - 1)}
                          onOpen={() => setSelFileIdx(i)}
                        />
                      ))}
                    </div>

                    {selPreviewable && (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                          <span style={{ fontSize:12, color:"rgba(255,255,255,0.6)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            미리보기 — {sel.name}
                          </span>
                          <button onClick={() => setDocViewer({ url: sel.url, name: sel.name, size: sel.size })}
                            style={{ padding:"6px 16px", background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
                            ⛶ 전체화면
                          </button>
                        </div>
                        <div style={{ height:520 }}>
                          <DocContent key={sel.url} url={sel.url} name={sel.name} size={sel.size} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {maximizedPost.contentType === "pdf" && maximizedPost.pdfUrl && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                    <a href={maximizedPost.pdfUrl} target="_blank" rel="noreferrer"
                      style={{ padding:"8px 20px", background:"rgba(220,38,38,0.7)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:10, fontSize:13, fontWeight:600, textDecoration:"none" }}>
                      🔗 새 탭에서 열기
                    </a>
                    <a href={maximizedPost.pdfUrl} download target="_blank" rel="noreferrer"
                      style={{ padding:"8px 20px", background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:10, fontSize:13, fontWeight:600, textDecoration:"none" }}>
                      ⬇️ PDF 다운로드
                    </a>
                  </div>
                  <iframe
                    src={maximizedPost.pdfUrl}
                    style={{ border:"none", width:"100%", height:600, borderRadius:12, background:"white" }}
                    title={maximizedPost.pdfName || "PDF 문서"}
                  />
                </div>
              )}

              {/* ── Comments section ── */}
              <div style={{ marginTop:40, marginBottom:40 }}>
                <div style={{ fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.85)", marginBottom:16 }}>
                  💬 댓글 {comments.length > 0 ? `${comments.length}개` : ""}
                </div>

                {/* Comment list */}
                {comments.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                    {comments.map(c => (
                      <div key={c.id} style={{ background:"rgba(255,255,255,0.08)", borderRadius:14, padding:"12px 16px", display:"flex", gap:10, alignItems:"flex-start" }}>
                        {c.authorPhoto
                          ? <img src={c.authorPhoto} alt="" style={{ width:28, height:28, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
                          : <div style={{ width:28, height:28, borderRadius:"50%", background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"white", fontWeight:800, flexShrink:0 }}>{c.authorName[0]}</div>
                        }
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.9)" }}>{c.authorName}</span>
                            <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{fmtDate(c.createdAt)}</span>
                          </div>
                          <p style={{ fontSize:13, color:"rgba(255,255,255,0.8)", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{c.text}</p>
                        </div>
                        {user && (user.uid === c.uid || (board && user.uid === board.uid)) && (
                          <button
                            onClick={() => deleteBoardComment(boardId, maximizedPost.id, c.id)}
                            style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.35)", fontSize:16, padding:"0 4px", flexShrink:0, lineHeight:1 }}
                            title="댓글 삭제"
                          >×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment input */}
                {user ? (
                  <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
                    {user.photoURL
                      ? <img src={user.photoURL} alt="" style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
                      : <div style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"white", fontWeight:800, flexShrink:0 }}>{(user.displayName ?? "?")[0]}</div>
                    }
                    <div style={{ flex:1, position:"relative" }}>
                      <textarea
                        ref={commentInputRef}
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(); } }}
                        placeholder="댓글을 입력하세요... (Shift+Enter 줄바꿈)"
                        rows={2}
                        style={{ width:"100%", padding:"10px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:12, fontSize:13, color:"white", fontFamily:"inherit", resize:"none", outline:"none" }}
                      />
                    </div>
                    <button
                      onClick={handleCommentSubmit}
                      disabled={commentSubmitting || !commentText.trim()}
                      style={{ padding:"10px 18px", background:commentText.trim()?`linear-gradient(135deg,${P},${PINK})`:"rgba(255,255,255,0.1)", border:"none", borderRadius:12, fontSize:13, fontWeight:700, color:"white", cursor:commentText.trim()?"pointer":"default", flexShrink:0 }}
                    >
                      {commentSubmitting ? "..." : "등록"}
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign:"center", padding:"16px", background:"rgba(255,255,255,0.06)", borderRadius:12, fontSize:13, color:"rgba(255,255,255,0.5)" }}>
                    댓글을 작성하려면 <button onClick={signIn} style={{ background:"none", border:"none", color:"#A78BFA", fontWeight:700, cursor:"pointer", fontSize:13 }}>로그인</button>하세요
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Question form modal ── */}
      {showQuestionForm && (
        <div onClick={() => setShowQuestionForm(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:560, boxShadow:"0 -12px 40px rgba(0,0,0,0.15)", animation:"fadeUp 0.25s ease both", overflow:"hidden" }}>
            {/* Modal header strip */}
            <div style={{ background:"linear-gradient(135deg,#F59E0B,#EF4444)", padding:"18px 28px", display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:22 }}>❓</span>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:"white" }}>질문하기</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.75)" }}>질문 카드로 보드에 고정됩니다</div>
              </div>
            </div>

            <div style={{ padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>
              {/* Question text */}
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>질문 내용 *</label>
                <textarea
                  value={qText}
                  onChange={e => setQText(e.target.value)}
                  placeholder="궁금한 점을 자유롭게 입력하세요..."
                  rows={4}
                  autoFocus
                  style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontFamily:"inherit", resize:"vertical", outline:"none" }}
                  onFocus={e => { e.target.style.borderColor="#F59E0B"; }}
                  onBlur={e => { e.target.style.borderColor="#E5E7EB"; }}
                />
              </div>

              {/* Reference type selector */}
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>참조 자료 <span style={{ fontWeight:400, color:"#9CA3AF" }}>(선택)</span></label>
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  {([["none","없음"],["url","🔗 URL"],["image","🖼️ 이미지"],["text","📋 텍스트"]] as ["none"|"url"|"image"|"text", string][]).map(([t, label]) => (
                    <button key={t} onClick={() => setQRefType(t)}
                      style={{ padding:"6px 14px", borderRadius:100, border:`1.5px solid ${qRefType===t?"#F59E0B":"#E5E7EB"}`, background:qRefType===t?"rgba(245,158,11,0.08)":"white", fontSize:12, fontWeight:700, color:qRefType===t?"#D97706":"#6B7280", cursor:"pointer", transition:"all 0.15s" }}>
                      {label}
                    </button>
                  ))}
                </div>

                {qRefType === "url" && (
                  <input
                    value={qRefUrl}
                    onChange={e => setQRefUrl(e.target.value)}
                    placeholder="https://..."
                    style={{ width:"100%", padding:"10px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", outline:"none" }}
                    onFocus={e => { e.target.style.borderColor="#F59E0B"; }}
                    onBlur={e => { e.target.style.borderColor="#E5E7EB"; }}
                  />
                )}

                {qRefType === "image" && (
                  <div>
                    <input ref={qImageRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { if (e.target.files?.[0]) handleQuestionImage(e.target.files[0]); }} />
                    {qRefImage ? (
                      <div style={{ position:"relative" }}>
                        <img src={qRefImage} alt="" style={{ width:"100%", borderRadius:10, maxHeight:180, objectFit:"cover" }} />
                        <button onClick={() => setQRefImage("")} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.6)", border:"none", borderRadius:"50%", width:26, height:26, color:"white", cursor:"pointer", fontSize:14 }}>×</button>
                      </div>
                    ) : (
                      <div onClick={() => qImageRef.current?.click()} style={{ border:"2px dashed #FCD34D", borderRadius:12, padding:"32px", textAlign:"center", cursor:"pointer", background:"rgba(245,158,11,0.03)", color:"#D97706" }}>
                        <div style={{ fontSize:28, marginBottom:6 }}>🖼️</div>
                        <div style={{ fontSize:13, fontWeight:600 }}>클릭하여 이미지 선택</div>
                        <div style={{ fontSize:11, color:"#9CA3AF", marginTop:3 }}>스크린샷, 오류 화면 등 첨부</div>
                      </div>
                    )}
                  </div>
                )}

                {qRefType === "text" && (
                  <textarea
                    value={qRefText}
                    onChange={e => setQRefText(e.target.value)}
                    placeholder="참조할 텍스트를 붙여넣으세요 (코드, 오류 메시지, 문단 등)..."
                    rows={4}
                    style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:12, fontFamily:"'Courier New', monospace", resize:"vertical", outline:"none", background:"#FAFAFA" }}
                    onFocus={e => { e.target.style.borderColor="#F59E0B"; }}
                    onBlur={e => { e.target.style.borderColor="#E5E7EB"; }}
                  />
                )}
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setShowQuestionForm(false)} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
                <button
                  onClick={handleQuestionSubmit}
                  disabled={qSubmitting || !qText.trim()}
                  style={{ flex:2, padding:"13px", background:qText.trim()?"linear-gradient(135deg,#F59E0B,#EF4444)":"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:qText.trim()?"white":"#9CA3AF", cursor:qText.trim()?"pointer":"default", boxShadow:qText.trim()?"0 4px 16px rgba(245,158,11,0.35)":"none" }}
                >
                  {qSubmitting ? "등록 중..." : "❓ 질문 등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit post modal ── */}
      {showQr && (
        <div onClick={() => setShowQr(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:550, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"34px", width:"100%", maxWidth:380, textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize:20, fontWeight:800, color:"#111827", marginBottom:4 }}>🔳 보드 QR 코드</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:22, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{board.title}</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:248, height:248, margin:"0 auto", background:"white", borderRadius:16, border:"1.5px solid #EEF0F4", boxShadow:"0 4px 16px rgba(0,0,0,0.06)" }}>
              {qrDataUrl ? <img src={qrDataUrl} alt="QR" style={{ width:220, height:220 }} /> : <span style={{ fontSize:13, color:"#9CA3AF" }}>생성 중...</span>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:18, padding:"9px 12px", background:"#F8F9FF", borderRadius:10 }}>
              <span style={{ flex:1, fontSize:12, color:"#6B7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"left" }}>{boardUrl}</span>
              <button onClick={copyQrUrl} style={{ flex:"0 0 auto", padding:"5px 10px", borderRadius:8, border:"none", background:qrCopied?"#10B981":"#E5E7EB", color:qrCopied?"white":"#374151", fontSize:12, fontWeight:700, cursor:"pointer" }}>{qrCopied ? "복사됨" : "복사"}</button>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button onClick={() => setShowQr(false)} style={{ flex:1, padding:"12px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>닫기</button>
              <button onClick={downloadQr} disabled={!qrDataUrl} style={{ flex:2, padding:"12px", background:qrDataUrl?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:qrDataUrl?"white":"#9CA3AF", cursor:qrDataUrl?"pointer":"default" }}>⬇ PNG 저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 게시물 QR 크게 보기 */}
      {showPostQrBig && maximizedPost && (
        <div onClick={() => setShowPostQrBig(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:24, padding:"34px", width:"100%", maxWidth:380, textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize:20, fontWeight:800, color:"#111827", marginBottom:4 }}>📱 게시물 QR 코드</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:22, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{maximizedPost.title || "게시물"}</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:248, height:248, margin:"0 auto", background:"white", borderRadius:16, border:"1.5px solid #EEF0F4", boxShadow:"0 4px 16px rgba(0,0,0,0.06)" }}>
              {postQrDataUrl ? <img src={postQrDataUrl} alt="QR" style={{ width:220, height:220 }} /> : <span style={{ fontSize:13, color:"#9CA3AF" }}>생성 중...</span>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:18, padding:"9px 12px", background:"#F8F9FF", borderRadius:10 }}>
              <span style={{ flex:1, fontSize:12, color:"#6B7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"left" }}>{postUrl}</span>
              <button onClick={copyPostQrUrl} style={{ flex:"0 0 auto", padding:"5px 10px", borderRadius:8, border:"none", background:postQrCopied?"#10B981":"#E5E7EB", color:postQrCopied?"white":"#374151", fontSize:12, fontWeight:700, cursor:"pointer" }}>{postQrCopied ? "복사됨" : "복사"}</button>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button onClick={() => setShowPostQrBig(false)} style={{ flex:1, padding:"12px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>닫기</button>
              <button onClick={downloadPostQr} disabled={!postQrDataUrl} style={{ flex:2, padding:"12px", background:postQrDataUrl?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:postQrDataUrl?"white":"#9CA3AF", cursor:postQrDataUrl?"pointer":"default" }}>⬇ PNG 저장</button>
            </div>
          </div>
        </div>
      )}

      {editPost && (
        <div onClick={() => setEditPost(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
            style={{ background:"white", borderRadius:24, padding:"36px 32px", width:"100%", maxWidth:460, boxShadow:"0 24px 80px rgba(0,0,0,0.18)", animation:"fadeUp 0.25s ease both" }}
          >
            <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:20 }}>✏️ 게시물 수정</div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>제목 (선택)</label>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={60} placeholder="제목 — 입력하면 크게 표시돼요"
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:15, fontWeight:700, fontFamily:"inherit", outline:"none" }} />
            </div>

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
                <AttachSwap
                  currentName={editPost.audioName || "오디오"}
                  pending={editSwapFile}
                  accept="audio/*"
                  onPick={f => { setEditSwapFile(f); if (!editField) setEditField(f.name.replace(/\.[^/.]+$/, "")); }}
                  onClear={() => setEditSwapFile(null)}
                />
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
                <AttachSwap
                  currentName={editPost.pptName || "프레젠테이션"}
                  pending={editSwapFile}
                  accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  onPick={f => { setEditSwapFile(f); if (!editField) setEditField(f.name); }}
                  onClear={() => setEditSwapFile(null)}
                />
              </div>
            )}
            {editPost.contentType === "pdf" && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>문서 제목</label>
                <input value={editField} onChange={e => setEditField(e.target.value)}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
                <AttachSwap
                  currentName={editPost.pdfName || "PDF 문서"}
                  pending={editSwapFile}
                  accept=".pdf,application/pdf"
                  onPick={f => { setEditSwapFile(f); if (!editField) setEditField(f.name); }}
                  onClear={() => setEditSwapFile(null)}
                />
              </div>
            )}
            {editPost.contentType === "file" && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>첨부 제목</label>
                <input value={editField} onChange={e => setEditField(e.target.value)}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
                <div style={{ marginTop:12 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>
                    첨부파일 {editFiles.length + editNewFiles.length}개
                  </label>
                  <input ref={editFileRef} type="file" multiple style={{ display:"none" }}
                    onChange={e => {
                      const picked = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (!picked.length) return;
                      const tooBig = picked.filter(f => f.size > MAX_ATTACH_BYTES);
                      if (tooBig.length) {
                        alert(`다음 파일은 ${fmtBytes(MAX_ATTACH_BYTES)}를 넘어 제외됩니다:\n` +
                          tooBig.map(f => `· ${f.name} (${fmtBytes(f.size)})`).join("\n"));
                      }
                      const merged = [...editNewFiles];
                      for (const f of picked.filter(f => f.size <= MAX_ATTACH_BYTES)) {
                        if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
                      }
                      const room = Math.max(0, MAX_ATTACH_COUNT - editFiles.length);
                      if (merged.length > room) alert(`첨부는 게시물당 최대 ${MAX_ATTACH_COUNT}개까지예요.`);
                      setEditNewFiles(merged.slice(0, room));
                    }} />

                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {editFiles.map((f, i) => (
                      <div key={f.url} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", background:"#F9FAFB", borderRadius:10, border:"1.5px solid #E5E7EB" }}>
                        <span style={{ fontSize:18 }}>{fileIcon(f.name)}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                          <div style={{ fontSize:11, color:"#9CA3AF" }}>{fmtBytes(f.size)}</div>
                        </div>
                        <button onClick={() => setEditFiles(prev => prev.filter((_, idx) => idx !== i))}
                          title="이 첨부 삭제"
                          style={{ background:"none", border:"none", cursor:"pointer", color:"#EF4444", fontSize:16, fontWeight:700 }}>×</button>
                      </div>
                    ))}
                    {editNewFiles.map((f, i) => (
                      <div key={`${f.name}-${f.size}-${i}`} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", background:"#F0FDFA", borderRadius:10, border:"1.5px solid #99F6E4" }}>
                        <span style={{ fontSize:18 }}>{fileIcon(f.name)}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#0F766E", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                          <div style={{ fontSize:11, color:"#14B8A6" }}>새로 추가 · {fmtBytes(f.size)}</div>
                        </div>
                        <button onClick={() => setEditNewFiles(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:16 }}>×</button>
                      </div>
                    ))}
                  </div>

                  {editFiles.length + editNewFiles.length === 0 && (
                    <div style={{ fontSize:12, color:"#DC2626", padding:"10px 0" }}>
                      첨부가 모두 삭제됐어요. 저장하려면 파일을 1개 이상 추가해주세요.
                    </div>
                  )}

                  {editFiles.length + editNewFiles.length < MAX_ATTACH_COUNT && (
                    <button onClick={() => editFileRef.current?.click()}
                      style={{ width:"100%", marginTop:8, padding:"9px 0", background:"white", border:"1.5px dashed #99F6E4", borderRadius:10, fontSize:12, fontWeight:700, color:"#0F766E", cursor:"pointer" }}>
                      + 파일 추가
                    </button>
                  )}
                  <div style={{ fontSize:11, color:"#9CA3AF", marginTop:6 }}>
                    삭제한 첨부는 저장할 때 실제 파일까지 함께 지워집니다.
                  </div>
                </div>
              </div>
            )}
            {editPost.contentType === "image" && editPost.imageUrl && (
              <div style={{ marginBottom:16 }}>
                <img src={editPost.imageUrl} alt="" style={{ width:"100%", borderRadius:12, maxHeight:160, objectFit:"cover" }} />
                <AttachSwap
                  currentName="현재 이미지"
                  pending={editSwapFile}
                  accept="image/*"
                  onPick={f => setEditSwapFile(f)}
                  onClear={() => setEditSwapFile(null)}
                />
              </div>
            )}

            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>🎨 카드 배경색</label>
              <ColorPalette value={editColor} onChange={setEditColor} />
            </div>

            {editSaving && editUploadPct > 0 && editUploadPct < 100 && (
              <div style={{ height:5, background:"#F1F5F9", borderRadius:99, overflow:"hidden", marginBottom:12 }}>
                <div style={{ height:"100%", width:`${editUploadPct}%`, background:`linear-gradient(90deg,${P},${PINK})`, transition:"width 0.3s" }} />
              </div>
            )}

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setEditPost(null)} disabled={editSaving} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:editSaving?"default":"pointer" }}>취소</button>
              <button onClick={handleEditSave} disabled={editSaving}
                style={{ flex:2, padding:"13px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:"white", cursor:editSaving?"default":"pointer", boxShadow:`0 4px 16px rgba(124,58,237,0.3)`, opacity:editSaving?0.7:1 }}
              >
                {editSaving ? (editUploadPct > 0 ? `업로드 ${editUploadPct}%` : "저장 중...") : "✏️ 수정 완료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
