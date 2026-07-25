import type { Metadata } from "next";
import MemberDashboard from "@/components/MemberDashboard";

export const metadata: Metadata = {
  title: "회원 관리 · 사용 로그",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MemberDashboard />;
}
