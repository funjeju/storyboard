"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  isOwnerEmail,
  getUserKey,
  setUserKey,
  PROVIDER_LABEL,
  PROVIDER_HELP,
  type AiProvider,
} from "@/lib/aiClient";

const P = "#7C3AED";
const PINK = "#EC4899";

/**
 * AI 도구 접근 게이트.
 * - 소유자 계정으로 로그인 → 서버 키로 무제한 사용
 * - 그 외 사용자 → 본인 API 키(BYOK)를 입력해야 사용 가능
 */
export default function AiToolGate({
  providers,
  toolName,
  children,
}: {
  providers: AiProvider[];
  toolName: string;
  children: ReactNode;
}) {
  const { user, loading, signIn } = useAuth();
  const owner = isOwnerEmail(user?.email);

  // localStorage에 저장된 키 상태 (마운트 후 로드 — SSR 불일치 방지)
  const [stored, setStored] = useState<Record<AiProvider, string>>({ google: "", openai: "" });
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<Record<AiProvider, string>>({ google: "", openai: "" });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const s = { google: getUserKey("google"), openai: getUserKey("openai") };
    setStored(s);
    setDraft(s);
    setMounted(true);
  }, []);

  // SSR/최초 렌더에서는 아무 것도 확정하지 않음 (깜빡임 방지)
  if (loading || !mounted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F6FA" }}>
        <div style={{ fontSize: 14, color: "#9CA3AF" }}>불러오는 중...</div>
      </div>
    );
  }

  const hasAllKeys = providers.every(p => (stored[p] || "").trim());

  const save = () => {
    providers.forEach(p => setUserKey(p, draft[p] || ""));
    setStored(prev => {
      const next = { ...prev };
      providers.forEach(p => { next[p] = (draft[p] || "").trim(); });
      return next;
    });
    setEditing(false);
  };

  // 소유자거나, 본인 키를 모두 입력한 경우 → 도구 사용 허용
  if (owner || (hasAllKeys && !editing)) {
    return (
      <>
        {!owner && (
          <div style={{ position: "fixed", right: 14, bottom: 14, zIndex: 9999 }}>
            <button
              onClick={() => setEditing(true)}
              title="본인 API 키로 실행 중"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "white", border: "1.5px solid #E5E7EB", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}
            >
              🔑 내 키로 실행 중 · 키 변경
            </button>
          </div>
        )}
        {children}
      </>
    );
  }

  // ── 게이트 화면 (비소유자 · 키 미입력 or 편집) ──
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F6FA", padding: 24, fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
      <div style={{ background: "white", borderRadius: 24, padding: "36px 30px", width: "100%", maxWidth: 460, boxShadow: "0 24px 80px rgba(0,0,0,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 42, marginBottom: 10 }}>🔑</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#111827", marginBottom: 8 }}>{toolName}</div>
          <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
            이 도구는 <b>소유자 전용</b>입니다.<br />
            사용하시려면 <b>본인의 API 키</b>를 입력하세요. 키는 이 브라우저에만 저장되며 서버에 보관되지 않습니다.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          {providers.map(p => (
            <label key={p} style={{ display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{PROVIDER_LABEL[p]} API 키</span>
                <a href={PROVIDER_HELP[p]} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: P, fontWeight: 600 }}>키 발급 ↗</a>
              </div>
              <input
                type="password"
                value={draft[p] || ""}
                onChange={e => setDraft(d => ({ ...d, [p]: e.target.value }))}
                placeholder={p === "google" ? "AIza..." : "sk-..."}
                autoComplete="off"
                style={{ width: "100%", padding: "11px 13px", border: "1.5px solid #E5E7EB", borderRadius: 11, fontSize: 14, fontFamily: "inherit", outline: "none" }}
              />
            </label>
          ))}
        </div>

        <button
          onClick={save}
          disabled={!providers.every(p => (draft[p] || "").trim())}
          style={{ width: "100%", padding: 13, background: providers.every(p => (draft[p] || "").trim()) ? `linear-gradient(135deg,${P},${PINK})` : "#D1D5DB", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "white", cursor: providers.every(p => (draft[p] || "").trim()) ? "pointer" : "not-allowed", boxShadow: `0 4px 16px rgba(124,58,237,0.25)` }}
        >
          키 저장 후 사용하기
        </button>

        {editing && (
          <button onClick={() => setEditing(false)} style={{ width: "100%", marginTop: 10, padding: 11, background: "white", border: "1.5px solid #E5E7EB", borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
            취소
          </button>
        )}

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>
          소유자이신가요?{" "}
          {user ? (
            <span>현재 <b>{user.email}</b> 계정입니다. 소유자 계정으로 다시 로그인해 주세요.</span>
          ) : (
            <button onClick={signIn} style={{ background: "none", border: "none", color: P, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Google로 로그인</button>
          )}
        </div>
        <div style={{ marginTop: 10, textAlign: "center" }}>
          <Link href="/" style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>← 홈으로</Link>
        </div>
      </div>
    </div>
  );
}
