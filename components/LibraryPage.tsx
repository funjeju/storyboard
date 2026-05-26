"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  subscribeToSunoTracks,
  subscribeToDetailProjects,
  subscribeToStoryboards,
  deleteSunoTrack,
  deleteDetailProject,
  deleteStoryboard,
  upsertSunoTrack,
  type CloudSunoTrack,
  type CloudDetailProject,
  type CloudStoryboard,
} from "@/lib/firestoreHelpers";
import { uploadAudio, deleteStorageFile } from "@/lib/firebaseStorage";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalTrack {
  id: string;
  title: string;
  stylePrompt: string;
  lyrics: string | null;
  genre: string;
  mood: string;
  vocal: string;
  topic: string;
  createdAt: number;
  audioDataKey: string | null;
}

interface LocalDetailProject {
  id: string;
  name: string;
  updatedAt: number;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = "ai_studio_library";
const STORE = "audio_blobs";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
  });
}
async function putAudio(key: string, blob: Blob) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function getAudio(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result || null); req.onerror = () => rej(req.error);
  });
}
async function delAudio(key: string) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const TRACKS_KEY   = "suno_library_v1";
const PROJECTS_KEY = "dpm_projects_v1";

function loadLocalTracks(): LocalTrack[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TRACKS_KEY) || "[]"); } catch { return []; }
}
function saveLocalTracks(t: LocalTrack[]) {
  localStorage.setItem(TRACKS_KEY, JSON.stringify(t));
}
function loadLocalProjects(): LocalDetailProject[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]"); } catch { return []; }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "in-progress" | "completed" }) {
  const isProgress = status === "in-progress";
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 100,
      background: isProgress ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)",
      color: isProgress ? "#D97706" : "#059669",
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    }}>
      {isProgress ? "⏸ 작업중" : "✓ 완료"}
    </span>
  );
}

function Chip({ label, color, textColor }: { label: string; color: string; textColor: string }) {
  return (
    <span style={{
      display: "inline-flex", padding: "2px 8px", borderRadius: 100,
      background: color, color: textColor, fontSize: 10, fontWeight: 700,
    }}>{label}</span>
  );
}

// ─── Cloud sync notice ─────────────────────────────────────────────────────────

function CloudNotice({ synced, uploading }: { synced: boolean; uploading: boolean }) {
  if (uploading) return (
    <span style={{ fontSize: 10, color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6B7280", animation: "pulse 1s infinite" }} />
      동기화 중...
    </span>
  );
  if (synced) return (
    <span style={{ fontSize: 10, color: "#059669", display: "flex", alignItems: "center", gap: 4 }}>
      ☁️ 클라우드 동기화됨
    </span>
  );
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "music" | "detail" | "storyboard";

export default function LibraryPage() {
  const { user, signIn } = useAuth();

  // local state
  const [localTracks,   setLocalTracks]   = useState<LocalTrack[]>([]);
  const [localProjects, setLocalProjects] = useState<LocalDetailProject[]>([]);

  // cloud state
  const [cloudTracks,   setCloudTracks]   = useState<CloudSunoTrack[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudDetailProject[]>([]);
  const [cloudSBs,      setCloudSBs]      = useState<CloudStoryboard[]>([]);

  // audio blob URLs
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  // UI state
  const [tab,    setTab]    = useState<Tab>("music");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with-audio" | "no-audio">("all");

  // ── Load local data ──
  useEffect(() => {
    setLocalTracks(loadLocalTracks());
    setLocalProjects(loadLocalProjects());
  }, []);

  // ── Subscribe to Firestore when logged in ──
  useEffect(() => {
    if (!user) {
      setCloudTracks([]); setCloudProjects([]); setCloudSBs([]);
      return;
    }
    const unsub1 = subscribeToSunoTracks(user.uid,   setCloudTracks);
    const unsub2 = subscribeToDetailProjects(user.uid, setCloudProjects);
    const unsub3 = subscribeToStoryboards(user.uid,  setCloudSBs);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [user]);

  // ── Resolve audio blobs from IndexedDB ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const t of localTracks) {
        if (t.audioDataKey && !audioUrls[t.id]) {
          const blob = await getAudio(t.audioDataKey).catch(() => null);
          if (blob && !cancelled) urls[t.id] = URL.createObjectURL(blob);
        }
      }
      if (!cancelled && Object.keys(urls).length > 0) setAudioUrls(prev => ({ ...prev, ...urls }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTracks]);

  // ── Merge: cloud tracks override local tracks with same id ──
  const mergedTracks: (LocalTrack & { cloudSynced?: boolean; audioUrl?: string })[] = (() => {
    if (!user) return localTracks.map(t => ({ ...t }));
    const cloudMap = new Map(cloudTracks.map(c => [c.id, c]));
    // include cloud tracks not in local
    const localIds = new Set(localTracks.map(t => t.id));
    const extra = cloudTracks
      .filter(c => !localIds.has(c.id))
      .map(c => ({
        id: c.id, title: c.title, stylePrompt: c.stylePrompt,
        lyrics: c.lyrics, genre: c.genre, mood: c.mood, vocal: c.vocal,
        topic: c.topic, createdAt: c.createdAt, audioDataKey: null,
        cloudSynced: true, audioUrl: c.audioUrl || undefined,
      }));
    return [
      ...localTracks.map(t => ({
        ...t,
        cloudSynced: cloudMap.has(t.id),
        audioUrl: cloudMap.get(t.id)?.audioUrl || undefined,
      })),
      ...extra,
    ];
  })();

  const filteredTracks = mergedTracks.filter(t => {
    const hasAudio = !!(audioUrls[t.id] || t.audioUrl);
    if (filter === "with-audio" && !hasAudio) return false;
    if (filter === "no-audio"   &&  hasAudio) return false;
    if (search) {
      const q = search.toLowerCase();
      return [t.title, t.genre, t.mood, t.topic].some(s => s?.toLowerCase().includes(q));
    }
    return true;
  });

  // ── Audio upload ──
  const handleAudioUpload = async (trackId: string, file: File) => {
    const track = mergedTracks.find(t => t.id === trackId);
    if (!track) return;

    // save to IndexedDB locally
    const key = `audio-${trackId}-${Date.now()}`;
    await putAudio(key, file);
    const updated = localTracks.map(t => t.id === trackId ? { ...t, audioDataKey: key } : t);
    setLocalTracks(updated);
    saveLocalTracks(updated);
    const localUrl = URL.createObjectURL(file);
    setAudioUrls(prev => ({ ...prev, [trackId]: localUrl }));

    // upload to Firebase Storage if logged in
    if (user) {
      try {
        const { url, path } = await uploadAudio(user.uid, trackId, file);
        await upsertSunoTrack(user.uid, {
          id: trackId,
          title: track.title,
          stylePrompt: track.stylePrompt,
          lyrics: track.lyrics,
          genre: track.genre,
          mood: track.mood,
          vocal: track.vocal,
          topic: track.topic,
          createdAt: track.createdAt,
          updatedAt: Date.now(),
          status: "completed",
          audioStoragePath: path,
          audioUrl: url,
        });
      } catch (e) {
        console.error("Firebase Storage upload failed:", e);
      }
    }
  };

  // ── Delete track ──
  const handleDeleteTrack = async (trackId: string) => {
    if (!confirm("이 트랙을 삭제할까요?")) return;
    const track = localTracks.find(t => t.id === trackId);
    if (track?.audioDataKey) await delAudio(track.audioDataKey).catch(() => {});
    const updated = localTracks.filter(t => t.id !== trackId);
    setLocalTracks(updated);
    saveLocalTracks(updated);
    if (audioUrls[trackId]) { URL.revokeObjectURL(audioUrls[trackId]); setAudioUrls(prev => { const n = { ...prev }; delete n[trackId]; return n; }); }

    if (user) {
      const cloud = cloudTracks.find(c => c.id === trackId);
      if (cloud?.audioStoragePath) await deleteStorageFile(cloud.audioStoragePath).catch(() => {});
      await deleteSunoTrack(user.uid, trackId).catch(() => {});
    }
  };

  const handleDeleteAudio = async (trackId: string) => {
    const track = localTracks.find(t => t.id === trackId);
    if (!track?.audioDataKey) return;
    if (!confirm("음악 파일만 삭제할까요? (스타일/가사 유지)")) return;
    await delAudio(track.audioDataKey).catch(() => {});
    const updated = localTracks.map(t => t.id === trackId ? { ...t, audioDataKey: null } : t);
    setLocalTracks(updated); saveLocalTracks(updated);
    if (audioUrls[trackId]) { URL.revokeObjectURL(audioUrls[trackId]); setAudioUrls(prev => { const n = { ...prev }; delete n[trackId]; return n; }); }

    if (user) {
      const cloud = cloudTracks.find(c => c.id === trackId);
      if (cloud?.audioStoragePath) {
        await deleteStorageFile(cloud.audioStoragePath).catch(() => {});
        await upsertSunoTrack(user.uid, { ...cloud, audioStoragePath: null, audioUrl: null, updatedAt: Date.now() });
      }
    }
  };

  const NAV_TOOLS = [
    { href: "/storyboard", icon: "🎬", label: "Storyboard" },
    { href: "/suno",       icon: "🎵", label: "Suno Maker"  },
    { href: "/detail",     icon: "🛍️", label: "Detail Page" },
    { href: "/library",    icon: "📚", label: "My Library"  },
  ];

  const tabCounts = {
    music:     (user ? cloudTracks.length : 0) || localTracks.length,
    detail:    (user ? cloudProjects.length : 0) || localProjects.length,
    storyboard: user ? cloudSBs.length : 0,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FF", fontFamily: "'Noto Sans KR', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0;transform:translateY(16px) } to { opacity:1;transform:translateY(0) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        details summary { cursor: pointer; outline: none; user-select: none; }
        details[open] summary { margin-bottom: 8px; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 32px", height: 52, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 101,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "white",
            }}>✦</div>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>AI Studio</span>
          </Link>
          <div style={{ width: 1, height: 18, background: "#E5E7EB" }} />
          {NAV_TOOLS.map(tool => (
            <Link key={tool.href} href={tool.href} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, textDecoration: "none",
              background: tool.href === "/library" ? "#EFF6FF" : "transparent",
              border: tool.href === "/library" ? "1px solid #BFDBFE" : "1px solid transparent",
              fontSize: 12, fontWeight: 600,
              color: tool.href === "/library" ? "#2563EB" : "#6B7280",
            }}>
              <span style={{ fontSize: 13 }}>{tool.icon}</span> {tool.label}
            </Link>
          ))}
        </div>

        {/* Auth area */}
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%", background: "#10B981",
                boxShadow: "0 0 0 2px rgba(16,185,129,0.2)",
              }} />
              <span style={{ fontSize: 11, color: "#6B7280" }}>클라우드 동기화 중</span>
            </div>
            {user.photoURL && (
              <img src={user.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #E5E7EB" }} />
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              {user.displayName?.split(" ")[0] || user.email?.split("@")[0]}
            </span>
          </div>
        ) : (
          <button onClick={signIn} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 16px", borderRadius: 10,
            background: "white", border: "1px solid #E5E7EB",
            fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            구글 로그인
          </button>
        )}
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 6 }}>📚 My Library</h1>
            <p style={{ fontSize: 13, color: "#6B7280" }}>
              {user
                ? `${user.displayName || user.email}님의 작업물 — 클라우드에서 실시간 동기화됩니다`
                : "로그인하면 모든 기기에서 작업물을 동기화할 수 있습니다"}
            </p>
          </div>
          {!user && (
            <button onClick={signIn} style={{
              flexShrink: 0, padding: "10px 20px", borderRadius: 12,
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              color: "white", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
              boxShadow: "0 4px 14px rgba(124,58,237,0.35)",
            }}>
              🔐 로그인해서 저장하기
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #E5E7EB" }}>
          {([
            { id: "music"      as const, label: "🎵 음악 트랙" },
            { id: "detail"     as const, label: "🛍️ 상세페이지" },
            { id: "storyboard" as const, label: "🎬 스토리보드" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "12px 20px", border: "none", background: "transparent",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              color: tab === t.id ? "#2563EB" : "#6B7280",
              borderBottom: `3px solid ${tab === t.id ? "#2563EB" : "transparent"}`,
              marginBottom: -2,
            }}>
              {t.label}
              <span style={{ marginLeft: 6, fontSize: 11, color: "#9CA3AF" }}>({tabCounts[t.id]})</span>
            </button>
          ))}
        </div>

        {/* ── Music Tab ── */}
        {tab === "music" && (
          <>
            <div style={{
              background: "white", borderRadius: 14, padding: 14,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 16,
              display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
            }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔎 제목·장르·무드·테마로 검색"
                style={{ flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none" }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {([
                  { id: "all"        as const, label: "전체" },
                  { id: "with-audio" as const, label: "🎧 음악 있음" },
                  { id: "no-audio"   as const, label: "📝 텍스트만" },
                ] as const).map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)} style={{
                    padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: filter === f.id ? "#EFF6FF" : "transparent",
                    color: filter === f.id ? "#2563EB" : "#6B7280",
                    fontSize: 12, fontWeight: 700,
                  }}>{f.label}</button>
                ))}
              </div>
            </div>

            {filteredTracks.length === 0 ? (
              <EmptyState type="music" />
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {filteredTracks.map(track => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    audioUrl={audioUrls[track.id] || track.audioUrl || null}
                    cloudSynced={!!track.cloudSynced}
                    loggedIn={!!user}
                    onUploadAudio={f => handleAudioUpload(track.id, f)}
                    onDeleteAudio={() => handleDeleteAudio(track.id)}
                    onDeleteTrack={() => handleDeleteTrack(track.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Detail Projects Tab ── */}
        {tab === "detail" && (
          <>
            {user ? (
              cloudProjects.length === 0 ? (
                <EmptyState type="detail" />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                  {cloudProjects.map(p => (
                    <DetailProjectCard key={p.id} project={p} onDelete={() => deleteDetailProject(user.uid, p.id)} />
                  ))}
                </div>
              )
            ) : (
              <>
                {localProjects.length === 0 ? (
                  <EmptyState type="detail" />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                    {localProjects.map(p => (
                      <LocalDetailCard key={p.id} project={p} />
                    ))}
                  </div>
                )}
                <LoginBanner onLogin={signIn} />
              </>
            )}
          </>
        )}

        {/* ── Storyboard Tab ── */}
        {tab === "storyboard" && (
          <>
            {user ? (
              cloudSBs.length === 0 ? (
                <EmptyState type="storyboard" />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                  {cloudSBs.map(sb => (
                    <StoryboardCard key={sb.id} sb={sb} onDelete={() => deleteStoryboard(user.uid, sb.id)} />
                  ))}
                </div>
              )
            ) : (
              <>
                <EmptyState type="storyboard" />
                <LoginBanner onLogin={signIn} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({ type }: { type: "music" | "detail" | "storyboard" }) {
  const map = {
    music:      { icon: "🎵", text: "아직 생성된 트랙이 없습니다.", link: "/suno",       linkText: "Suno Maker에서 음악 만들기" },
    detail:     { icon: "🛍️", text: "상세페이지 프로젝트가 없습니다.", link: "/detail",  linkText: "Detail Page Maker 시작하기" },
    storyboard: { icon: "🎬", text: "스토리보드 프로젝트가 없습니다.", link: "/storyboard", linkText: "Storyboard Generator 시작하기" },
  };
  const m = map[type];
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: "60px 20px",
      textAlign: "center", color: "#9CA3AF", fontSize: 13,
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{m.icon}</div>
      <div style={{ marginBottom: 8 }}>{m.text}</div>
      <Link href={m.link} style={{ color: "#2563EB", fontWeight: 700, textDecoration: "none" }}>{m.linkText} →</Link>
    </div>
  );
}

function LoginBanner({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{
      marginTop: 16, background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(236,72,153,0.06))",
      border: "1.5px solid rgba(124,58,237,0.15)", borderRadius: 16,
      padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#374151", marginBottom: 4 }}>
          ☁️ 클라우드로 저장해서 어디서든 불러오세요
        </div>
        <div style={{ fontSize: 12, color: "#6B7280" }}>로그인하면 모든 기기에서 작업물을 동기화할 수 있고, 작업 중인 프로젝트를 이어서 진행할 수 있습니다.</div>
      </div>
      <button onClick={onLogin} style={{
        flexShrink: 0, padding: "10px 20px", borderRadius: 12,
        background: "linear-gradient(135deg, #7C3AED, #EC4899)",
        color: "white", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
        boxShadow: "0 4px 14px rgba(124,58,237,0.35)",
      }}>
        Google로 로그인
      </button>
    </div>
  );
}

// ─── Track Card ───────────────────────────────────────────────────────────────

function TrackCard({ track, audioUrl, cloudSynced, loggedIn, onUploadAudio, onDeleteAudio, onDeleteTrack }: {
  track: LocalTrack & { cloudSynced?: boolean; audioUrl?: string };
  audioUrl: string | null;
  cloudSynced: boolean;
  loggedIn: boolean;
  onUploadAudio: (f: File) => void;
  onDeleteAudio: () => void;
  onDeleteTrack: () => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 20,
      border: `1.5px solid ${audioUrl ? "#86EFAC" : "#E5E7EB"}`,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      animation: "fadeUp 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{track.title}</span>
            {cloudSynced && loggedIn && (
              <span style={{ fontSize: 10, color: "#059669" }}>☁️</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {track.genre && <Chip label={track.genre} color="#EDE9FE" textColor="#5B21B6" />}
            {track.mood  && <Chip label={track.mood}  color="#FCE7F3" textColor="#9F1239" />}
            {track.vocal && <Chip label={track.vocal} color="#DBEAFE" textColor="#1E40AF" />}
            {audioUrl    && <Chip label="🎧 음악 있음" color="#D1FAE5" textColor="#065F46" />}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
            {new Date(track.createdAt).toLocaleString("ko-KR")}
            {track.topic && ` · ${track.topic}`}
          </div>
        </div>
        <button onClick={onDeleteTrack} title="삭제" style={{
          background: "transparent", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 4,
        }}>×</button>
      </div>

      {/* Audio player */}
      {audioUrl ? (
        <div style={{
          background: "#F0FDF4", borderRadius: 10, padding: 12, marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <audio controls src={audioUrl} style={{ flex: 1, height: 36 }} />
          <a href={audioUrl} download={`${track.title}.mp3`} style={{
            padding: "6px 10px", borderRadius: 8, background: "white",
            color: "#065F46", fontSize: 11, fontWeight: 700, textDecoration: "none", border: "1px solid #BBF7D0",
          }}>💾</a>
          <button onClick={onDeleteAudio} style={{
            padding: "6px 10px", borderRadius: 8, background: "white",
            color: "#991B1B", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid #FECACA",
          }}>삭제</button>
        </div>
      ) : (
        <div style={{
          background: "#FAFAFB", borderRadius: 10, padding: 12, marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Suno에서 받아온 음악 파일을 업로드해서 함께 관리하세요</div>
          <button onClick={() => uploadRef.current?.click()} style={{
            padding: "7px 14px", borderRadius: 8, background: "linear-gradient(135deg, #2563EB, #7C3AED)",
            color: "white", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap",
          }}>📤 업로드</button>
          <input ref={uploadRef} type="file" accept="audio/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUploadAudio(f); }} />
        </div>
      )}

      {/* Style prompt */}
      <details style={{ marginBottom: 8 }}>
        <summary style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED" }}>
          🎯 스타일 프롬프트 ({track.stylePrompt.length}자)
        </summary>
        <div style={{ background: "#FAF5FF", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#374151", lineHeight: 1.6, marginTop: 4 }}>
          {track.stylePrompt}
        </div>
        <button onClick={() => copy(track.stylePrompt, `sty-${track.id}`)} style={{
          marginTop: 6, padding: "5px 10px", borderRadius: 6,
          background: copied === `sty-${track.id}` ? "#D1FAE5" : "#EDE9FE",
          color: copied === `sty-${track.id}` ? "#065F46" : "#5B21B6",
          fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
        }}>{copied === `sty-${track.id}` ? "✓ 복사됨" : "📋 복사"}</button>
      </details>

      {track.lyrics && (
        <details>
          <summary style={{ fontSize: 12, fontWeight: 700, color: "#EC4899" }}>🎶 가사</summary>
          <pre style={{
            background: "#FFF0F6", borderRadius: 8, padding: "10px 14px",
            fontSize: 11, color: "#374151", lineHeight: 1.7, marginTop: 4,
            whiteSpace: "pre-wrap", fontFamily: "inherit",
          }}>{track.lyrics}</pre>
          <button onClick={() => copy(track.lyrics!, `lyr-${track.id}`)} style={{
            marginTop: 6, padding: "5px 10px", borderRadius: 6,
            background: copied === `lyr-${track.id}` ? "#D1FAE5" : "#FCE7F3",
            color: copied === `lyr-${track.id}` ? "#065F46" : "#9F1239",
            fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
          }}>{copied === `lyr-${track.id}` ? "✓ 복사됨" : "📋 가사 복사"}</button>
        </details>
      )}
    </div>
  );
}

// ─── Detail Project Card (cloud) ──────────────────────────────────────────────

function DetailProjectCard({ project, onDelete }: { project: CloudDetailProject; onDelete: () => void }) {
  const pct = Math.round((project.completedSections / Math.max(project.totalSections, 1)) * 100);
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 20,
      border: "1.5px solid #E5E7EB", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      animation: "fadeUp 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 32 }}>🛍️</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <StatusBadge status={project.status} />
          <button onClick={() => { if (confirm("이 프로젝트를 삭제할까요?")) onDelete(); }} style={{
            background: "transparent", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer",
          }}>×</button>
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 4 }}>{project.productName || "상세페이지 프로젝트"}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {project.platform && <Chip label={project.platform} color="#DBEAFE" textColor="#1E40AF" />}
        {project.tone     && <Chip label={project.tone}     color="#EDE9FE" textColor="#5B21B6" />}
      </div>
      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 4 }}>
          <span>진행 섹션</span>
          <span>{project.completedSections} / {project.totalSections}</span>
        </div>
        <div style={{ background: "#F3F4F6", borderRadius: 100, height: 6, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 100, background: project.status === "completed" ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 14 }}>
        {new Date(project.updatedAt).toLocaleString("ko-KR")} · ☁️ 클라우드
      </div>
      <Link href={`/detail?load=${project.id}`} style={{
        display: "block", textAlign: "center", padding: "10px",
        background: project.status === "in-progress"
          ? "linear-gradient(135deg, #F59E0B, #D97706)"
          : "linear-gradient(135deg, #2563EB, #1D4ED8)",
        color: "white", borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none",
      }}>
        {project.status === "in-progress" ? "⏸ 이어서 작업하기 →" : "✓ 결과물 보기 →"}
      </Link>
    </div>
  );
}

function LocalDetailCard({ project }: { project: LocalDetailProject }) {
  return (
    <Link href="/detail" style={{
      background: "white", borderRadius: 14, padding: 18,
      border: "1.5px solid #E5E7EB", textDecoration: "none", display: "block",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>🛍️</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 4 }}>{project.name}</div>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>
        {new Date(project.updatedAt).toLocaleString("ko-KR")} · 로컬 저장
      </div>
      <div style={{ fontSize: 12, color: "#2563EB", fontWeight: 700 }}>열기 →</div>
    </Link>
  );
}

// ─── Storyboard Card ──────────────────────────────────────────────────────────

function StoryboardCard({ sb, onDelete }: { sb: CloudStoryboard; onDelete: () => void }) {
  const pct = Math.round((sb.cutsGenerated / Math.max(sb.totalCuts, 1)) * 100);
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 20,
      border: "1.5px solid #E5E7EB", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      animation: "fadeUp 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 32 }}>🎬</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <StatusBadge status={sb.status} />
          <button onClick={() => { if (confirm("이 스토리보드를 삭제할까요?")) onDelete(); }} style={{
            background: "transparent", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer",
          }}>×</button>
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 4 }}>{sb.topic}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {sb.solution && <Chip label={sb.solution} color="#FEF3C7" textColor="#92400E" />}
        {sb.style    && <Chip label={sb.style}    color="#EDE9FE" textColor="#5B21B6" />}
        {sb.mood     && <Chip label={sb.mood}     color="#FCE7F3" textColor="#9F1239" />}
        {sb.durationSec > 0 && <Chip label={`${sb.durationSec}초`} color="#DBEAFE" textColor="#1E40AF" />}
      </div>
      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 4 }}>
          <span>컷 생성</span>
          <span>{sb.cutsGenerated} / {sb.totalCuts}</span>
        </div>
        <div style={{ background: "#F3F4F6", borderRadius: 100, height: 6, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 100, background: sb.status === "completed" ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 14 }}>
        {new Date(sb.updatedAt).toLocaleString("ko-KR")} · ☁️ 클라우드
      </div>
      <Link href={`/storyboard?load=${sb.id}`} style={{
        display: "block", textAlign: "center", padding: "10px",
        background: sb.status === "in-progress"
          ? "linear-gradient(135deg, #F59E0B, #D97706)"
          : "linear-gradient(135deg, #FBBf24, #F59E0B)",
        color: sb.status === "in-progress" ? "white" : "#0F172A",
        borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none",
      }}>
        {sb.status === "in-progress" ? "⏸ 이어서 작업하기 →" : "🎬 스토리보드 보기 →"}
      </Link>
    </div>
  );
}
