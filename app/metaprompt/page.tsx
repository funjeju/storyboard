import MetaPrompt from "@/components/MetaPrompt";
import AiToolGate from "@/components/AiToolGate";

export default function MetaPromptPage() {
  return (
    <AiToolGate providers={["google", "openai"]} toolName="메타 프롬프트">
      <MetaPrompt />
    </AiToolGate>
  );
}
