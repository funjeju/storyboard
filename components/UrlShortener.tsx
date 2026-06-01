"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  getBySlug, createSlugRecord, getAllSlugs, deleteSlugRecord,
  generateRandomSlug, RESERVED_SLUGS, type UrlRecord,
} from "@/lib/slugRegistry";

const BASE_URL = process.env.NEXT_PUBLIC_SLUG_BASE_URL ?? "https://study.funjeju.com";
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";

const P = "#059669";
const GRAD = "linear-gradient(135deg,#059669,#34D399)";

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function UrlShortener() {
  const { user, signIn } = useAuth();
  const isAdmin = !!user && !!ADMIN_EMAIL && user.email === ADMIN_EMAIL;

  const [tab, setTab] = useState<"create" | "dashboard">("create");

  // Create form
  const [targetUrl, setTargetUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ short_url: string; slug: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Dashboard
  const [slugs, setSlugs] = useState<UrlRecord[]>([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [search, setSearch] = useState("");

  const checkSlug = useCallback(async (val: string) => {
    if (!val.trim()) { setSlugStatus("idle"); return; }
    setSlugStatus("checking");
    const res = await fetch("/api/slug/check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: val }),
    });
    const data = await res.json();
    setSlugStatus(data.available ? "ok" : "taken");
  }, []);

  const handleCreate = async () => {
    if (!targetUrl.trim()) return;
    if (!user) { await signIn(); return; }
    setCreating(true);
    setResult(null);
    try {
      let slug = customSlug.trim()
        ? customSlug.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 50)
        : generateRandomSlug(6);

      // 중복 시 suffix
      if (slug) {
        let attempt = slug;
        let available = !RESERVED_SLUGS.has(attempt) && !(await getBySlug(attempt));
        if (!available) {
          for (let i = 1; i <= 9 && !available; i++) {
            attempt = `${slug}-${i}`;
            available = !RESERVED_SLUGS.has(attempt) && !(await getBySlug(attempt));
          }
        }
        slug = attempt;
      }

      const record: UrlRecord = {
        id: `slug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        slug,
        target_url: targetUrl.trim(),
        project_type: "custom",
        owner_id: user.uid,
        created_at: Date.now(),
        click_count: 0,
        status: "active",
      };

      await createSlugRecord(record);
      const short_url = `${BASE_URL}/${slug}`;
      setResult({ short_url, slug });
      setTargetUrl(""); setCustomSlug(""); setSlugStatus("idle");
    } catch (e) {
      alert("생성 실패: " + String(e));
    }
    setCreating(false);
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.short_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadDashboard = async () => {
    setDashLoading(true);
    try {
      const all = await getAllSlugs();
      setSlugs(all);
    } catch (e) { alert("로드 실패: " + String(e)); }
    setDashLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 링크를 삭제할까요?")) return;
    await deleteSlugRecord(id);
    setSlugs(prev => prev.filter(s => s.id !== id));
  };

  const filtered = slugs.filter(s =>
    s.slug.includes(search) || s.target_url.includes(search)
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"white", borderBottom:"1px solid #E5E7EB", padding:"0 32px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <a href="/" style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none" }}>
            <div style={{ width:32, height:32, borderRadius:9, background:"linear-gradient(135deg,#7C3AED,#EC4899)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"white", fontWeight:800 }}>✦</div>
            <span style={{ fontSize:14, fontWeight:800, color:"#111827" }}>AI Studio</span>
          </a>
          <div style={{ width:1, height:20, background:"#E5E7EB" }} />
          <span style={{ fontSize:14, fontWeight:700, color:P }}>🔗 URL 단축기</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {isAdmin && (
            <div style={{ display:"flex", background:"#F3F4F6", borderRadius:10, overflow:"hidden", border:"1.5px solid #E5E7EB" }}>
              {(["create","dashboard"] as const).map(t => (
                <button key={t} onClick={() => { setTab(t); if (t === "dashboard") loadDashboard(); }}
                  style={{ padding:"7px 18px", border:"none", background:tab===t?"white":"transparent", fontSize:12, fontWeight:700, color:tab===t?P:"#6B7280", cursor:"pointer", borderRight: t === "create" ? "1px solid #E5E7EB" : "none" }}>
                  {t === "create" ? "🔗 단축하기" : "📊 대시보드"}
                </button>
              ))}
            </div>
          )}
          {user ? (
            <span style={{ fontSize:12, color:"#6B7280" }}>{user.displayName}</span>
          ) : (
            <button onClick={signIn} style={{ padding:"7px 18px", background:GRAD, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>로그인</button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 680, margin:"0 auto", padding:"48px 24px 80px" }}>

        {tab === "create" && (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            <h1 style={{ fontSize:32, fontWeight:800, color:"#0F172A", marginBottom:8, letterSpacing:-0.8 }}>🔗 URL 단축기</h1>
            <p style={{ fontSize:14, color:"#6B7280", marginBottom:36 }}>복잡한 주소를 <strong style={{ color:P }}>study.funjeju.com/{"{slug}"}</strong> 형태로 단축합니다</p>

            <div style={{ background:"white", borderRadius:20, padding:32, boxShadow:"0 2px 12px rgba(0,0,0,0.06)", marginBottom:20 }}>
              {/* Target URL */}
              <div style={{ marginBottom:20 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>단축할 URL *</label>
                <input
                  value={targetUrl}
                  onChange={e => setTargetUrl(e.target.value)}
                  placeholder="https://..."
                  style={{ width:"100%", padding:"13px 16px", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontFamily:"inherit", outline:"none" }}
                />
              </div>

              {/* Custom slug */}
              <div style={{ marginBottom:24 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>
                  커스텀 slug <span style={{ fontWeight:400, color:"#9CA3AF" }}>(선택 — 비우면 자동 생성)</span>
                </label>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, color:"#6B7280", whiteSpace:"nowrap" }}>study.funjeju.com/</span>
                  <div style={{ flex:1, position:"relative" }}>
                    <input
                      value={customSlug}
                      onChange={e => { setCustomSlug(e.target.value); checkSlug(e.target.value); }}
                      placeholder="my-link"
                      style={{ width:"100%", padding:"11px 40px 11px 14px", border:`1.5px solid ${slugStatus==="ok"?"#059669":slugStatus==="taken"?"#EF4444":"#E5E7EB"}`, borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none" }}
                    />
                    {slugStatus !== "idle" && (
                      <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:14 }}>
                        {slugStatus==="checking"?"⏳":slugStatus==="ok"?"✅":"❌"}
                      </span>
                    )}
                  </div>
                </div>
                {slugStatus === "taken" && (
                  <div style={{ fontSize:11, color:"#EF4444", marginTop:6 }}>이미 사용 중인 slug입니다. 다른 이름을 입력하거나 비워두면 자동 생성됩니다.</div>
                )}
              </div>

              <button
                onClick={handleCreate}
                disabled={creating || !targetUrl.trim() || slugStatus === "taken"}
                style={{ width:"100%", padding:"14px", background:targetUrl.trim()&&slugStatus!=="taken"?GRAD:"#E5E7EB", border:"none", borderRadius:14, fontSize:15, fontWeight:700, color:targetUrl.trim()&&slugStatus!=="taken"?"white":"#9CA3AF", cursor:targetUrl.trim()&&slugStatus!=="taken"?"pointer":"default", boxShadow:targetUrl.trim()&&slugStatus!=="taken"?"0 4px 16px rgba(5,150,105,0.3)":"none" }}
              >
                {creating ? "⏳ 생성 중..." : "🔗 URL 단축하기"}
              </button>
            </div>

            {/* Result */}
            {result && (
              <div style={{ background:"linear-gradient(135deg,#ECFDF5,#F0FDF4)", border:"2px solid #A7F3D0", borderRadius:20, padding:28, animation:"fadeUp 0.3s ease both" }}>
                <div style={{ fontSize:13, fontWeight:700, color:P, marginBottom:12 }}>✅ 단축 링크가 생성되었습니다!</div>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", borderRadius:12, padding:"14px 18px", border:"1.5px solid #D1FAE5" }}>
                  <span style={{ flex:1, fontSize:16, fontWeight:800, color:"#065F46", letterSpacing:-0.3 }}>{result.short_url}</span>
                  <button
                    onClick={handleCopy}
                    style={{ padding:"8px 18px", background:copied?"#059669":GRAD, border:"none", borderRadius:9, fontSize:13, fontWeight:700, color:"white", cursor:"pointer", flexShrink:0 }}
                  >
                    {copied ? "✓ 복사됨" : "📋 복사"}
                  </button>
                </div>
                <div style={{ fontSize:12, color:"#6B7280", marginTop:10 }}>
                  → {result.short_url.length > 60 ? result.short_url.slice(0, 60) + "..." : result.short_url}
                </div>
              </div>
            )}

            {/* API 스펙 */}
            <div style={{ background:"white", borderRadius:16, padding:24, boxShadow:"0 2px 8px rgba(0,0,0,0.05)", marginTop:20 }}>
              <div style={{ fontSize:13, fontWeight:800, color:"#374151", marginBottom:14 }}>🔌 외부 프로젝트 API 연동</div>
              <div style={{ background:"#0F172A", borderRadius:12, padding:16, fontFamily:"monospace", fontSize:12, color:"#E2E8F0", lineHeight:1.8, overflow:"auto" }}>
                <div style={{ color:"#94A3B8" }}>// POST /api/slug/create</div>
                <div>{`fetch("${BASE_URL}/api/slug/create", {`}</div>
                <div style={{ paddingLeft:16 }}>{`method: "POST",`}</div>
                <div style={{ paddingLeft:16 }}>{`headers: { "x-api-key": "SLUG_API_KEY" },`}</div>
                <div style={{ paddingLeft:16 }}>{`body: JSON.stringify({`}</div>
                <div style={{ paddingLeft:32 }}>{`target_url: "https://your-url.com",`}</div>
                <div style={{ paddingLeft:32 }}>{`preferred_slug: "my-slug",  // optional`}</div>
                <div style={{ paddingLeft:16 }}>{`})`}</div>
                <div>{`})`}</div>
                <div style={{ marginTop:10, color:"#94A3B8" }}>{"// 응답: { slug, short_url, id }"}</div>
              </div>
            </div>
          </div>
        )}

        {tab === "dashboard" && isAdmin && (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
              <h1 style={{ fontSize:24, fontWeight:800, color:"#0F172A" }}>📊 slug 대시보드</h1>
              <button onClick={loadDashboard} style={{ padding:"8px 18px", background:GRAD, border:"none", borderRadius:10, fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>🔄 새로고침</button>
            </div>

            <div style={{ marginBottom:16 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="slug 또는 URL 검색..."
                style={{ width:"100%", padding:"11px 16px", border:"1.5px solid #E5E7EB", borderRadius:12, fontSize:14, fontFamily:"inherit", outline:"none" }} />
            </div>

            {dashLoading ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:"#9CA3AF" }}>로드 중...</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {filtered.map(s => (
                  <div key={s.id} style={{ background:"white", borderRadius:14, padding:"16px 20px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", display:"flex", alignItems:"center", gap:16 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:14, fontWeight:800, color:P }}>/{s.slug}</span>
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background: s.status==="active"?"#D1FAE5":"#FEE2E2", color:s.status==="active"?"#065F46":"#DC2626", fontWeight:700 }}>{s.status}</span>
                      </div>
                      <div style={{ fontSize:11, color:"#6B7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>→ {s.target_url}</div>
                      <div style={{ fontSize:11, color:"#9CA3AF", marginTop:4 }}>📅 {fmtDate(s.created_at)} · 👁 {s.click_count}회</div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={() => navigator.clipboard.writeText(`${BASE_URL}/${s.slug}`)}
                        style={{ padding:"6px 12px", background:"#F0FDF4", border:"none", borderRadius:8, fontSize:12, fontWeight:600, color:P, cursor:"pointer" }}>📋</button>
                      {s.status === "active" && (
                        <button onClick={() => handleDelete(s.id)}
                          style={{ padding:"6px 12px", background:"#FEF2F2", border:"none", borderRadius:8, fontSize:12, fontWeight:600, color:"#DC2626", cursor:"pointer" }}>🗑</button>
                      )}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"#9CA3AF" }}>링크 없음</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
