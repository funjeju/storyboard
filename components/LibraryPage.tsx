"use client";

import { useEffect, useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LibraryTrack {
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

interface DetailProject {
  id: string;
  name: string;
  updatedAt: number;
}

// ─── IndexedDB helpers (for audio file storage — localStorage maxes at ~5MB) ──

const DB_NAME = "ai_studio_library";
const STORE = "audio_blobs";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putAudio(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAudio(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteAudio(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const TRACKS_KEY = "suno_library_v1";
const PROJECTS_KEY = "dpm_projects_v1";

function loadTracks(): LibraryTrack[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TRACKS_KEY) || "[]"); } catch { return []; }
}

function saveTracks(tracks: LibraryTrack[]) {
  localStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));
}

function loadDetailProjects(): DetailProject[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]"); } catch { return []; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [detailProjects, setDetailProjects] = useState<DetailProject[]>([]);
  const [filter, setFilter] = useState<"all" | "with-audio" | "no-audio">("all");
  const [search, setSearch] = useState("");
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"music" | "detail">("music");

  useEffect(() => {
    setTracks(loadTracks());
    setDetailProjects(loadDetailProjects());
  }, []);

  // Load audio blobs into object URLs for tracks that have audio
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const t of tracks) {
        if (t.audioDataKey && !audioUrls[t.id]) {
          const blob = await getAudio(t.audioDataKey).catch(() => null);
          if (blob && !cancelled) urls[t.id] = URL.createObjectURL(blob);
        }
      }
      if (!cancelled && Object.keys(urls).length > 0) {
        setAudioUrls(prev => ({ ...prev, ...urls }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const handleAudioUpload = async (trackId: string, file: File) => {
    const key = `audio-${trackId}-${Date.now()}`;
    try {
      await putAudio(key, file);
      const updated = tracks.map(t => t.id === trackId ? { ...t, audioDataKey: key } : t);
      setTracks(updated);
      saveTracks(updated);
      const url = URL.createObjectURL(file);
      setAudioUrls(prev => ({ ...prev, [trackId]: url }));
    } catch (e) {
      alert("음악 파일 저장 실패: " + String(e));
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (!confirm("이 트랙을 삭제할까요? 업로드한 음악도 함께 삭제됩니다.")) return;
    const track = tracks.find(t => t.id === trackId);
    if (track?.audioDataKey) await deleteAudio(track.audioDataKey).catch(() => {});
    const updated = tracks.filter(t => t.id !== trackId);
    setTracks(updated);
    saveTracks(updated);
    if (audioUrls[trackId]) {
      URL.revokeObjectURL(audioUrls[trackId]);
      setAudioUrls(prev => {
        const next = { ...prev };
        delete next[trackId];
        return next;
      });
    }
  };

  const handleDeleteAudio = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track?.audioDataKey) return;
    if (!confirm("이 트랙의 음악 파일만 삭제할까요? (스타일/가사는 유지)")) return;
    await deleteAudio(track.audioDataKey).catch(() => {});
    const updated = tracks.map(t => t.id === trackId ? { ...t, audioDataKey: null } : t);
    setTracks(updated);
    saveTracks(updated);
    if (audioUrls[trackId]) {
      URL.revokeObjectURL(audioUrls[trackId]);
      setAudioUrls(prev => {
        const next = { ...prev };
        delete next[trackId];
        return next;
      });
    }
  };

  const filtered = tracks.filter(t => {
    if (filter === "with-audio" && !t.audioDataKey) return false;
    if (filter === "no-audio" && t.audioDataKey) return false;
    if (search) {
      const q = search.toLowerCase();
      return [t.title, t.genre, t.mood, t.topic].some(s => s.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FF", fontFamily: "'Noto Sans KR', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0;transform:translateY(16px) } to { opacity:1;transform:translateY(0) } }
        details summary { cursor: pointer; outline: none; user-select: none; }
        details[open] summary { margin-bottom: 8px; }
      `}</style>

      {/* Top Nav */}
      <nav style={{
        background: "white", borderBottom: "1px solid #E5E7EB",
        padding: "0 32px", height: 44, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 101,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "white",
            }}>✦</div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>AI Studio</span>
          </a>
          <div style={{ width: 1, height: 16, background: "#E5E7EB" }} />
          {[
            { href: "/storyboard", icon: "🎬", label: "Storyboard" },
            { href: "/suno", icon: "🎵", label: "Suno Maker" },
            { href: "/detail", icon: "🛍️", label: "Detail Page" },
            { href: "/library", icon: "📚", label: "My Library" },
          ].map(tool => (
            <a key={tool.href} href={tool.href} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 8, textDecoration: "none",
              background: tool.href === "/library" ? "#EFF6FF" : "transparent",
              border: tool.href === "/library" ? "1px solid #BFDBFE" : "1px solid transparent",
              fontSize: 12, fontWeight: 600,
              color: tool.href === "/library" ? "#2563EB" : "#6B7280",
            }}>
              <span style={{ fontSize: 13 }}>{tool.icon}</span>
              {tool.label}
            </a>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 4 }}>📚 My Library</h1>
          <p style={{ fontSize: 13, color: "#6B7280" }}>
            생성한 스타일 프롬프트·가사를 모아두고, Suno에서 받아온 음악 파일을 업로드해서 관리하세요
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid #E5E7EB" }}>
          {[
            { id: "music" as const, label: "🎵 음악 트랙", count: tracks.length },
            { id: "detail" as const, label: "🛍️ 상세페이지", count: detailProjects.length },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "12px 20px", border: "none", background: "transparent",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                color: tab === t.id ? "#2563EB" : "#6B7280",
                borderBottom: `2px solid ${tab === t.id ? "#2563EB" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {t.label} <span style={{ marginLeft: 4, fontSize: 11, color: "#9CA3AF" }}>({t.count})</span>
            </button>
          ))}
        </div>

        {tab === "music" && (
          <>
            {/* Filters */}
            <div style={{
              background: "white", borderRadius: 14, padding: 14,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 16,
              display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
            }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔎 제목·장르·무드·테마로 검색"
                style={{
                  flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 10,
                  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { id: "all" as const, label: "전체" },
                  { id: "with-audio" as const, label: "🎧 음악 있음" },
                  { id: "no-audio" as const, label: "📝 텍스트만" },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    style={{
                      padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: filter === f.id ? "#EFF6FF" : "transparent",
                      color: filter === f.id ? "#2563EB" : "#6B7280",
                      fontSize: 12, fontWeight: 700,
                    }}
                  >{f.label}</button>
                ))}
              </div>
            </div>

            {/* Track list */}
            {filtered.length === 0 ? (
              <div style={{
                background: "white", borderRadius: 16, padding: "60px 20px",
                textAlign: "center", color: "#9CA3AF", fontSize: 13,
              }}>
                {tracks.length === 0 ? (
                  <>아직 저장된 트랙이 없습니다. <a href="/suno" style={{ color: "#2563EB", fontWeight: 700 }}>Suno Maker</a>에서 생성하면 자동으로 여기에 저장됩니다.</>
                ) : "검색 결과가 없습니다."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {filtered.map(track => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    audioUrl={audioUrls[track.id] || null}
                    onUploadAudio={(file) => handleAudioUpload(track.id, file)}
                    onDeleteAudio={() => handleDeleteAudio(track.id)}
                    onDeleteTrack={() => handleDeleteTrack(track.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "detail" && (
          <>
            {detailProjects.length === 0 ? (
              <div style={{
                background: "white", borderRadius: 16, padding: "60px 20px",
                textAlign: "center", color: "#9CA3AF", fontSize: 13,
              }}>
                저장된 상세페이지 프로젝트가 없습니다. <a href="/detail" style={{ color: "#2563EB", fontWeight: 700 }}>Detail Page Maker</a>에서 생성하면 자동 저장됩니다.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {detailProjects.map(p => (
                  <a key={p.id} href="/detail" style={{
                    background: "white", borderRadius: 14, padding: 18,
                    border: "1.5px solid #E5E7EB", textDecoration: "none",
                    display: "block",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>🛍️</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                      {new Date(p.updatedAt).toLocaleString("ko-KR")}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 11, color: "#2563EB", fontWeight: 700 }}>열기 →</div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── TrackCard ────────────────────────────────────────────────────────────────

function TrackCard({ track, audioUrl, onUploadAudio, onDeleteAudio, onDeleteTrack }: {
  track: LibraryTrack;
  audioUrl: string | null;
  onUploadAudio: (file: File) => void;
  onDeleteAudio: () => void;
  onDeleteTrack: () => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 18,
      border: `1.5px solid ${audioUrl ? "#86EFAC" : "#E5E7EB"}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      animation: "fadeUp 0.3s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 4 }}>{track.title}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {track.genre && <Chip label={track.genre} color="#EDE9FE" textColor="#5B21B6" />}
            {track.mood && <Chip label={track.mood} color="#FCE7F3" textColor="#9F1239" />}
            {track.vocal && <Chip label={track.vocal} color="#DBEAFE" textColor="#1E40AF" />}
            {audioUrl && <Chip label="🎧 음악 있음" color="#D1FAE5" textColor="#065F46" />}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
            {new Date(track.createdAt).toLocaleString("ko-KR")}
            {track.topic && ` · ${track.topic}`}
          </div>
        </div>
        <button onClick={onDeleteTrack} title="트랙 삭제" style={{
          background: "transparent", border: "none", color: "#EF4444",
          fontSize: 16, cursor: "pointer", padding: 4,
        }}>×</button>
      </div>

      {/* Audio player or upload prompt */}
      {audioUrl ? (
        <div style={{
          background: "#F0FDF4", borderRadius: 10, padding: 12, marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <audio controls src={audioUrl} style={{ flex: 1, height: 36 }} />
          <a href={audioUrl} download={`${track.title}.mp3`} style={{
            padding: "6px 10px", borderRadius: 8, background: "white",
            color: "#065F46", fontSize: 11, fontWeight: 700, textDecoration: "none",
            border: "1px solid #BBF7D0",
          }}>💾</a>
          <button onClick={onDeleteAudio} title="음악만 삭제" style={{
            padding: "6px 10px", borderRadius: 8, background: "white",
            color: "#991B1B", fontSize: 11, fontWeight: 700, cursor: "pointer",
            border: "1px solid #FECACA",
          }}>음악 삭제</button>
        </div>
      ) : (
        <div style={{
          background: "#FAFAFB", borderRadius: 10, padding: 12, marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            🎧 Suno에서 받아온 음악 파일을 업로드해서 함께 관리하세요
          </div>
          <button onClick={() => uploadRef.current?.click()} style={{
            padding: "7px 14px", borderRadius: 8,
            background: "linear-gradient(135deg, #2563EB, #7C3AED)",
            color: "white", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
          }}>📤 음악 업로드</button>
          <input
            ref={uploadRef}
            type="file"
            accept="audio/*"
            style={{ display: "none" }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onUploadAudio(file);
            }}
          />
        </div>
      )}

      {/* Style prompt */}
      <details style={{ marginBottom: 8 }}>
        <summary style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED" }}>
          🎯 스타일 프롬프트 ({track.stylePrompt.length}자)
        </summary>
        <div style={{
          background: "#FAF5FF", borderRadius: 8, padding: "10px 14px",
          fontSize: 12, color: "#374151", lineHeight: 1.6,
          marginTop: 4,
        }}>{track.stylePrompt}</div>
        <button onClick={() => copy(track.stylePrompt, `style-${track.id}`)} style={{
          marginTop: 6, padding: "5px 10px", borderRadius: 6,
          background: copied === `style-${track.id}` ? "#D1FAE5" : "#EDE9FE",
          color: copied === `style-${track.id}` ? "#065F46" : "#5B21B6",
          fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
        }}>
          {copied === `style-${track.id}` ? "✓ 복사됨" : "📋 복사"}
        </button>
      </details>

      {/* Lyrics */}
      {track.lyrics && (
        <details>
          <summary style={{ fontSize: 12, fontWeight: 700, color: "#EC4899" }}>
            📝 가사
          </summary>
          <pre style={{
            background: "#FDF2F8", borderRadius: 8, padding: "10px 14px",
            fontSize: 12, color: "#374151", lineHeight: 1.7,
            marginTop: 4, fontFamily: "inherit", whiteSpace: "pre-wrap",
          }}>{track.lyrics}</pre>
          <button onClick={() => copy(track.lyrics!, `lyrics-${track.id}`)} style={{
            marginTop: 6, padding: "5px 10px", borderRadius: 6,
            background: copied === `lyrics-${track.id}` ? "#D1FAE5" : "#FCE7F3",
            color: copied === `lyrics-${track.id}` ? "#065F46" : "#9F1239",
            fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
          }}>
            {copied === `lyrics-${track.id}` ? "✓ 복사됨" : "📋 복사"}
          </button>
        </details>
      )}
    </div>
  );
}

function Chip({ label, color, textColor }: { label: string; color: string; textColor: string }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700,
      background: color, color: textColor,
    }}>{label}</span>
  );
}
