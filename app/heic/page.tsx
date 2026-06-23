import type { Metadata } from "next";
import ConverterHub from "@/components/ConverterHub";
import { CONVERTERS, ALL_KEYWORDS } from "@/lib/convertSeo";

const SITE = "https://storyboard-ruddy-ten.vercel.app";
const URL = `${SITE}/heic`;
const TITLE = "무료 온라인 변환기 모음 | HEIC·이미지 압축·포맷·리사이즈·PDF 변환";
const DESC = "HEIC를 JPG로, 이미지 압축·포맷 변환(PNG/JPG/WebP)·리사이즈, 이미지→PDF, PDF 합치기까지. 설치·회원가입 없이 브라우저에서 무료로, 파일은 서버 업로드 없이 내 기기 안에서 안전하게 변환하세요.";

export const metadata: Metadata = {
  metadataBase: new globalThis.URL(SITE),
  title: TITLE,
  description: DESC,
  keywords: ALL_KEYWORDS,
  alternates: { canonical: URL },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: { type: "website", url: URL, siteName: "AI Studio", locale: "ko_KR", title: TITLE, description: DESC },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
  category: "tools",
};

export default function Page() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "무료 변환기 모음",
      url: URL,
      description: DESC,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web (Windows, macOS, iOS, Android)",
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
      featureList: CONVERTERS.map(c => c.h1),
      inLanguage: "ko",
    },
    ...CONVERTERS.map(c => ({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: `${c.h1} 방법`,
      step: c.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
    })),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: CONVERTERS.flatMap(c => c.faq).map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ConverterHub />
    </>
  );
}
