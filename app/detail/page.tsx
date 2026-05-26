import { Suspense } from "react";
import DetailPageMaker from "@/components/DetailPageMaker";

export default function DetailPage() {
  return (
    <Suspense fallback={null}>
      <DetailPageMaker />
    </Suspense>
  );
}
