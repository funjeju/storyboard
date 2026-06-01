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

const MODULE_COPY_PROMPTS: Record<string, string> = {
  // ── Hook ──────────────────────────────────────────────────────────────────
  hero_hook: `Write a HERO HOOK section — the very first text the buyer sees. Must stop the scroll instantly.
Format: { "headline": string (≤15자, 강렬한 훅), "subheadline": string (≤30자, 호기심 증폭), "body": string (2-3 짧은 문장, 본론 진입) }`,

  strong_copy: `Write a STRONG COPY section — bold statement that immediately hooks with the product's strongest claim.
Format: { "statement": string (≤20자, 핵심 주장), "support": string (≤40자, 근거 한 줄), "detail": string (2-3 문장, 구체 설명) }`,

  problem_statement: `Write a PROBLEM STATEMENT section — surface the buyer's pain point they secretly relate to.
Format: { "problemHeader": string (≤25자, 문제 직시), "painPoints": string[] (3개, 각 ≤25자, 공감 포인트), "bridge": string (≤30자, 해결책 암시) }`,

  pain_point: `Write a PAIN POINT section — deep empathy copy that makes the reader feel understood.
Format: { "hook": string (≤20자, 찌르는 질문), "empathy": string (2-3 문장, 공감 스토리), "pivot": string (≤30자, 전환점) }`,

  // ── Trust ─────────────────────────────────────────────────────────────────
  customer_reviews: `Write CUSTOMER REVIEWS section copy — testimonials that sound real, not marketing.
Format: { "headline": string (≤25자), "testimonials": [{ "name": string, "quote": string (1-2 자연스러운 문장), "rating": number (4-5) }] (3개), "trust": string (≤50자, 신뢰 마무리) }`,

  expert_cert: `Write EXPERT CERTIFICATION section — authority and credibility through expert endorsement.
Format: { "certTitle": string (≤20자), "expertName": string, "credential": string (≤30자), "endorsement": string (2-3 문장, 전문가 의견), "badge": string (≤15자, 인증 뱃지 문구) }`,

  clinical_results: `Write CLINICAL RESULTS section — data-driven credibility with specific numbers.
Format: { "headline": string (≤25자), "stats": [{ "number": string, "label": string (≤20자), "detail": string (≤30자) }] (3-4개), "disclaimer": string (≤40자, 임상 근거) }`,

  origin: `Write ORIGIN / 원산지 section — provenance story that builds trust through authenticity.
Format: { "title": string (≤20자), "story": string (2-3 문장, 원산지 스토리), "highlights": string[] (3개, 각 ≤25자, 원산지 강점), "closing": string (≤30자) }`,

  manufacturing: `Write MANUFACTURING / 제조과정 section — behind-the-scenes quality assurance.
Format: { "title": string (≤20자), "process": [{ "step": string (≤10자), "desc": string (≤30자) }] (3-4 단계), "quality": string (≤40자, 품질 보증 문구) }`,

  brand_story: `Write BRAND STORY section — emotional narrative of why this brand exists.
Format: { "title": string (≤20자), "story": string (3-4 문장, 브랜드 탄생 스토리), "mission": string (≤30자, 브랜드 미션), "promise": string (≤30자, 고객 약속) }`,

  before_after: `Write BEFORE / AFTER section — transformation narrative with vivid contrast.
Format: { "beforeTitle": string (≤15자), "before": string (2 문장, 변화 전 상황), "afterTitle": string (≤15자), "after": string (2 문장, 변화 후 모습), "result": string (≤25자, 핵심 변화) }`,

  // ── Product ───────────────────────────────────────────────────────────────
  feature_desc: `Write FEATURE DESCRIPTION section — scannable product features with clear benefits.
Format: { "title": string (≤20자), "features": [{ "icon": string (이모지), "name": string (≤15자), "benefit": string (≤30자) }] (4-5개), "summary": string (≤40자) }`,

  ingredient_desc: `Write INGREDIENT / 성분 DESCRIPTION section — ingredient transparency that builds trust.
Format: { "title": string (≤20자), "intro": string (≤40자), "ingredients": [{ "name": string, "benefit": string (≤30자) }] (4-5개), "safety": string (≤40자, 안전성 문구) }`,

  comparison_table: `Write COMPARISON TABLE section — competitive differentiation in favor of this product.
Format: { "title": string (≤20자), "headers": ["항목", "우리 제품", "일반 제품"], "rows": [{ "item": string (≤15자), "ours": string (≤20자), "theirs": string (≤20자) }] (4-5개), "conclusion": string (≤30자) }`,

  usage_guide: `Write USAGE GUIDE section — simple how-to that reduces purchase anxiety.
Format: { "title": string (≤20자), "steps": [{ "num": number, "action": string (≤15자), "tip": string (≤30자) }] (3-4 단계), "result": string (≤30자, 사용 결과) }`,

  option_desc: `Write OPTION DESCRIPTION section — help buyers choose the right option confidently.
Format: { "title": string (≤20자), "options": [{ "name": string, "desc": string (≤30자), "bestFor": string (≤20자) }] (2-4개), "recommendation": string (≤30자, 추천 픽) }`,

  faq: `Write FAQ section — answer the questions that block purchase decisions.
Format: { "faqs": [{ "q": string (≤30자), "a": string (1-2 문장, 명확) }] (5-6개) }`,

  // ── Emotional ─────────────────────────────────────────────────────────────
  lifestyle_image: `Write LIFESTYLE IMAGE section — aspirational copy that sells the feeling, not the product.
Format: { "headline": string (≤25자, 동경하는 순간), "scenarios": [{ "title": string (≤15자), "copy": string (2-3 문장, 그 순간 묘사) }] (2개), "closing": string (≤40자, 감성 마무리) }`,

  emotional_copy: `Write EMOTIONAL COPY section — heart-touching narrative that creates an emotional bond.
Format: { "opening": string (≤25자, 감성 오프닝), "story": string (3-4 문장, 감성 스토리), "resonance": string (≤30자, 공감 마무리) }`,

  usage_scenario: `Write USAGE SCENARIO section — vivid scene of the product in real life.
Format: { "title": string (≤20자), "scenes": [{ "moment": string (≤15자), "desc": string (2 문장, 상황 묘사) }] (2-3개), "invitation": string (≤30자, 독자 초대) }`,

  brand_philosophy: `Write BRAND PHILOSOPHY section — the deeper purpose and values behind the brand.
Format: { "title": string (≤20자), "philosophy": string (2-3 문장, 브랜드 철학), "values": string[] (3개, 각 ≤15자, 핵심 가치), "commitment": string (≤30자, 다짐) }`,

  // ── Conversion ────────────────────────────────────────────────────────────
  discount_benefit: `Write DISCOUNT BENEFIT section — price advantage framing that creates value perception.
Format: { "title": string (≤20자), "mainBenefit": string (≤30자, 핵심 혜택), "benefits": [{ "icon": string (이모지), "text": string (≤25자) }] (3-4개), "urgency": string (≤25자, 마감 촉구) }`,

  limited_quantity: `Write LIMITED QUANTITY section — scarcity-driven urgency without feeling manipulative.
Format: { "alert": string (≤20자, 한정 알림), "reason": string (≤30자, 한정 이유), "remaining": string (≤15자, 재고 현황), "cta": string (≤10자) }`,

  recommended_bundle: `Write RECOMMENDED BUNDLE section — upsell with genuine value framing.
Format: { "title": string (≤20자), "bundles": [{ "name": string, "items": string[], "saving": string (≤20자, 절약 혜택), "tag": string (≤10자, 추천 뱃지) }] (2-3개), "bestPick": string (≤25자) }`,

  cta: `Write a high-converting CTA section — the final push to purchase.
Format: { "headline": string (≤20자, 마지막 한 방), "ctaText": string (≤10자, 버튼 문구), "urgency": string (≤30자, 행동 촉구), "guarantee": string (≤40자, 신뢰 보장), "trustAnchor": string (≤40자) }`,

  // ── New modules ────────────────────────────────────────────────────────────
  product_detail: `Write a PRODUCT DETAIL TABLE section — the complete purchase-decision spec sheet. One image, one complete reference.
Format: { "title": string (≤20자, 예: "상품 상세 정보"), "specs": [{ "label": string (≤12자), "value": string (≤30자) }] (6-8개, 제품 구성/용량/원재료/사용법/보관법/유통기한/제조방식 포함), "highlight": string (≤40자, 핵심 스펙 한 줄 강조), "trustAnchor": string (≤40자, 인증·원산지·검사 결과 등 신뢰 근거) }`,

  purchase_checklist: `Write a PURCHASE CHECKLIST section — eliminate final doubt, confirm product fit before clicking buy.
Format: { "title": string (≤20자, 예: "구매 전 확인하세요"), "recommended": string[] (3개, 각 ≤20자, 추천 대상 — 구체적 상황/인물), "notRecommended": string[] (2개, 각 ≤20자, 비추천 대상 — 솔직하게), "cautions": string[] (2-3개, 각 ≤25자, 실질적 주의사항), "clarification": string (≤40자, 가장 흔한 오해 방지 한 줄), "trustAnchor": string (≤40자) }`,

  // ── Legacy section types (backward compat) ────────────────────────────────
  hook: `Write the HOOK section copy. Format: { "headline": string (≤15자), "subheadline": string (≤30자), "body": string (2-3 문장) }`,
  usp: `Write the USP section copy. Format: { "title": string, "usps": [{ "icon": string, "text": string (≤20자), "detail": string (≤40자) }] (3-4개), "support": string (≤50자) }`,
  problemSolution: `Write problem-solution copy. Format: { "problemHeader": string (≤25자), "painDescription": string, "solutionReveal": string (≤30자), "transformation": string }`,
  specs: `Write product specs copy. Format: { "intro": string (≤40자), "specs": [{ "label": string, "value": string }] (5-7개), "highlight": string (≤40자) }`,
  lifestyle: `Write lifestyle copy. Format: { "headline": string (≤25자), "scenarios": [{ "title": string (≤15자), "copy": string }] (2개), "closing": string (≤40자) }`,
  options: `Write options & promo copy. Format: { "intro": string (≤40자), "options": [{ "name": string, "description": string (≤40자) }], "bestValue": string (≤25자), "promo": string (≤60자) }`,
  reviews: `Write social proof copy. Format: { "headline": string (≤25자), "testimonials": [{ "name": string, "quote": string, "rating": number }] (3개), "trust": string (≤50자) }`,
};

export async function POST(req: NextRequest) {
  try {
    const { sectionType, tone, productInfo, research, platform, styleDNA, copy: existingCopy, sectionGuidance, lockedSectionPrompts } = await req.json();

    const toneDesc = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.friendly;
    const copyPrompt = MODULE_COPY_PROMPTS[sectionType];
    if (!copyPrompt) return NextResponse.json({ error: "Unknown section type" }, { status: 400 });

    const platformNote = platform === "coupang"
      ? "쿠팡 최적화: 간결하고 직접적인 문구, 혜택·가격 중심. 카피는 짧고 임팩트 있게. 텍스트 밀도 낮게."
      : platform === "wadiz"
      ? "와디즈 최적화: 스토리텔링과 공감 중심, 서포터 관점. 감성적 서술 허용."
      : platform === "shopify"
      ? "Shopify 최적화: 글로벌 감성, 영문 혼용 가능. 깔끔하고 명확한 정보 전달."
      : platform === "instagram"
      ? "인스타그램 최적화: 짧고 강렬, 감성 비주얼 중심. 텍스트 최소화, 임팩트 집중."
      : platform === "cafe24"
      ? "카페24 최적화: 종합몰 스타일. 상세 스펙과 신뢰 정보를 풍부하게. 텍스트 밀도 높게."
      : "스마트스토어 최적화: 네이버 검색 친화적. 텍스트 밀도 높게, 표 구조 강화, 신뢰 구간 길게. 구체적 수치와 근거 필수.";

    const specificGuidance = sectionGuidance?.[sectionType];

    const system = `You are Korea's top e-commerce copywriter specializing in high-converting product detail pages.

TONE: ${toneDesc}
PLATFORM: ${platformNote}
PRODUCT: ${JSON.stringify(productInfo)}
${styleDNA ? `STYLE DNA: ${JSON.stringify(styleDNA)}` : ""}

═══════════════════════════════════════════════
UNIFIED STRATEGIC BRIEF:
${research ? JSON.stringify({
  targetPersona: research.targetPersona,
  coreEmotion: research.coreEmotion,
  marketPosition: research.marketPosition,
  valueProposition: research.valueProposition,
  supportingFacts: research.supportingFacts,
}, null, 2) : "(no research — work from product info only)"}

THIS SECTION'S SPECIFIC GUIDANCE:
${specificGuidance ? JSON.stringify(specificGuidance, null, 2) : "(derive from unified brief)"}
${lockedSectionPrompts?.length ? `\nLOCKED COPY FROM OTHER SECTIONS (maintain consistency):\n${JSON.stringify(lockedSectionPrompts, null, 2)}` : ""}
${existingCopy ? `\nEXISTING COPY (improve or regenerate):\n${JSON.stringify(existingCopy, null, 2)}` : ""}
═══════════════════════════════════════════════

HOW TO USE THE BRIEF:
- Copy must feel like part of a coherent whole across all modules.
- Anchor concrete claims in supportingFacts — don't invent numbers.
- Match buyer mindset from targetPersona.
- Keep text TIGHT — character limits exist for a reason.

══════════════════════════════════════════════
UNIVERSAL RULE — 한 이미지 = 하나의 설득 완결:
모든 섹션의 JSON에는 반드시 "trustAnchor" 필드가 포함되어야 합니다.
trustAnchor: 이 섹션을 뒷받침하는 신뢰/근거 요소 (≤40자)
예) "국산 원료 100%", "누적 판매 10만개 돌파", "식약처 인증 원료", "농림부 GAP 인증 농가 직송"
이 필드 없는 응답은 불완전한 설득 구조입니다. 반드시 포함할 것.
══════════════════════════════════════════════

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

    if (!text) throw new Error(`Empty response from Gemini. finishReason=${finishReason}`);

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
