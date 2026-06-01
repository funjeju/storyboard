import { Suspense } from "react";
import UrlShortener from "@/components/UrlShortener";

export default function UrlPage() {
  return (
    <Suspense>
      <UrlShortener />
    </Suspense>
  );
}
