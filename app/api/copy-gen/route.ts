import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TONE_DESCRIPTIONS: Record<string, string> = {
  premium: "고급스럽고 권위있는 톤. 품질과 가치를 강조. 신뢰와 격조 있는 어조.",
  friendly: "따뜻하고 친근한 톤. 대화하듯 자연스럽게. 공감과 친밀감 중심.",
  urgent: "긴박감과 행동 촉구. FOMO 활용. 한정성과 즉시 행동 강조.",
  informative: "정보 중심, 객관적 어조. 데이터와 사실 강조. 전문성과 신뢰도.",
  emotional: "감성적이고 스토리텔링 중심. 공감과 변화의 감동. 라이프스타일 이미지.",
  playful: "가볍고 유쾌한 톤. 위트와 재미. 젊고 트렌디한 어조.",
};

const SECTION_COPY_PROMPTS: Record<string, string> = {
  hook: `Write a compelling hook section for a Korean shopping mall product page.
Include: main headline (15자 이내), subheadline (30자 이내), opening body copy (2-3 sentences).
Format: { headline: string, subheadline: string, body: string }`,

  usp: `Write a USP (핵심 차별점) section.
Include: section title, 3-4 USP bullets with icons/emoji, supporting statement.
Format: { title: string, usps: { icon: string, text: string, detail: string }[], support: string }`,

  problemSolution: `Write a problem-solution section (문제해결).
Include: problem statement header, pain point description, solution reveal, transformation statement.
Format: { problemHeader: string, painDescription: string, solutionReveal: string, transformation: string }`,

  specs: `Write product specifications section (제품사양).
Include: section intro, spec table rows (label + value), highlight callout.
Format: { intro: string, specs: { label: string, value: string }[], highlight: string }`,

  lifestyle: `Write a lifestyle section (라이프스타일).
Include: aspirational headline, 2 scenario descriptions, emotional closing.
Format: { headline: string, scenarios: { title: string, copy: string }[], closing: string }`,

  options: `Write a product options & promo section (옵션/혜택).
Include: options intro, option descriptions, best-value badge text, promo callout.
Format: { intro: string, options: { name: string, description: string }[], bestValue: string, promo: string }`,

  reviews: `Write a social proof section (고객후기).
Include: section headline, 3 testimonial quotes with ratings, trust statement.
Format: { headline: string, testimonials: { name: string, quote: string, rating: number }[], trust: string }`,

  faq: `Write a FAQ section.
Include: 5-6 Q&A pairs optimized for conversion.
Format: { faqs: { q: string, a: string }[] }`,

  cta: `Write a high-converting CTA section (구매하기).
Include: closing headline, main CTA text, urgency element, guarantee statement.
Format: { headline: string, ctaText: string, urgency: string, guarantee: string }`,
};

export async function POST(req: NextRequest) {
  try {
    const { sectionType, tone, productInfo, research, platform } = await req.json();

    const toneDesc = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.friendly;
    const copyPrompt = SECTION_COPY_PROMPTS[sectionType];
    if (!copyPrompt) return NextResponse.json({ error: "Unknown section type" }, { status: 400 });

    const platformNote = platform === "coupang"
      ? "쿠팡 최적화: 간결하고 직접적인 문구, 혜택 중심."
      : platform === "wadiz"
      ? "와디즈 최적화: 스토리텔링과 공감 중심, 서포터 관점."
      : platform === "shopify"
      ? "Shopify 최적화: 글로벌 감성, 영문 혼용 가능."
      : "스마트스토어 최적화: 네이버 검색 친화적, 상세하고 신뢰감 있는 어조.";

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: `You are Korea's top e-commerce copywriter specializing in high-converting product detail pages.

TONE: ${toneDesc}
PLATFORM: ${platformNote}
PRODUCT: ${JSON.stringify(productInfo)}
RESEARCH INSIGHTS: ${research ? JSON.stringify(research) : "없음"}

Rules:
- Write in Korean (한국어)
- Tone must be consistent throughout
- Focus on conversion and emotional resonance
- Return ONLY valid JSON`,
      messages: [{ role: "user", content: copyPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const copy = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ copy });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
