import { Suspense } from "react";
import StoryboardApp from "@/components/StoryboardApp";
import AiToolGate from "@/components/AiToolGate";

export default function StoryboardPage() {
  return (
    <AiToolGate providers={["google", "openai"]} toolName="스토리보드 제너레이터">
      <Suspense fallback={null}>
        <StoryboardApp />
      </Suspense>
    </AiToolGate>
  );
}
