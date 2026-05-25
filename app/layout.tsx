import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Storyboard Generator",
  description: "AI-powered multi-level cinematic storyboard generator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
