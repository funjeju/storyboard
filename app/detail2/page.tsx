import DetailPage2 from "@/components/DetailPage2";
import AiToolGate from "@/components/AiToolGate";

export default function Page() {
  return (
    <AiToolGate providers={["openai"]} toolName="상세페이지 2">
      <DetailPage2 />
    </AiToolGate>
  );
}
