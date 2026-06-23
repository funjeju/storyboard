"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

function getVid(): string {
  try {
    let v = localStorage.getItem("v_vid");
    if (!v) { v = crypto.randomUUID(); localStorage.setItem("v_vid", v); }
    return v;
  } catch { return "anon"; }
}

export default function Analytics() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lastPath = useRef<string>("");

  useEffect(() => {
    if (!pathname) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    // auth가 자리잡을 시간을 약간 두고 1회 기록
    const t = setTimeout(() => {
      let ref = "직접/북마크";
      if (document.referrer) {
        try { ref = new URL(document.referrer).hostname; } catch { ref = document.referrer; }
        if (ref.includes(location.hostname)) ref = "내부 이동";
      }
      const body = {
        path: pathname,
        ref,
        vid: getVid(),
        uid: user?.uid || null,
        email: user?.email || null,
        name: user?.displayName || null,
        lang: navigator.language || "",
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
    }, 700);

    return () => clearTimeout(t);
  }, [pathname, user]);

  return null;
}
