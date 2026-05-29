import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const { productInfo, platform, tone } = await req.json();

    const model = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const prompt = `당신은 전문 상세페이지 전략가입니다. 제품 정보를 분석하여 최적의 상세페이지 모듈 구성을 추천하세요.

제품 정보:
- 제품명: ${productInfo.name}
- 카테고리: ${productInfo.category}
- 가격대: ${productInfo.price}
- 타겟 고객: ${productInfo.targetAudience}
- 핵심 특징: ${productInfo.keyFeatures}
- 브랜드 보이스: ${productInfo.brandVoice}
- 판매 플랫폼: ${platform}
- 카피 톤: ${tone}

사용 가능한 모듈 목록:
[Hook] hero_hook, strong_copy, problem_statement, pain_point
[신뢰] customer_reviews, expert_cert, clinical_results, origin, manufacturing, brand_story, before_after
[제품설명] feature_desc, ingredient_desc, comparison_table, usage_guide, option_desc, faq
[감성] lifestyle_image, emotional_copy, usage_scenario, brand_philosophy
[전환] discount_benefit, limited_quantity, recommended_bundle, cta

플랫폼 특성:
- smartstore: 정보+신뢰 중심
- coupang: 빠른 설득, 가격/배송 강조
- wadiz: 스토리텔링, 크라우드펀딩 스타일
- instagram: 감성 비주얼, 짧고 강렬
- shopify: 글로벌, 깔끔한 정보
- cafe24: 종합몰, 상세 정보

규칙:
- 반드시 7~9개 모듈 추천
- 첫 번째는 반드시 hook 카테고리
- 마지막은 반드시 cta
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
