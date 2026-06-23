"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const P = "#7C3AED";
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com";

interface KN { k: string; n: number }
interface Stats {
  days: number;
  totals: { views: number; visitors: number; returningVisitors: number; loggedInViews: number; loggedInUsers: number };
  byDay: { d: string; n: number }[];
  byHour: { h: number; n: number }[];
  device: KN[]; os: KN[]; browser: KN[]; country: KN[]; region: KN[]; city: KN[]; lang: KN[]; paths: KN[]; referrers: KN[];
  recent: { ts: number; path: string; device: string; browser: string; os: string; country: string; region: string; city: string; email: string | null; name: string | null; ref: string }[];
}

const fmtTime = (ts: number) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function BarList({ title, data, color = P }: { title: string; data: KN[]; color?: string }) {
  const max = Math.max(1, ...data.map(d => d.n));
  return (
    <div style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 12 }}>{title}</div>
      {data.length === 0 ? <div style={{ fontSize: 12, color: "#9CA3AF" }}>데이터 없음</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: "0 0 96px", fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.k}>{d.k}</span>
              <div style={{ flex: 1, height: 16, background: "#F1F5F9", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${(d.n / max) * 100}%`, height: "100%", background: color, borderRadius: 5 }} />
              </div>
              <span style={{ flex: "0 0 40px", fontSize: 12, fontWeight: 700, color: "#0F172A", textAlign: "right" }}>{d.n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { user, loading: authLoading, signIn, getIdToken } = useAuth();
  const isAdmin = !!user && user.email === ADMIN_EMAIL;
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true); setErr("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/stats?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "불러오기 실패");
      setStats(data);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setLoading(false);
  }, [isAdmin, days, getIdToken]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // ── 게이트 ──
  if (!authLoading && !isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
        <div style={{ background: "white", borderRadius: 22, padding: "44px 36px", maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>🔐</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>관리자 전용</div>
          <div style={{ fontSize: 14, color: "#6B7280", marginBottom: 24 }}>{user ? "이 계정은 접근 권한이 없어요." : "관리자 계정으로 로그인하세요."}</div>
          {!user
            ? <button onClick={signIn} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: P, color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Google로 로그인</button>
            : <Link href="/" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>← 홈으로</Link>}
        </div>
      </div>
    );
  }

  const T = stats?.totals;
  const dayMax = Math.max(1, ...(stats?.byDay.map(d => d.n) || [1]));
  const hourMax = Math.max(1, ...(stats?.byHour.map(d => d.n) || [1]));

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "'Noto Sans KR',-apple-system,sans-serif", color: "#1F2937" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>

      <nav style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 20px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ fontSize: 13, color: "#6B7280", textDecoration: "none", fontWeight: 600 }}>← 홈</Link>
          <span style={{ fontSize: 15, fontWeight: 800 }}>📊 접속 통계</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: days === d ? P : "#F1F5F9", color: days === d ? "white" : "#6B7280" }}>{d}일</button>
          ))}
          <button onClick={load} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↻</button>
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 80px" }}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>불러오는 중...</div>}
        {err && <div style={{ background: "#FEF2F2", color: "#DC2626", borderRadius: 12, padding: 14, fontSize: 13, marginBottom: 16 }}>⚠️ {err}</div>}

        {stats && (
          <>
            {/* 핵심 지표 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
              {[
                ["총 조회수", T!.views, "👁️"],
                ["순방문자", T!.visitors, "🧑‍🤝‍🧑"],
                ["재방문자", T!.returningVisitors, "🔁"],
                ["로그인 조회", T!.loggedInViews, "🔑"],
                ["로그인 사용자", T!.loggedInUsers, "👤"],
              ].map(([t, v, ic]) => (
                <div key={t as string} style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: "16px 18px" }}>
                  <div style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>{ic as string} {t as string}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{(v as number).toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* 일자 추이 */}
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>📈 일자별 조회수 ({days}일)</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, overflowX: "auto" }}>
                {stats.byDay.map((d, i) => (
                  <div key={i} style={{ flex: "1 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 8 }} title={`${d.d}: ${d.n}`}>
                    <div style={{ width: "100%", maxWidth: 22, height: `${(d.n / dayMax) * 96}px`, minHeight: d.n ? 3 : 0, background: `linear-gradient(180deg,${P},#A855F7)`, borderRadius: "4px 4px 0 0" }} />
                    {days <= 31 && <span style={{ fontSize: 8, color: "#9CA3AF", transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>{d.d}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* 시간대 */}
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>🕐 시간대별 접속 (0~23시)</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>
                {stats.byHour.map(d => (
                  <div key={d.h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }} title={`${d.h}시: ${d.n}`}>
                    <div style={{ width: "100%", height: `${(d.n / hourMax) * 66}px`, minHeight: d.n ? 2 : 0, background: "#0EA5E9", borderRadius: "3px 3px 0 0" }} />
                    <span style={{ fontSize: 8, color: "#9CA3AF" }}>{d.h}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 브레이크다운 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
              <BarList title="🌍 지역 (시/도)" data={stats.region} color="#10B981" />
              <BarList title="🏙️ 도시" data={stats.city} color="#10B981" />
              <BarList title="🌐 국가" data={stats.country} color="#059669" />
              <BarList title="📱 기기" data={stats.device} color="#7C3AED" />
              <BarList title="💻 OS" data={stats.os} color="#7C3AED" />
              <BarList title="🧭 브라우저" data={stats.browser} color="#7C3AED" />
              <BarList title="📄 인기 페이지" data={stats.paths} color="#2563EB" />
              <BarList title="🔗 유입 경로" data={stats.referrers} color="#EC4899" />
              <BarList title="🗣️ 언어" data={stats.lang} color="#F59E0B" />
            </div>

            {/* 최근 방문 */}
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: 16, marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>🕒 최근 방문 25건</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#9CA3AF", textAlign: "left" }}>
                      {["시간", "페이지", "지역", "기기/브라우저", "유입", "사용자"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: "#6B7280" }}>{fmtTime(r.ts)}</td>
                        <td style={{ padding: "7px 8px", fontWeight: 600 }}>{r.path}</td>
                        <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{[r.city, r.region, r.country].filter(Boolean).join(" ") || "-"}</td>
                        <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: "#6B7280" }}>{r.device}·{r.browser}</td>
                        <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: "#6B7280" }}>{r.ref || "-"}</td>
                        <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: r.email ? "#7C3AED" : "#C0C4CC" }}>{r.name || r.email || "익명"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 18, lineHeight: 1.7 }}>
              ※ 지역은 접속 IP 기반(Vercel) 추정치이며 시/도·도시 단위입니다. <b>나이·성별은 브라우저에서 수집할 수 없어 제공하지 않습니다</b>(광고망 추적 미사용).
              로그인 사용자는 이메일/이름이 표시되고, 비로그인은 익명 방문자 ID로만 구분됩니다.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
