import SunoMaker from "@/components/SunoMaker";
import AiToolGate from "@/components/AiToolGate";

export default function SunoPage() {
  return (
    <AiToolGate providers={["google", "openai"]} toolName="수노 뮤직 메이커">
      <SunoMaker />
    </AiToolGate>
  );
}
