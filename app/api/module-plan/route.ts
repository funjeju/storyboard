import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const { productInfo, research, tone } = await req.json();

    const model = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const researchContext = research ? `
전략 리서치 결과:
- 타겟 페르소나: ${JSON.stringify(research.targetPersona)}
- 핵심 감정 레버: ${JSON.stringify(research.coreEmotion)}
- 시장 포지션: ${research.marketPosition}
- 핵심 가치 제안: ${research.valueProposition}
- 근거 팩트: ${JSON.stringify(research.supportingFacts)}
` : "(리서치 없음 — 제품 정보만으로 편성)";

    const prompt = `당신은 전문 상세페이지 전략가입니다. 제품 본질과 전략 리서치를 기반으로 최적의 상세페이지 모듈 구성을 추천하세요.
플랫폼 최적화는 이후 별도 단계에서 적용됩니다. 여기서는 순수하게 이 제품이 설득에 필요한 모듈만 선정하세요.

제품 정보:
- 제품명: ${productInfo.name}
- 카테고리: ${productInfo.category}
- 가격대: ${productInfo.price}
- 타겟 고객: ${productInfo.targetAudience}
- 핵심 특징: ${productInfo.keyFeatures}
- 브랜드 보이스: ${productInfo.brandVoice}
${productInfo.productUrl ? `- 제품 URL: ${productInfo.productUrl}` : ""}
- 카피 톤: ${tone}

${researchContext}

사용 가능한 모듈 목록:
[Hook] hero_hook, strong_copy, problem_statement, pain_point
[신뢰] customer_reviews, expert_cert, clinical_results, origin, manufacturing, brand_story, before_after
[제품설명] feature_desc, ingredient_desc, comparison_table, usage_guide, option_desc, faq, product_detail, purchase_checklist
[감성] lifestyle_image, emotional_copy, usage_scenario, brand_philosophy
[전환] discount_benefit, limited_quantity, recommended_bundle, cta

모듈 설명:
- product_detail: 구성/용량/원재료/사용법/보관/유통기한/제조방식을 통합 테이블로. 식품·건강·화장품 카테고리에서 필수.
- purchase_checklist: 추천 대상/비추천 대상/주의사항/오해 방지. 구매 전 마지막 의심 제거.

편성 원칙:
- 반드시 7~12개 모듈 추천 (제품 복잡도에 따라 조정)
- 첫 번째는 반드시 hook 카테고리
- 마지막은 반드시 cta
- 리서치의 핵심 감정 레버와 구매 저항선을 반드시 반영
- 각 모듈에 점수(0~100)와 추천 이유(15자 이내) 제공

JSON만 반환:
{
  "strategy": "핵심 전략 한 줄 (25자 이내)",
  "modules": [
    { "moduleType": "hero_hook", "score": 95, "reason": "추천 이유" },
    ...
  ]
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const data = JSON.parse(text);

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
