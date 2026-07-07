import type { Metadata } from "next";
import QrGenerator from "@/components/QrGenerator";

export const metadata: Metadata = {
  title: "QR 코드 생성기 — 웹 주소를 QR로 | AI Studio",
  description: "웹사이트 주소를 넣으면 QR 코드를 즉시 생성합니다. 생성 이력 저장, 이름·주소 수정, 다운로드, 삭제까지 한 곳에서.",
};

export default function QrPage() {
  return <QrGenerator />;
}
