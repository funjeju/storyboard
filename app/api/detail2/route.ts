import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export const maxDuration = 120;

// 섹션별 고정 규격 (프롬프트 원문 기반). 860px 고정폭 + 목적별 대표 높이.
const SECTIONS = [
  { key: "hook",     ko: "Hook (모델 등장)",        model: true,  h: 2200 },
  { key: "problem",  ko: "문제 공감",                model: true,  h: 1800 },
  { key: "solution", ko: "해결 제안 (Before/After)", model: true,  h: 2000 },
  { key: "value1",   ko: "핵심가치 1",               model: false, h: 2000 },
  { key: "value2",   ko: "핵심가치 2",               model: true,  h: 2000 },
  { key: "value3",   ko: "핵심가치 3",               model: false, h: 2000 },
  { key: "value4",   ko: "핵심가치 4",               model: true,  h: 2000 },
  { key: "value5",   ko: "핵심가치 5",               model: false, h: 2000 },
  { key: "trust",    ko: "신뢰 요소",                model: false, h: 2600 },
  { key: "detail",   ko: "상세 정보 (표)",           model: false, h: 2800 },
  { key: "check",    ko: "구매 전 체크",             model: false, h: 1700 },
  { key: "cta",      ko: "CTA (행동 유도)",          model: true,  h: 1800 },
];

// 일시적 과부하(503/429/overloaded)면 backoff 후 재시도
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function genWithRetry(model: any, request: any, tries = 3): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await model.generateContent(request);
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      const transient = /(503|429|high demand|overloaded|unavailable)/i.test(msg);
      if (transient && i < tries - 1) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const brand: string = (b.brand || "").trim();
    const features: string = (b.features || "").trim();
    const category: string = (b.category || "").trim();
    const extra: string = (b.extra || "").trim();
    const m = b.model || {};
    const modelDesc = [
      m.gender && `gender: ${m.gender}`,
      m.age && `age: ${m.age}`,
      m.ageRange && `age range: ${m.ageRange}`,
      m.mood && `mood/expression: ${m.mood}`,
      m.situation && `usage situation: ${m.situation}`,
      m.ethnicity && `appearance: ${m.ethnicity}`,
    ].filter(Boolean).join(", ");

    if (!brand && !features) {
      return NextResponse.json({ error: "브랜드명 또는 제품 특징을 입력하세요." }, { status: 400 });
    }

    const sectionList = SECTIONS.map((s, i) => `${i + 1}. ${s.key} — ${s.ko} (860x${s.h}px${s.model ? ", 모델 등장" : ""})`).join("\n");

    const system = `당신은 네이버 스마트스토어 상세페이지를 제작하는 시니어 광고 디자이너이자 퍼포먼스 마케터입니다.
사용자가 제공한 상품 정보만으로 구매 전환을 극대화하는 "고밀도 설득 구조 상세페이지"의 장면별 이미지 생성 프롬프트를 자동 설계합니다.

[설득 구조 — 8단 흐름을 12장으로]
${sectionList}

[각 장면 필수 메시지 구조]
- mainCopy: 핵심 메시지 1개 (강력하게)
- subCopy: 설명 문장 1~2개
- points: 보조 포인트 3~5개
- trust: 신뢰/근거 요소 1개 이상 (없으면 제품 특징 기반으로 합리적으로)

[반복 설계] 같은 가치라도 상황(아침/저녁/직장/집/혼자/가족)·표현(감성/기능/비교/숫자)·시각(모델/클로즈업/사용장면/결과장면)을 다르게.

[신뢰 섹션 주의] 후기·평점·판매량은 사실이 없으면 지어내지 말고 "[실제 후기]" "[★N.N/5.0]" "[누적 N개]" 같은 자리표시자(placeholder)로 비워둘 것.

[상세정보 섹션] 표(Table) 형태로: 제품 구성/용량, 원재료/성분, 섭취방법, 보관방법, 제조방식, 유통기한, 주의사항.

[imagePrompt 규칙 — 핵심 출력]
- 영어로 작성. photorealistic, commercial product photography, natural lighting, minimal clean background (white/light gray), realistic texture, clean ecommerce design, generous whitespace, card-based layout. 과도한 연출 금지.
- 모델 등장 장면은 다음 모델을 묘사: ${modelDesc || "an appropriate Korean model fitting the product"}.
- 이미지 안에 들어갈 한국어 카피(mainCopy/subCopy/points)를 그대로 렌더링하도록 지시. 타이포: 헤드라인 굵고 크게, 본문 작게, 강조는 컬러+Bold.
- 세로 포맷(portrait), aspect ratio 860:${"{height}"}.

[출력 형식] 반드시 아래 JSON만 출력. 마크다운/설명 금지.
{
  "strategy": { "target":"...", "problem":"...", "values":["v1","v2","v3","v4","v5"], "trigger":"...", "tone":"...", "color":"..." },
  "scenes": [
    { "section":"hook", "mainCopy":"...", "subCopy":"...", "points":["..."], "trust":"...", "imagePrompt":"..." }
    // SECTIONS 순서대로 정확히 12개
  ]
}`;

    const user = `[상품 정보]
브랜드명: ${brand || "(미입력)"}
카테고리: ${category || "(미입력)"}
주요 특징:
${features || "(미입력)"}
추가 요청: ${extra || "없음"}

위 정보로 12장 장면을 설계해 JSON으로만 응답하세요.`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: system });
    const result = await genWithRetry(model, {
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 16384, responseMimeType: "application/json" },
    });

    let parsed: { strategy?: unknown; scenes?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());
    } catch {
      return NextResponse.json({ error: "프롬프트 생성 결과 파싱 실패. 다시 시도해주세요." }, { status: 502 });
    }

    const aiScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    // 고정 섹션/사이즈에 AI 카피를 매핑 (사이즈는 서버가 보장)
    const scenes = SECTIONS.map((s, i) => {
      const a = aiScenes[i] || aiScenes.find(x => x.section === s.key) || {};
      return {
        section: s.key,
        sectionKo: s.ko,
        width: 860,
        height: s.h,
        size: `860x${s.h}`,
        hasModel: s.model,
        mainCopy: (a.mainCopy as string) || "",
        subCopy: (a.subCopy as string) || "",
        points: Array.isArray(a.points) ? (a.points as string[]) : [],
        trust: (a.trust as string) || "",
        imagePrompt: ((a.imagePrompt as string) || "").trim(),
      };
    });

    return NextResponse.json({ strategy: parsed.strategy || null, scenes });
  } catch (e) {
    console.error("detail2 error:", e);
    const msg = String(e);
    if (/(503|429|high demand|overloaded|unavailable)/i.test(msg)) {
      return NextResponse.json({ error: "지금 Gemini가 일시적으로 혼잡해요. 30초쯤 뒤에 다시 시도해주세요. (자동 재시도 후에도 실패)" }, { status: 503 });
    }
    return NextResponse.json({ error: "설계 중 오류가 발생했어요. 다시 시도해주세요." }, { status: 500 });
  }
}
