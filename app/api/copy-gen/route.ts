import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const TONE_DESCRIPTIONS: Record<string, string> = {
  premium: "고급스럽고 권위있는 톤. 품질과 가치를 강조. 신뢰와 격조 있는 어조.",
  friendly: "따뜻하고 친근한 톤. 대화하듯 자연스럽게. 공감과 친밀감 중심.",
  urgent: "긴박감과 행동 촉구. FOMO 활용. 한정성과 즉시 행동 강조.",
  informative: "정보 중심, 객관적 어조. 데이터와 사실 강조. 전문성과 신뢰도.",
  emotional: "감성적이고 스토리텔링 중심. 공감과 변화의 감동. 라이프스타일 이미지.",
  playful: "가볍고 유쾌한 톤. 위트와 재미. 젊고 트렌디한 어조.",
};

const SECTION_COPY_PROMPTS: Record<string, string> = {
  hook: `Write the HOOK section copy. This is the first text the buyer sees — it must stop the scroll.
This copy will overlay the hero image. Keep it tight and impactful.
Format: { headline: string (≤15자, the scroll-stopper), subheadline: string (≤30자, the support), body: string (2-3 짧은 문장, 본론 진입) }`,

  usp: `Write the USP section copy (핵심 차별점).
This text accompanies a feature-focused image. Each USP must be scannable.
Format: { title: string (섹션 제목), usps: { icon: string (이모지 1자), text: string (≤20자 핵심), detail: string (≤40자 부연) }[] (3-4개), support: string (≤50자 마무리) }`,

  problemSolution: `Write the problem-solution copy (문제해결).
This overlays a before/after or transformation image.
Format: { problemHeader: string (≤25자, 문제 직시), painDescription: string (2문장, 공감), solutionReveal: string (≤30자, 해결책 등장), transformation: string (2문장, 달라지는 일상) }`,

  specs: `Write product specifications copy (제품사양).
This overlays a clean detail/technical image.
Format: { intro: string (≤40자, 사양으로 들어가는 도입), specs: { label: string, value: string }[] (5-7개), highlight: string (≤40자, 핵심 사양 callout) }`,

  lifestyle: `Write lifestyle copy (라이프스타일).
This overlays an aspirational lifestyle scene. Evoke the feeling, don't sell.
Format: { headline: string (≤25자, 동경하는 순간), scenarios: { title: string (≤15자), copy: string (2-3 문장, 그 순간 묘사) }[] (2개), closing: string (≤40자, 감성 마무리) }`,

  options: `Write product options & promo copy (옵션/혜택).
This overlays an option lineup or flat-lay image.
Format: { intro: string (≤40자), options: { name: string, description: string (≤40자) }[], bestValue: string (≤25자, 최고 가성비 배지), promo: string (≤60자, 혜택 callout) }`,

  reviews: `Write social proof copy (고객후기).
This overlays a customer/usage image. Testimonials must sound real, not marketing.
Format: { headline: string (≤25자), testimonials: { name: string, quote: string (1-2 자연스러운 문장), rating: number }[] (3개), trust: string (≤50자, 신뢰 마무리) }`,

  faq: `Write FAQ copy.
This overlays a clean info-graphic image. Answers must build confidence, not just inform.
Format: { faqs: { q: string (≤30자), a: string (1-2 문장, 명확) }[] (5-6개) }`,

  cta: `Write a high-converting CTA copy (구매하기).
This overlays the final closing hero image.
Format: { headline: string (≤20자, 마지막 한 방), ctaText: string (≤10자, 버튼 문구), urgency: string (≤30자, 행동 촉구), guarantee: string (≤40자, 신뢰 보장) }`,
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

    // Extract section-specific guidance from the unified research brief.
    const sectionGuidance = research?.sectionGuidance?.[sectionType];

    const system = `You are Korea's top e-commerce copywriter specializing in high-converting product detail pages.

TONE: ${toneDesc}
PLATFORM: ${platformNote}
PRODUCT: ${JSON.stringify(productInfo)}

═══════════════════════════════════════════════
UNIFIED STRATEGIC BRIEF (shared across all 9 sections):
${research ? JSON.stringify({
  targetPersona: research.targetPersona,
  coreEmotion: research.coreEmotion,
  marketPosition: research.marketPosition,
  valueProposition: research.valueProposition,
  supportingFacts: research.supportingFacts,
}, null, 2) : "(no research — work from product info only)"}

THIS SECTION'S SPECIFIC GUIDANCE (sectionGuidance.${sectionType}):
${sectionGuidance ? JSON.stringify(sectionGuidance, null, 2) : "(no section-specific guidance — derive from unified brief)"}
═══════════════════════════════════════════════

HOW TO USE THE BRIEF:
- The unified brief is shared across ALL sections — so your copy must feel like part of a coherent whole, speaking to the SAME persona with the SAME core emotion.
- The section-specific guidance tells you the angle for THIS section in particular. Follow it.
- Anchor concrete claims in supportingFacts (don't invent numbers).
- Match the buyer's mindset and motivations from targetPersona.
- Don't ignore the brief — every line should be traceable back to it.

REMEMBER: This copy will overlay an image. Keep text TIGHT — character limits exist for a reason. Make every word earn its place.

Return ONLY valid JSON in the format requested.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: system,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: copyPrompt }] }],
      generationConfig: { maxOutputTokens: 32768, responseMimeType: "application/json" },
    });

    const candidate = result.response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const text = (candidate?.content?.parts?.[0]?.text || "").trim();

    if (!text) {
      throw new Error(`Empty response from Gemini. finishReason=${finishReason}`);
    }

    let copy;
    try {
      copy = JSON.parse(text);
    } catch (parseErr) {
      throw new Error(`JSON parse failed (finishReason=${finishReason}): ${String(parseErr).slice(0, 100)} | head: ${text.slice(0, 300)}`);
    }

    return NextResponse.json({ copy });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
