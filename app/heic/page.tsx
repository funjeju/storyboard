import type { Metadata } from "next";
import HeicConverter from "@/components/HeicConverter";
import { HEIC_KEYWORDS, HEIC_FAQ, HEIC_STEPS } from "@/lib/heicSeo";

const SITE = "https://storyboard-ruddy-ten.vercel.app";
const URL = `${SITE}/heic`;
const TITLE = "HEIC를 JPG로 무료 변환 | 아이폰 HEIC 사진 변환기 (설치 없이 온라인)";
const DESC = "아이폰 HEIC(HEIF) 사진을 JPG로 무료 변환하세요. 설치·회원가입 없이 브라우저에서 바로, 한 번에 최대 5장까지. 사진은 서버 업로드 없이 내 기기 안에서 안전하게 변환됩니다. HEIC 안 열림 문제를 1초 만에 해결.";

export const metadata: Metadata = {
  metadataBase: new globalThis.URL(SITE),
  title: TITLE,
  description: DESC,
  keywords: HEIC_KEYWORDS,
  alternates: { canonical: URL },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    type: "website", url: URL, siteName: "AI Studio", locale: "ko_KR",
    title: TITLE, description: DESC,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
  category: "tools",
};

export default function Page() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "HEIC JPG 변환기",
      url: URL,
      description: DESC,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web (Windows, macOS, iOS, Android)",
      browserRequirements: "Requires a modern web browser",
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
      featureList: ["HEIC를 JPG로 무료 변환", "한 번에 최대 5장 일괄 변환", "설치·회원가입 불필요", "기기 내 변환으로 사진 비공개·안전", "고화질 품질 조절"],
      inLanguage: "ko",
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "HEIC를 JPG로 변환하는 방법",
      description: "아이폰 HEIC 사진을 무료로 JPG로 변환하는 3단계.",
      step: HEIC_STEPS.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HEIC_FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HeicConverter />
    </>
  );
}
