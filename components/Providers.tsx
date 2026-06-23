"use client";

import { type ReactNode } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import Analytics from "@/components/Analytics";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Analytics />
      {children}
    </AuthProvider>
  );
}
