import { Suspense } from "react";
import StoryboardApp from "@/components/StoryboardApp";

export default function StoryboardPage() {
  return (
    <Suspense fallback={null}>
      <StoryboardApp />
    </Suspense>
  );
}
