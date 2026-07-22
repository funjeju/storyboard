import { Suspense } from "react";
import DetailPageMaker from "@/components/DetailPageMaker";
import AiToolGate from "@/components/AiToolGate";

export default function DetailPage() {
  return (
    <AiToolGate providers={["google", "openai"]} toolName="상세페이지 메이커">
      <Suspense fallback={null}>
        <DetailPageMaker />
      </Suspense>
    </AiToolGate>
  );
}
