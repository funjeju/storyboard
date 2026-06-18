"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  getMapBoard,
  subscribeToMapPosts,
  addMapPost,
  updateMapPost,
  deleteMapPost,
  type CloudMapBoard,
  type CloudMapPost,
} from "@/lib/firestoreHelpers";
import { uploadMapImage, deleteStorageFile } from "@/lib/firebaseStorage";

const P = "#7C3AED";
const PINK = "#EC4899";
const PIN = "#EC4899";

// 마젠타 핀 아이콘 HTML
function pinHtml(selected: boolean) {
  const c = selected ? "#7C3AED" : PIN;
  const scale = selected ? 1.25 : 1;
  return `<div style="transform:translate(-50%,-100%) scale(${scale});transform-origin:bottom center;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.3));">
    <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="${c}"/>
      <circle cx="15" cy="15" r="6" fill="white"/>
    </svg>
  </div>`;
}

interface NominatimResult { display_name: string; lat: string; lon: string; }

export default function MapBoard({ boardId }: { boardId: string }) {
  const { user, signIn } = useAuth();
  const [board, setBoard] = useState<CloudMapBoard | null>(null);
  const [posts, setPosts] = useState<CloudMapPost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewPost, setViewPost] = useState<CloudMapPost | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  // form (add/edit)
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fText, setFText] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fLat, setFLat] = useState<number | null>(null);
  const [fLng, setFLng] = useState<number | null>(null);
  const [fImageFile, setFImageFile] = useState<File | null>(null);
  const [fImagePreview, setFImagePreview] = useState("");
  const [fExistingImage, setFExistingImage] = useState<{ url: string; path: string } | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickMode, setPickMode] = useState(false);

  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const markerById = useRef<Record<string, any>>({});
  const pickModeRef = useRef(false);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { getMapBoard(boardId).then(setBoard); }, [boardId]);
  useEffect(() => subscribeToMapPosts(boardId, setPosts), [boardId]);

  // ── Leaflet init ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    // CSS 주입
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      LRef.current = L;
      const el = document.getElementById("map-canvas");
      if (!el || mapRef.current) return;
      const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([36.5, 127.8], 7);
      map.zoomControl.setPosition("topright");
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      map.on("click", async (e: any) => {
        if (!pickModeRef.current) return;
        const { lat, lng } = e.latlng;
        setPickMode(false);
        setFLat(lat); setFLng(lng);
        setFAddress("주소 확인 중...");
        setFormOpen(true);
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko&zoom=18`);
          const j = await r.json();
          setFAddress(j.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } catch { setFAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); }
      });
      mapRef.current = map;
      // 초기 데이터가 있으면 fit
      setTimeout(() => map.invalidateSize(), 100);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── markers rebuild ───────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current, group = markersRef.current, map = mapRef.current;
    if (!L || !group || !map) return;
    group.clearLayers();
    markerById.current = {};
    posts.forEach(p => {
      const icon = L.divIcon({ html: pinHtml(p.id === selectedId), className: "", iconSize: [30, 40], iconAnchor: [15, 40] });
      const m = L.marker([p.lat, p.lng], { icon }).addTo(group);
      m.on("click", () => { setSelectedId(p.id); setViewPost(p); map.panTo([p.lat, p.lng]); });
      markerById.current[p.id] = m;
    });
    // 첫 로드 시 전체 핀에 맞게 fit
    if (posts.length && !(map as any)._fittedOnce) {
      const bounds = L.latLngBounds(posts.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      (map as any)._fittedOnce = true;
    }
  }, [posts, selectedId]);

  const focusPost = (p: CloudMapPost) => {
    setSelectedId(p.id);
    setViewPost(p);
    const map = mapRef.current;
    if (map) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 14), { animate: true });
    if (isMobile) setListOpen(false);
  };

  // ── form helpers ──────────────────────────────────────────────────────────
  const resetForm = () => {
    setFTitle(""); setFText(""); setFAddress(""); setFLat(null); setFLng(null);
    setFImageFile(null); setFImagePreview(""); setFExistingImage(null);
    setSearchQ(""); setSearchResults([]); setEditingId(null);
  };

  const openAddBlank = () => {
    if (!user) { signIn(); return; }
    resetForm(); setFormMode("add"); setFormOpen(true);
  };

  const openEdit = (p: CloudMapPost) => {
    resetForm();
    setFormMode("edit"); setEditingId(p.id);
    setFTitle(p.title); setFText(p.text ?? ""); setFAddress(p.address);
    setFLat(p.lat); setFLng(p.lng);
    if (p.imageUrl) setFExistingImage({ url: p.imageUrl, path: p.imagePath ?? "" });
    setViewPost(null); setFormOpen(true);
  };

  const runSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQ.trim())}&limit=6&accept-language=ko`);
      setSearchResults(await r.json());
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const pickResult = (r: NominatimResult) => {
    setFLat(+r.lat); setFLng(+r.lon); setFAddress(r.display_name);
    setSearchResults([]); setSearchQ("");
    const map = mapRef.current;
    if (map) map.setView([+r.lat, +r.lon], 15, { animate: true });
  };

  const pickImage = (f: File | null) => {
    setFImageFile(f);
    if (f) { const rd = new FileReader(); rd.onload = () => setFImagePreview(rd.result as string); rd.readAsDataURL(f); }
    else setFImagePreview("");
  };

  const startMapPick = () => { setFormOpen(false); setPickMode(true); if (isMobile) setListOpen(false); };

  const handleSave = async () => {
    if (!user) { await signIn(); return; }
    if (!fTitle.trim() || fLat == null || fLng == null) return;
    setSaving(true);
    try {
      let imageUrl = fExistingImage?.url;
      let imagePath = fExistingImage?.path;
      if (fImageFile) {
        const up = await uploadMapImage(boardId, fImageFile);
        imageUrl = up.url; imagePath = up.path;
      }
      if (formMode === "edit" && editingId) {
        await updateMapPost(boardId, editingId, {
          title: fTitle.trim(), text: fText.trim(), address: fAddress, lat: fLat, lng: fLng,
          ...(imageUrl ? { imageUrl, imagePath } : {}),
        });
      } else {
        await addMapPost(boardId, {
          id: crypto.randomUUID(), boardId,
          uid: user.uid, authorName: user.displayName ?? "익명", authorPhoto: user.photoURL ?? "",
          title: fTitle.trim(), address: fAddress, text: fText.trim(),
          ...(imageUrl ? { imageUrl, imagePath } : {}),
          lat: fLat, lng: fLng, createdAt: Date.now(),
        });
        const map = mapRef.current;
        if (map) map.setView([fLat, fLng], 15, { animate: true });
      }
      setFormOpen(false); resetForm();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleDelete = async (p: CloudMapPost) => {
    if (!window.confirm(`'${p.title}' 핀을 삭제할까요?`)) return;
    try {
      await deleteMapPost(boardId, p.id);
      if (p.imagePath) deleteStorageFile(p.imagePath);
      setViewPost(null);
    } catch { /* silent */ }
  };

  const canEdit = (p: CloudMapPost) => user && (user.uid === p.uid || user.uid === board?.uid);

  // ── list panel styles (responsive) ────────────────────────────────────────
  const listStyle: React.CSSProperties = isMobile
    ? { position:"absolute", left:0, right:0, bottom:0, height:"50vh", borderRadius:"18px 18px 0 0", transform:listOpen?"translateY(0)":"translateY(calc(100% - 52px))", transition:"transform 0.28s ease", zIndex:20 }
    : { position:"absolute", top:76, left:16, bottom:16, width:344, borderRadius:18, zIndex:20 };

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", fontFamily:"'Noto Sans KR',-apple-system,sans-serif", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .leaflet-container { font-family:inherit; }
        .mb-scroll { scrollbar-width:thin; scrollbar-color:#CBD5E1 transparent; }
        .mb-scroll::-webkit-scrollbar { width:7px; }
        .mb-scroll::-webkit-scrollbar-thumb { background:#CBD5E1; border-radius:100px; }
        .mb-li:hover { background:#F8F9FF!important; }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 18px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, zIndex:30 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
          <Link href="/mapboard" style={{ fontSize:13, fontWeight:700, color:"#6B7280", textDecoration:"none", flexShrink:0 }}>← 지도 목록</Link>
          <div style={{ width:1, height:20, background:"#E5E7EB", flexShrink:0 }} />
          <span style={{ fontSize:15, fontWeight:800, color:"#0F172A", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>🗺️ {board?.title ?? "지도 보드"}</span>
        </div>
        <button onClick={openAddBlank} style={{ flexShrink:0, padding:"8px 16px", background:`linear-gradient(135deg,${P},${PINK})`, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>+ 핀 추가</button>
      </nav>

      {/* Map + overlays */}
      <div style={{ flex:1, position:"relative" }}>
        <div id="map-canvas" style={{ position:"absolute", inset:0, background:"#E5E7EB", zIndex:0 }} />

        {/* 위치 선택 모드 배너 */}
        {pickMode && (
          <div style={{ position:"absolute", top:16, left:"50%", transform:"translateX(-50%)", zIndex:25, background:"#0F172A", color:"white", padding:"10px 18px", borderRadius:100, fontSize:13, fontWeight:700, boxShadow:"0 6px 20px rgba(0,0,0,0.25)", display:"flex", alignItems:"center", gap:10 }}>
            📍 지도를 클릭해 위치를 지정하세요
            <span onClick={() => { setPickMode(false); setFormOpen(true); }} style={{ cursor:"pointer", opacity:0.7, fontWeight:800 }}>취소</span>
          </div>
        )}

        {/* List panel */}
        <div className="mb-scroll" style={{ ...listStyle, background:"white", boxShadow:"0 8px 32px rgba(0,0,0,0.16)", overflowY:"auto", display:"flex", flexDirection:"column" }}>
          {isMobile && (
            <div onClick={() => setListOpen(o => !o)} style={{ position:"sticky", top:0, background:"white", padding:"12px 0 8px", textAlign:"center", cursor:"pointer", borderRadius:"18px 18px 0 0", flexShrink:0, zIndex:2 }}>
              <div style={{ width:40, height:4, borderRadius:100, background:"#CBD5E1", margin:"0 auto 8px" }} />
              <span style={{ fontSize:13, fontWeight:700, color:"#374151" }}>📍 장소 {posts.length}개 {listOpen ? "▾" : "▴"}</span>
            </div>
          )}
          {/* Header (desktop) */}
          {!isMobile && (
            <div style={{ padding:"18px 18px 12px", borderBottom:"1px solid #F3F4F6", position:"sticky", top:0, background:"white", zIndex:2 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#0F172A", lineHeight:1.3 }}>{board?.title}</div>
              {board?.description && <div style={{ fontSize:12, color:"#6B7280", marginTop:4, lineHeight:1.5 }}>{board.description}</div>}
              <div style={{ fontSize:12, color:"#9CA3AF", marginTop:8 }}>📍 {posts.length}개 장소</div>
            </div>
          )}
          {/* List */}
          <div style={{ padding:"6px 0" }}>
            {posts.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 24px", color:"#9CA3AF" }}>
                <div style={{ fontSize:32, marginBottom:10 }}>📍</div>
                <div style={{ fontSize:13, fontWeight:600 }}>아직 핀이 없어요</div>
                <div style={{ fontSize:12, marginTop:6 }}>‘+ 핀 추가’로 장소를 등록해보세요</div>
              </div>
            ) : posts.map(p => (
              <div
                key={p.id}
                className="mb-li"
                onClick={() => focusPost(p)}
                style={{ display:"flex", gap:12, padding:"12px 16px", cursor:"pointer", borderLeft:`3px solid ${p.id===selectedId?PIN:"transparent"}`, background:p.id===selectedId?"#FDF2F8":"transparent", transition:"background 0.15s" }}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1F2937", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.title}</div>
                  <div style={{ fontSize:12, color:"#9CA3AF", marginTop:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.address}</div>
                </div>
                {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width:54, height:54, borderRadius:8, objectFit:"cover", flexShrink:0 }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 핀 상세 모달 */}
      {viewPost && (
        <div onClick={() => setViewPost(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:20, width:"100%", maxWidth:420, maxHeight:"86vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.2)" }} className="mb-scroll">
            {viewPost.imageUrl && <img src={viewPost.imageUrl} alt="" style={{ width:"100%", maxHeight:260, objectFit:"cover", display:"block" }} />}
            <div style={{ padding:"20px 22px 22px" }}>
              <div style={{ fontSize:20, fontWeight:800, color:"#0F172A", lineHeight:1.3 }}>{viewPost.title}</div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:6, fontSize:12, color:"#6B7280", marginTop:8, lineHeight:1.5 }}>📍 <span>{viewPost.address}</span></div>
              {viewPost.text && <div style={{ fontSize:14, color:"#374151", lineHeight:1.7, whiteSpace:"pre-wrap", marginTop:14 }}>{viewPost.text}</div>}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:16, fontSize:12, color:"#9CA3AF" }}>
                {viewPost.authorPhoto && <img src={viewPost.authorPhoto} alt="" style={{ width:20, height:20, borderRadius:"50%" }} />}
                <span>{viewPost.authorName}</span>
              </div>
              <div style={{ display:"flex", gap:8, marginTop:18 }}>
                <a href={`https://www.openstreetmap.org/?mlat=${viewPost.lat}&mlon=${viewPost.lng}#map=17/${viewPost.lat}/${viewPost.lng}`} target="_blank" rel="noopener noreferrer" style={{ flex:1, textAlign:"center", padding:"11px", background:"#F3F4F6", borderRadius:10, fontSize:13, fontWeight:700, color:"#374151", textDecoration:"none" }}>🗺️ 지도에서 보기</a>
                {canEdit(viewPost) && (
                  <>
                    <button onClick={() => openEdit(viewPost)} style={{ padding:"11px 14px", background:"rgba(124,58,237,0.1)", border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:P, cursor:"pointer" }}>✏️</button>
                    <button onClick={() => handleDelete(viewPost)} style={{ padding:"11px 14px", background:"#FEF2F2", border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"#DC2626", cursor:"pointer" }}>🗑</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 핀 추가/수정 모달 */}
      {formOpen && (
        <div onClick={() => { if (!saving) setFormOpen(false); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:500, display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center", padding:isMobile?0:20 }}>
          <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ background:"white", borderRadius:isMobile?"22px 22px 0 0":22, width:"100%", maxWidth:460, maxHeight:"90vh", overflowY:"auto", padding:"28px 24px", boxShadow:"0 -10px 40px rgba(0,0,0,0.18)" }} className="mb-scroll">
            <div style={{ fontSize:19, fontWeight:800, color:"#111827", marginBottom:18 }}>{formMode === "edit" ? "✏️ 핀 수정" : "📍 새 핀 추가"}</div>

            {/* 위치 */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>위치 *</label>
              {fLat != null ? (
                <div style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"10px 12px", background:"#F0FDF4", border:"1.5px solid #BBF7D0", borderRadius:10, fontSize:12, color:"#166534", lineHeight:1.5 }}>
                  <span>📍</span><span style={{ flex:1 }}>{fAddress}</span>
                  <span onClick={() => { setFLat(null); setFLng(null); setFAddress(""); }} style={{ cursor:"pointer", color:"#9CA3AF", fontWeight:800 }}>×</span>
                </div>
              ) : (
                <>
                  <div style={{ display:"flex", gap:6 }}>
                    <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") runSearch(); }} placeholder="장소·주소 검색 (예: 제주 돌문화공원)" style={{ flex:1, padding:"10px 12px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:13, fontFamily:"inherit", outline:"none" }} />
                    <button onClick={runSearch} disabled={searching} style={{ padding:"10px 14px", background:P, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>{searching ? "..." : "검색"}</button>
                  </div>
                  <button onClick={startMapPick} style={{ marginTop:8, width:"100%", padding:"9px", background:"white", border:`1.5px dashed ${P}`, borderRadius:10, fontSize:12, fontWeight:700, color:P, cursor:"pointer" }}>🗺️ 지도에서 직접 클릭해 지정</button>
                  {searchResults.length > 0 && (
                    <div style={{ marginTop:8, border:"1.5px solid #E5E7EB", borderRadius:10, overflow:"hidden", maxHeight:200, overflowY:"auto" }} className="mb-scroll">
                      {searchResults.map((r, i) => (
                        <div key={i} onClick={() => pickResult(r)} style={{ padding:"9px 12px", fontSize:12, color:"#374151", cursor:"pointer", borderBottom:i<searchResults.length-1?"1px solid #F3F4F6":"none", lineHeight:1.4 }} className="mb-li">{r.display_name}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>제목 *</label>
              <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="장소 이름 / 핀 제목" style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }} />
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>메모 (선택)</label>
              <textarea value={fText} onChange={e => setFText(e.target.value)} rows={3} placeholder="설명을 적어보세요" style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5E7EB", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none", resize:"vertical", lineHeight:1.6 }} />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>사진 (선택)</label>
              <label style={{ display:"block", cursor:"pointer" }}>
                <input type="file" accept="image/*" onChange={e => pickImage(e.target.files?.[0] ?? null)} style={{ display:"none" }} />
                {(fImagePreview || fExistingImage) ? (
                  <div style={{ position:"relative", borderRadius:12, overflow:"hidden", border:"1.5px solid #E5E7EB" }}>
                    <img src={fImagePreview || fExistingImage?.url} alt="" style={{ width:"100%", maxHeight:200, objectFit:"cover", display:"block" }} />
                    <div style={{ position:"absolute", bottom:8, right:8, padding:"4px 10px", borderRadius:8, background:"rgba(0,0,0,0.6)", color:"white", fontSize:12, fontWeight:600 }}>변경</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"24px 0", border:"2px dashed #E5E7EB", borderRadius:12, color:"#9CA3AF" }}>
                    <div style={{ fontSize:26 }}>📷</div><div style={{ fontSize:13, fontWeight:600 }}>사진 추가</div>
                  </div>
                )}
              </label>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { if (!saving) setFormOpen(false); }} style={{ flex:1, padding:"13px", background:"white", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>취소</button>
              <button onClick={handleSave} disabled={saving || !fTitle.trim() || fLat == null} style={{ flex:2, padding:"13px", background:(fTitle.trim() && fLat != null)?`linear-gradient(135deg,${P},${PINK})`:"#E5E7EB", border:"none", borderRadius:12, fontSize:14, fontWeight:700, color:(fTitle.trim() && fLat != null)?"white":"#9CA3AF", cursor:(fTitle.trim() && fLat != null)?"pointer":"default" }}>{saving ? "저장 중..." : (formMode === "edit" ? "수정 완료" : "📍 핀 추가")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
