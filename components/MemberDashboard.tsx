"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const P = "#7C3AED";
const GREEN = "#10B981";
const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "naggu1999@gmail.com").toLowerCase();

interface Member {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  lastSignIn: string;
  createdAt: string;
  isOwner: boolean;
  isAllowed: boolean;
}

interface LogEntry {
  id: string;
  ts: number;
  uid: string;
  email: string;
  name: string;
  endpoint: string;
  provider: string;
  keySource: string;
}

interface KN { k: string; n: number }

interface LogSummary {
  total: number;
  serverCount: number;
  byokCount: number;
  googleCount: number;
  openaiCount: number;
  topUsers: KN[];
  topEndpoints: KN[];
}

const fmtDate = (s: string) => {
  if (!s) return "-";
  const d = new Date(s);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const ENDPOINT_LABEL: Record<string, string> = {
  "/api/claude": "Gemini 채팅",
  "/api/copy-gen": "카피 생성",
  "/api/img-prompt": "이미지 프롬프트",
  "/api/image": "이미지 생성",
  "/api/research": "리서치",
  "/api/metaprompt": "메타프롬프트",
  "/api/lyrics-gen": "가사 생성",
  "/api/lyrics-analyze": "가사 분석",
  "/api/suno-prompt": "Suno 프롬프트",
  "/api/style-dna": "스타일 DNA",
  "/api/thumbnail": "썸네일",
  "/api/module-plan": "모듈 플랜",
  "/api/detail2": "디테일 v2",
  "/api/srt-generate": "SRT 자막",
};

export default function MemberDashboard() {
  const { user, loading: authLoading, signIn, getIdToken } = useAuth();
  const isAdmin = !!user && user.email?.toLowerCase() === ADMIN_EMAIL;

  const [tab, setTab] = useState<"members" | "logs">("members");

  // ── Members ──
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [mLoading, setMLoading] = useState(false);
  const [mErr, setMErr] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  // ── Logs ──
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [summary, setSummary] = useState<LogSummary | null>(null);
  const [logDays, setLogDays] = useState(30);
  const [lLoading, setLLoading] = useState(false);
  const [lErr, setLErr] = useState("");

  const authHeaders = useCallback(async () => {
    const token = await getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [getIdToken]);

  // ── Load members ──
  const loadMembers = useCallback(async () => {
    if (!isAdmin) return;
    setMLoading(true); setMErr("");
    try {
      const res = await fetch("/api/admin/members", { headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "불러오기 실패");
      setMembers(data.users);
    } catch (e) { setMErr(e instanceof Error ? e.message : String(e)); }
    setMLoading(false);
  }, [isAdmin, authHeaders]);

  // ── Load logs ──
  const loadLogs = useCallback(async () => {
    if (!isAdmin) return;
    setLLoading(true); setLErr("");
    try {
      const res = await fetch(`/api/admin/usage-logs?days=${logDays}`, { headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "불러오기 실패");
      setLogs(data.logs);
      setSummary(data.summary);
    } catch (e) { setLErr(e instanceof Error ? e.message : String(e)); }
    setLLoading(false);
  }, [isAdmin, logDays, authHeaders]);

  useEffect(() => { if (isAdmin && tab === "members") loadMembers(); }, [isAdmin, tab, loadMembers]);
  useEffect(() => { if (isAdmin && tab === "logs") loadLogs(); }, [isAdmin, tab, loadLogs]);

  // ── Grant / Revoke ──
  const toggleAccess = async (m: Member) => {
    setToggling(m.email);
    try {
      const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
      if (m.isAllowed) {
        await fetch("/api/admin/members", { method: "DELETE", headers, body: JSON.stringify({ email: m.email }) });
      } else {
        await fetch("/api/admin/members", {
          method: "POST", headers,
          body: JSON.stringify({ email: m.email, name: m.name, photoURL: m.photoURL, uid: m.uid }),
        });
      }
      await loadMembers();
    } catch { /* ignore */ }
    setToggling(null);
  };

  // ── Auth gate ──
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

  const filtered = members.filter(m => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return m.email.includes(q) || m.name.toLowerCase().includes(q);
  });

  const ownerCount = members.filter(m => m.isOwner).length;
  const allowedCount = members.filter(m => m.isAllowed && !m.isOwner).length;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "'Noto Sans KR',-apple-system,sans-serif", color: "#1F2937" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>

      {/* ── Nav ── */}
      <nav style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 20px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/admin" style={{ fontSize: 13, color: "#6B7280", textDecoration: "none", fontWeight: 600 }}>← 접속 통계</Link>
          <span style={{ fontSize: 15, fontWeight: 800 }}>👥 회원 관리</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {(["members", "logs"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: tab === t ? P : "#F1F5F9", color: tab === t ? "white" : "#6B7280" }}>
              {t === "members" ? "회원 관리" : "사용 로그"}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* ══════════ Tab: 회원 관리 ══════════ */}
        {tab === "members" && (
          <>
            {mLoading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>불러오는 중...</div>}
            {mErr && <div style={{ background: "#FEF2F2", color: "#DC2626", borderRadius: 12, padding: 14, fontSize: 13, marginBottom: 16 }}>⚠️ {mErr}</div>}

            {!mLoading && !mErr && (
              <>
                {/* 요약 카드 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 18 }}>
                  {[
                    ["전체 회원", members.length, "👥"],
                    ["소유자", ownerCount, "👑"],
                    ["서버키 허용", allowedCount, "🔓"],
                    ["일반 회원", members.length - ownerCount - allowedCount, "🔑"],
                  ].map(([t, v, ic]) => (
                    <div key={t as string} style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: "16px 18px" }}>
                      <div style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>{ic as string} {t as string}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{(v as number).toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* 검색 + 새로고침 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="이름 또는 이메일로 검색..."
                    style={{ flex: 1, padding: "10px 14px", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none" }}
                  />
                  <button onClick={loadMembers} style={{ padding: "10px 16px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>↻</button>
                </div>

                {/* 회원 목록 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filtered.map(m => (
                    <div key={m.uid} style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                      {/* 아바타 */}
                      <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {m.photoURL
                          ? <img src={m.photoURL} alt="" width={42} height={42} style={{ objectFit: "cover" }} referrerPolicy="no-referrer" />
                          : <span style={{ fontSize: 18 }}>👤</span>}
                      </div>

                      {/* 정보 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{m.name || "(이름 없음)"}</span>
                          {m.isOwner && <span style={{ fontSize: 10, fontWeight: 800, color: "#D97706", background: "#FEF3C7", padding: "2px 7px", borderRadius: 99 }}>소유자</span>}
                          {m.isAllowed && !m.isOwner && <span style={{ fontSize: 10, fontWeight: 800, color: GREEN, background: "#D1FAE5", padding: "2px 7px", borderRadius: 99 }}>서버키 허용</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                          가입 {fmtDate(m.createdAt)} · 최근 로그인 {fmtDate(m.lastSignIn)}
                        </div>
                      </div>

                      {/* 액션 */}
                      {!m.isOwner && (
                        <button
                          onClick={() => toggleAccess(m)}
                          disabled={toggling === m.email}
                          style={{
                            padding: "8px 16px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 700, cursor: toggling === m.email ? "wait" : "pointer", flexShrink: 0,
                            background: m.isAllowed ? "#FEE2E2" : `linear-gradient(135deg,${P},#A855F7)`,
                            color: m.isAllowed ? "#DC2626" : "white",
                          }}
                        >
                          {toggling === m.email ? "..." : m.isAllowed ? "권한 해제" : "권한 부여"}
                        </button>
                      )}
                    </div>
                  ))}

                  {filtered.length === 0 && (
                    <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 14 }}>
                      {search ? "검색 결과가 없습니다." : "등록된 회원이 없습니다."}
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 18, lineHeight: 1.7 }}>
                  ※ <b>서버키 허용</b>된 회원은 소유자와 동일하게 서버 API 키로 AI 도구를 무료 사용합니다. 일반 회원은 본인 API 키(BYOK)를 입력해야 합니다.
                </p>
              </>
            )}
          </>
        )}

        {/* ══════════ Tab: 사용 로그 ══════════ */}
        {tab === "logs" && (
          <>
            {/* 필터 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setLogDays(d)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: logDays === d ? P : "#F1F5F9", color: logDays === d ? "white" : "#6B7280" }}>{d}일</button>
              ))}
              <button onClick={loadLogs} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↻</button>
            </div>

            {lLoading && <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>불러오는 중...</div>}
            {lErr && <div style={{ background: "#FEF2F2", color: "#DC2626", borderRadius: 12, padding: 14, fontSize: 13, marginBottom: 16 }}>⚠️ {lErr}</div>}

            {!lLoading && summary && (
              <>
                {/* 요약 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 18 }}>
                  {[
                    ["총 호출", summary.total, "📊"],
                    ["서버키", summary.serverCount, "🔓"],
                    ["BYOK", summary.byokCount, "🔑"],
                    ["Google AI", summary.googleCount, "🟦"],
                    ["OpenAI", summary.openaiCount, "🟩"],
                  ].map(([t, v, ic]) => (
                    <div key={t as string} style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: "14px 16px" }}>
                      <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{ic as string} {t as string}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{(v as number).toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* 사용자별 / 엔드포인트별 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12, marginBottom: 18 }}>
                  <BarList title="👤 사용자별 호출 수" data={summary.topUsers} color={P} />
                  <BarList title="🔌 엔드포인트별 호출 수" data={summary.topEndpoints.map(e => ({ ...e, k: ENDPOINT_LABEL[e.k] || e.k }))} color="#0EA5E9" />
                </div>

                {/* 로그 테이블 */}
                <div style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>🕒 최근 사용 로그 ({logDays}일, 최대 1000건)</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: "#9CA3AF", textAlign: "left" }}>
                          {["시간", "사용자", "도구", "AI", "키 유형"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map(l => (
                          <tr key={l.id} style={{ borderTop: "1px solid #F1F5F9" }}>
                            <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: "#6B7280" }}>{fmtTime(l.ts)}</td>
                            <td style={{ padding: "7px 8px", fontWeight: 600 }}>{l.name || l.email}</td>
                            <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{ENDPOINT_LABEL[l.endpoint] || l.endpoint}</td>
                            <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: l.provider === "google" ? "#DBEAFE" : "#D1FAE5", color: l.provider === "google" ? "#2563EB" : "#059669" }}>
                                {l.provider === "google" ? "Google" : "OpenAI"}
                              </span>
                            </td>
                            <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: l.keySource === "server" ? "#FEF3C7" : "#F1F5F9", color: l.keySource === "server" ? "#D97706" : "#6B7280" }}>
                                {l.keySource === "server" ? "서버키" : "BYOK"}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {logs.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "#9CA3AF" }}>기간 내 사용 기록이 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 18, lineHeight: 1.7 }}>
                  ※ AI 도구를 호출할 때마다 자동 기록됩니다. <b>서버키</b>는 소유자 또는 허용된 사용자가 서버 API 키로 호출한 것, <b>BYOK</b>는 본인 키로 호출한 것입니다.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── 바 리스트 (AdminDashboard와 동일 패턴) ──
function BarList({ title, data, color = "#7C3AED" }: { title: string; data: KN[]; color?: string }) {
  const max = Math.max(1, ...data.map(d => d.n));
  return (
    <div style={{ background: "white", borderRadius: 14, border: "1px solid #E5E7EB", padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 12 }}>{title}</div>
      {data.length === 0 ? <div style={{ fontSize: 12, color: "#9CA3AF" }}>데이터 없음</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: "0 0 120px", fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.k}>{d.k}</span>
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
