"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  subscribeToFeedPosts,
  createFeedPost,
  deleteFeedPost,
  likeFeedPost,
  incrementFeedViews,
  type CloudFeedPost,
  type FeedCategory,
} from "@/lib/firestoreHelpers";
import { uploadBoardFile, uploadImageDataUrl } from "@/lib/firebaseStorage";

const P = "#7C3AED";
const PINK = "#EC4899";

const CATEGORIES: { key: FeedCategory | "all"; label: string; icon: string }[] = [
  { key: "all",   label: "전체",  icon: "🌐" },
  { key: "music", label: "음악",  icon: "🎵" },
  { key: "video", label: "영상",  icon: "🎬" },
  { key: "image", label: "이미지",icon: "🖼️" },
  { key: "web",   label: "웹/앱", icon: "💻" },
];

const CAT_COLORS: Record<string, string> = {
  music: "#7C3AED",
  video: "#EF4444",
  image: "#F59E0B",
  web:   "#10B981",
};

const CAT_BG: Record<string, string> = {
  music: "linear-gradient(135deg,#7C3AED,#A855F7)",
  video: "linear-gradient(135deg,#EF4444,#F97316)",
  image: "linear-gradient(135deg,#F59E0B,#FCD34D)",
  web:   "linear-gradient(135deg,#10B981,#34D399)",
};

function getYoutubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000)  return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function getThumbnail(post: CloudFeedPost): string | null {
  if (post.thumbnailUrl) return post.thumbnailUrl;
  if (post.category === "image" && post.imageUrl) return post.imageUrl;
  if (post.category === "video" && post.youtubeUrl) {
    const id = getYoutubeId(post.youtubeUrl);
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  }
  return null;
}

// ── Feed Card ──────────────────────────────────────────────────────────────────
function FeedCard({ post, onOpen, onLike, likedIds }: {
  post: CloudFeedPost;
  onOpen: (post: CloudFeedPost) => void;
  onLike: (postId: string) => void;
  likedIds: Set<string>;
}) {
  const thumb = getThumbnail(post);
  const catColor = CAT_COLORS[post.category] ?? P;
  const catLabel = CATEGORIES.find(c => c.key === post.category);
  const liked = likedIds.has(post.id);

  return (
    <div
      onClick={() => onOpen(post)}
      style={{ background:"white", borderRadius:16, overflow:"hidden", cursor:"pointer", boxShadow:"0 2px 10px rgba(0,0,0,0.07)", transition:"transform 0.2s,box-shadow 0.2s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform="translateY(-4px)"; (e.currentTarget as HTMLDivElement).style.boxShadow="0 12px 32px rgba(0,0,0,0.13)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform=""; (e.currentTarget as HTMLDivElement).style.boxShadow="0 2px 10px rgba(0,0,0,0.07)"; }}
    >
      {/* Thumbnail */}
      <div style={{ position:"relative", paddingTop:"56.25%", background:thumb ? "#000" : CAT_BG[post.category] ?? "#E5E7EB", overflow:"hidden" }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
        ) : (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:40 }}>
            {catLabel?.icon}
          </div>
        )}
        {/* Category badge */}
        <div style={{ position:"absolute", top:8, right:8, background:`${catColor}cc`, backdropFilter:"blur(4px)", padding:"3px 10px", borderRadius:100, fontSize:11, fontWeight:700, color:"white" }}>
          {catLabel?.icon} {catLabel?.label}
        </div>
        {/* Play icon for video/music */}
        {(post.category === "video" || post.category === "music") && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ width:44, height:44, borderRadius:"50%", background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(2px)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding:"12px 14px 10px" }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#111827", lineHeight:1.4, marginBottom:6, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
          {post.title}
        </div>
        {post.description && (
          <div style={{ fontSize:12, color:"#6B7280", lineHeight:1.5, marginBottom:8, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
            {post.description}
          </div>
        )}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            {post.authorPhoto
              ? <img src={post.authorPhoto} alt="" style={{ width:20, height:20, borderRadius:"50%", objectFit:"cover" }} />
              : <div style={{ width:20, height:20, borderRadius:"50%", background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"white", fontWeight:800 }}>{post.authorName[0]}</div>
            }
            <span style={{ fontSize:12, color:"#6B7280", fontWeight:500 }}>{post.authorName}</span>
            <span style={{ fontSize:11, color:"#D1D5DB" }}>·</span>
            <span style={{ fontSize:11, color:"#9CA3AF" }}>{fmtDate(post.createdAt)}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button
              onClick={e => { e.stopPropagation(); onLike(post.id); }}
              style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:3, fontSize:12, color:liked?"#EF4444":"#9CA3AF", padding:0, fontWeight:liked?700:400 }}
            >
              {liked ? "❤️" : "🤍"} {post.likes}
            </button>
            <span style={{ fontSize:12, color:"#9CA3AF", display:"flex", alignItems:"center", gap:3 }}>
              👁 {post.views}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Post Detail Modal ──────────────────────────────────────────────────────────
function PostModal({ post, onClose, onLike, liked, isOwner, onDelete }: {
  post: CloudFeedPost;
  onClose: () => void;
  onLike: () => void;
  liked: boolean;
  isOwner: boolean;
  onDelete: () => void;
}) {
  const [showPlayer, setShowPlayer] = useState(false);
  const catLabel = CATEGORIES.find(c => c.key === post.category);
  const thumb = getThumbnail(post);

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
        style={{ background:"white", borderRadius:24, width:"100%", maxWidth:680, maxHeight:"90vh", overflow:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.3)" }}>

        {/* Media */}
        {post.category === "video" && post.youtubeUrl && (
          <div style={{ position:"relative", paddingTop:"56.25%", background:"#000", borderRadius:"24px 24px 0 0", overflow:"hidden" }}>
            {!showPlayer ? (
              <div onClick={() => setShowPlayer(true)} style={{ position:"absolute", inset:0, cursor:"pointer" }}>
                {thumb && <img src={thumb} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />}
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.3)" }}>
                  <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,0,0,0.9)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
              </div>
            ) : (
              <iframe src={`https://www.youtube.com/embed/${getYoutubeId(post.youtubeUrl)}?autoplay=1`}
                style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }} allowFullScreen allow="autoplay" />
            )}
          </div>
        )}
        {post.category === "image" && post.imageUrl && (
          <img src={post.imageUrl} alt="" style={{ width:"100%", borderRadius:"24px 24px 0 0", display:"block", maxHeight:400, objectFit:"contain", background:"#F9FAFB" }} />
        )}
        {post.category === "music" && post.audioUrl && (
          <div style={{ background:CAT_BG.music, padding:"48px 40px", borderRadius:"24px 24px 0 0", textAlign:"center" }}>
            <div style={{ fontSize:64, marginBottom:16 }}>🎵</div>
            <audio controls src={post.audioUrl} style={{ width:"100%", maxWidth:360 }} />
          </div>
        )}
        {post.category === "web" && post.webUrl && (
          <div style={{ background:CAT_BG.web, padding:"40px", borderRadius:"24px 24px 0 0", textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>💻</div>
            <a href={post.webUrl} target="_blank" rel="noreferrer"
              style={{ display:"inline-block", padding:"12px 28px", background:"white", borderRadius:12, fontSize:14, fontWeight:700, color:"#10B981", textDecoration:"none", boxShadow:"0 4px 16px rgba(0,0,0,0.15)" }}>
              🔗 {post.webUrl.slice(0,50)}{post.webUrl.length>50?"...":""}
            </a>
          </div>
        )}

        {/* Info */}
        <div style={{ padding:"24px 28px" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"3px 10px", background:`${CAT_COLORS[post.category]}18`, borderRadius:100, fontSize:11, fontWeight:700, color:CAT_COLORS[post.category], marginBottom:8 }}>
                {catLabel?.icon} {catLabel?.label}
              </div>
              <div style={{ fontSize:20, fontWeight:800, color:"#111827", lineHeight:1.3 }}>{post.title}</div>
            </div>
            {isOwner && (
              <button onClick={onDelete} style={{ flexShrink:0, padding:"6px 14px", background:"#FEF2F2", border:"1.5px solid #FECACA", borderRadius:8, fontSize:12, fontWeight:600, color:"#DC2626", cursor:"pointer" }}>
                🗑 삭제
              </button>
            )}
          </div>

          {post.description && (
            <p style={{ fontSize:14, color:"#6B7280", lineHeight:1.7, marginBottom:16 }}>{post.description}</p>
          )}

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:16, borderTop:"1px solid #F3F4F6" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {post.authorPhoto && <img src={post.authorPhoto} alt="" style={{ width:32, height:32, borderRadius:"50%" }} />}
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#1F2937" }}>{post.authorName}</div>
                <div style={{ fontSize:11, color:"#9CA3AF" }}>{fmtDate(post.createdAt)}</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <span style={{ fontSize:13, color:"#9CA3AF" }}>👁 {post.views}</span>
              <button onClick={onLike} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px", background:liked?"#FEF2F2":"#F3F4F6", border:"none", borderRadius:10, fontSize:14, fontWeight:700, color:liked?"#EF4444":"#6B7280", cursor:"pointer" }}>
                {liked ? "❤️" : "🤍"} {post.likes}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upload Modal ───────────────────────────────────────────────────────────────
function UploadModal({ user, onClose, onSubmit }: {
  user: { uid: string; displayName: string | null; photoURL: string | null };
  onClose: () => void;
  onSubmit: (post: CloudFeedPost) => Promise<void>;
}) {
  const [category, setCategory] = useState<FeedCategory>("image");
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [ytUrl, setYtUrl]       = useState("");
  const [webUrl, setWebUrl]     = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const imgRef   = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  const handleImageFile = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const canSubmit = title.trim() && (
    (category === "image" && imageFile) ||
    (category === "music" && audioFile) ||
    (category === "video" && ytUrl.trim()) ||
    (category === "web"   && webUrl.trim())
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setUploading(true);
    setUploadPct(0);
    try {
      let imageUrl, audioUrl;
      const postId = crypto.randomUUID();

      if (category === "image" && imageFile) {
        if (imagePreview.startsWith("data:")) {
          const { url } = await uploadImageDataUrl(user.uid, `feed/${postId}`, `img_${Date.now()}.png`, imagePreview);
          imageUrl = url;
        }
      }
      if (category === "music" && audioFile) {
        const { url } = await uploadBoardFile(postId, "music", audioFile, setUploadPct);
        audioUrl = url;
      }

      const post: CloudFeedPost = {
        id: postId,
        uid: user.uid,
        authorName: user.displayName ?? "익명",
        authorPhoto: user.photoURL ?? "",
        category,
        title: title.trim(),
        ...(desc.trim() && { description: desc.trim() }),
        ...(imageUrl && { imageUrl }),
        ...(audioUrl && { audioUrl }),
        ...(ytUrl.trim() && { youtubeUrl: ytUrl.trim() }),
        ...(webUrl.trim() && { webUrl: webUrl.trim() }),
        likes: 0,
        views: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await onSubmit(post);
      onClose();
    } catch (e) {
      console.error(e);
      alert("업로드 중 오류가 발생했습니다.");
    }
    setUploading(false);
    setUploadPct(0);
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
        style={{ background:"white", borderRadius:24, padding:"36px 32px", width:"100%", maxWidth:480, maxHeight:"90vh", overflow:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.18)" }}>
        <div style={{ fontSize:20, fontWeight:800, color:"#111827", marginBottom:6 }}>📤 피드에 올리기</div>
        <div style={{ fontSize:13, color:"#6B7280", marginBottom:24 }}>내 작업물을 피드에 공유해보세요</div>

        {/* Category */}
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {CATEGORIES.filter(c => c.key !== "all").map(c => (
            <button key={c.key} onClick={() => setCategory(c.key as FeedCategory)}
              style={{ flex:1, padding:"10px 0", borderRadius:12, border:`2px solid ${category===c.key?CAT_COLORS[c.key]:"#E5E7EB"}`, background:category===c.key?`${CAT_COLORS[c.key]}0f`:"white", fontSize:11, fontWeight:700, color:category===c.key?CAT_COLORS[c.key]:"#6B7280", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:18 }}>{c.icon}</span>{c.label}
            </button>
          ))}
        </div>

        {/* Title */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>제목 *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="작업물 제목을 입력하세요"
            style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
        </div>

        {/* Content by category */}
        {category === "image" && (
          <div style={{ marginBottom:14 }}>
            <input ref={imgRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { if(e.target.files?.[0]) handleImageFile(e.target.files[0]); }} />
            {imagePreview ? (
              <div style={{ position:"relative" }}>
                <img src={imagePreview} alt="" style={{ width:"100%", borderRadius:12, maxHeight:200, objectFit:"cover" }} />
                <button onClick={() => { setImageFile(null); setImagePreview(""); }} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.6)", border:"none", borderRadius:"50%", width:28, height:28, color:"white", cursor:"pointer", fontSize:14 }}>×</button>
              </div>
            ) : (
              <div onClick={() => imgRef.current?.click()} style={{ border:"2px dashed #E5E7EB", borderRadius:12, padding:"40px", textAlign:"center", cursor:"pointer", color:"#9CA3AF" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>🖼️</div>
                <div style={{ fontSize:13 }}>이미지 선택 (JPG, PNG, GIF)</div>
              </div>
            )}
          </div>
        )}

        {category === "music" && (
          <div style={{ marginBottom:14 }}>
            <input ref={audioRef} type="file" accept="audio/*" style={{ display:"none" }} onChange={e => { if(e.target.files?.[0]) setAudioFile(e.target.files[0]); }} />
            {audioFile ? (
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"#F0FDF4", borderRadius:10, border:"1.5px solid #86EFAC" }}>
                <span style={{ fontSize:20 }}>🎵</span>
                <span style={{ fontSize:13, fontWeight:600, color:"#15803D", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{audioFile.name}</span>
                <button onClick={() => setAudioFile(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", fontSize:16 }}>×</button>
              </div>
            ) : (
              <div onClick={() => audioRef.current?.click()} style={{ border:"2px dashed #E5E7EB", borderRadius:12, padding:"32px", textAlign:"center", cursor:"pointer", color:"#9CA3AF" }}>
                <div style={{ fontSize:28, marginBottom:6 }}>🎵</div>
                <div style={{ fontSize:13 }}>MP3 파일 선택</div>
              </div>
            )}
          </div>
        )}

        {category === "video" && (
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>YouTube URL *</label>
            <input value={ytUrl} onChange={e => setYtUrl(e.target.value)} placeholder="https://youtu.be/..."
              style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
          </div>
        )}

        {category === "web" && (
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>웹/앱 URL *</label>
            <input value={webUrl} onChange={e => setWebUrl(e.target.value)} placeholder="https://..."
              style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
          </div>
        )}

        {/* Description */}
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>설명 (선택)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="작업물에 대해 소개해주세요..."
            style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", resize:"none", outline:"none" }} />
        </div>

        {uploading && uploadPct > 0 && (
          <div style={{ background:"#EDE9FE", borderRadius:8, height:5, overflow:"hidden", marginBottom:16 }}>
            <div style={{ height:"100%", width:`${uploadPct}%`, background:`linear-gradient(90deg,${P},${PINK})`, transition:"width 0.3s" }} />
          </div>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
          <button onClick={handleSubmit} disabled={!canSubmit || uploading}
            style={{ flex:2, padding:"13px", background:canSubmit&&!uploading?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:canSubmit&&!uploading?"white":"#9CA3AF", cursor:canSubmit&&!uploading?"pointer":"default", boxShadow:canSubmit&&!uploading?`0 4px 16px rgba(124,58,237,0.3)`:"none" }}>
            {uploading ? (uploadPct > 0 ? `업로드 ${uploadPct}%` : "처리 중...") : "📤 피드에 올리기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Feed Component ────────────────────────────────────────────────────────
export default function Feed() {
  const { user, signIn } = useAuth();
  const [posts, setPosts]         = useState<CloudFeedPost[]>([]);
  const [catFilter, setCatFilter] = useState<FeedCategory | "all">("all");
  const [sort, setSort]           = useState<"latest" | "likes" | "views">("latest");
  const [showUpload, setShowUpload] = useState(false);
  const [openPost, setOpenPost]   = useState<CloudFeedPost | null>(null);
  const [likedIds, setLikedIds]   = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = subscribeToFeedPosts(setPosts);
    return unsub;
  }, []);

  // Load liked IDs from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("feed_liked") ?? "[]");
      setLikedIds(new Set(stored));
    } catch { /* */ }
  }, []);

  const filtered = posts
    .filter(p => catFilter === "all" || p.category === catFilter)
    .sort((a, b) => {
      if (sort === "likes")  return b.likes  - a.likes;
      if (sort === "views")  return b.views  - a.views;
      return b.createdAt - a.createdAt;
    });

  const handleOpen = async (post: CloudFeedPost) => {
    setOpenPost(post);
    await incrementFeedViews(post.id);
  };

  const handleLike = async (postId: string) => {
    const liked = likedIds.has(postId);
    const next  = new Set(likedIds);
    if (liked) { next.delete(postId); await likeFeedPost(postId, -1); }
    else       { next.add(postId);    await likeFeedPost(postId,  1); }
    setLikedIds(next);
    localStorage.setItem("feed_liked", JSON.stringify([...next]));
    // update open post likes optimistically
    if (openPost?.id === postId) {
      setOpenPost(prev => prev ? { ...prev, likes: prev.likes + (liked ? -1 : 1) } : null);
    }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + (liked?-1:1) } : p));
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("게시물을 삭제할까요?")) return;
    await deleteFeedPost(postId);
    setOpenPost(null);
  };

  const SORT_LABELS = { latest:"최신순", likes:"인기순", views:"조회수순" };

  return (
    <div style={{ minHeight:"100vh", background:"#F4F6FA", fontFamily:"'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @media(max-width:640px) { .feed-grid { grid-template-columns:repeat(2,1fr)!important; } }
        @media(max-width:900px) { .feed-grid { grid-template-columns:repeat(3,1fr)!important; } }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 32px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none" }}>
            <div style={{ width:32, height:32, borderRadius:9, background:`linear-gradient(135deg,${P},${PINK})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"white", fontWeight:800 }}>✦</div>
            <span style={{ fontSize:14, fontWeight:800, color:"#111827" }}>AI Studio</span>
          </Link>
          <div style={{ width:1, height:20, background:"#E5E7EB" }} />
          <span style={{ fontSize:14, fontWeight:700, color:P }}>🌐 피드</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {user ? (
            <button onClick={() => setShowUpload(true)}
              style={{ padding:"8px 20px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer", boxShadow:`0 4px 12px rgba(124,58,237,0.3)` }}>
              + 올리기
            </button>
          ) : (
            <button onClick={signIn} style={{ padding:"8px 20px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>
              로그인
            </button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"32px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom:28, animation:"fadeUp 0.4s ease both" }}>
          <h1 style={{ fontSize:28, fontWeight:800, color:"#0F172A", letterSpacing:-0.5, marginBottom:4 }}>🌐 크리에이터 피드</h1>
          <p style={{ fontSize:14, color:"#6B7280" }}>AI Studio에서 만든 결과물을 공유하세요</p>
        </div>

        {/* Filters */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24, flexWrap:"wrap", gap:12 }}>
          {/* Category chips */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setCatFilter(c.key as FeedCategory | "all")}
                style={{ padding:"7px 16px", borderRadius:100, border:`1.5px solid ${catFilter===c.key?P:"#E5E7EB"}`, background:catFilter===c.key?`rgba(124,58,237,0.07)`:"white", fontSize:13, fontWeight:600, color:catFilter===c.key?P:"#6B7280", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                {c.icon} {c.label}
                {c.key !== "all" && <span style={{ fontSize:11, opacity:0.6 }}>{posts.filter(p=>p.category===c.key).length}</span>}
              </button>
            ))}
          </div>
          {/* Sort + count */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:13, color:"#9CA3AF" }}>{filtered.length}개</span>
            <div style={{ display:"flex", background:"white", border:"1.5px solid #E5E7EB", borderRadius:10, overflow:"hidden" }}>
              {(["latest","likes","views"] as const).map(s => (
                <button key={s} onClick={() => setSort(s)}
                  style={{ padding:"7px 14px", border:"none", background:sort===s?`rgba(124,58,237,0.07)`:"white", fontSize:12, fontWeight:600, color:sort===s?P:"#6B7280", cursor:"pointer", borderRight:"1px solid #E5E7EB" }}>
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"80px 0", color:"#9CA3AF" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🌐</div>
            <div style={{ fontSize:16, fontWeight:600 }}>아직 게시물이 없어요</div>
            {user && <div style={{ fontSize:13, marginTop:8 }}>첫 번째 결과물을 공유해보세요!</div>}
          </div>
        ) : (
          <div className="feed-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:18 }}>
            {filtered.map((post, i) => (
              <div key={post.id} style={{ animation:`fadeUp 0.4s ease ${i*0.04}s both` }}>
                <FeedCard post={post} onOpen={handleOpen} onLike={handleLike} likedIds={likedIds} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && user && (
        <UploadModal
          user={{ uid:user.uid, displayName:user.displayName, photoURL:user.photoURL }}
          onClose={() => setShowUpload(false)}
          onSubmit={createFeedPost}
        />
      )}

      {/* Post detail modal */}
      {openPost && (
        <PostModal
          post={openPost}
          onClose={() => setOpenPost(null)}
          onLike={() => handleLike(openPost.id)}
          liked={likedIds.has(openPost.id)}
          isOwner={user?.uid === openPost.uid}
          onDelete={() => handleDelete(openPost.id)}
        />
      )}
    </div>
  );
}
