"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

export default function AuthButton() {
  const { user, loading, signIn, signOut } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div style={{
        width: 80, height: 34, borderRadius: 10,
        background: "rgba(0,0,0,0.04)", animation: "pulse 1.5s ease-in-out infinite",
      }} />
    );
  }

  if (user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Library link */}
        <button
          onClick={() => router.push("/library")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 10,
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.2)",
            fontSize: 12, fontWeight: 600, color: "#059669",
            cursor: "pointer",
          }}
        >
          📚 마이 라이브러리
        </button>

        {/* Avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}
          onClick={() => router.push("/library")}>
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || ""}
              style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(124,58,237,0.3)" }}
            />
          ) : (
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg,#7C3AED,#EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "white",
            }}>
              {(user.displayName || user.email || "?")[0].toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 12, color: "#374151", fontWeight: 500, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "User"}
          </span>
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          style={{
            padding: "6px 12px", borderRadius: 10,
            background: "transparent", border: "1px solid #E5E7EB",
            fontSize: 11, fontWeight: 600, color: "#9CA3AF",
            cursor: "pointer",
          }}
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={signIn}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 18px", borderRadius: 10,
        background: "white", border: "1px solid #E5E7EB",
        fontSize: 13, fontWeight: 600, color: "#374151",
        cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.2s",
      }}
      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"}
      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Google로 로그인
    </button>
  );
}
