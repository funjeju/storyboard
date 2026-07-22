import ThumbnailMaker from "@/components/ThumbnailMaker";
import AiToolGate from "@/components/AiToolGate";

export default function ThumbnailPage() {
  return (
    <AiToolGate providers={["google"]} toolName="유튜브 썸네일 메이커">
      <ThumbnailMaker />
    </AiToolGate>
  );
}
