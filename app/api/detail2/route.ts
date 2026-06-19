import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// 카테고리 표준 프리셋 — 상세정보 표 항목/톤/인물 기본값만 다르게
const CATEGORIES: Record<string, { label: string; specs: string[]; persona: "with" | "product"; tone: string }> = {
  food:    { label: "식품 · 건강식품",   specs: ["제품 구성/용량", "원재료/성분", "섭취 방법", "보관 방법", "유통기한", "인증/원산지", "주의사항"], persona: "with",    tone: "신뢰감 있고 건강한, 깨끗한" },
  beauty:  { label: "뷰티 · 화장품",     specs: ["제품 구성/용량", "전성분", "사용 방법", "사용 부위/피부타입", "용량", "유통기한", "주의사항"], persona: "with",    tone: "감각적이고 청결한, 고급스러운" },
  fashion: { label: "패션 · 의류 · 잡화", specs: ["소재/혼용률", "사이즈/실측", "세탁·관리법", "구성/색상", "핏/스타일", "주의사항"],          persona: "with",    tone: "트렌디하고 감성적인" },
  digital: { label: "전자 · 가전 · 디지털", specs: ["주요 사양(스펙)", "구성품", "전압/규격", "호환성", "A/S·보증", "주의사항"],              persona: "product", tone: "모던하고 정밀한, 테크" },
  living:  { label: "리빙 · 생활 · 기타", specs: ["소재/재질", "규격/크기", "구성", "사용·관리법", "주의사항"],                              persona: "product", tone: "깔끔하고 실용적인" },
};

// 일시적 과부하(503/429/overloaded)면 backoff 후 재시도
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      const transient = /(503|429|high demand|overloaded|unavailable|rate limit)/i.test(msg);
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
    const extra: string = (b.extra || "").trim();
    const categoryKey: string = (b.categoryKey || "auto").trim();
    const modelMode: string = (b.modelMode || "auto").trim(); // auto | with | without
    const m = b.model || {};
    const modelDesc = [
      m.gender && `gender: ${m.gender}`,
      m.age && `age: ${m.age}`,
      m.ageRange && `age range: ${m.ageRange}`,
      m.mood && `mood/expression: ${m.mood}`,
      m.situation && `usage situation: ${m.situation}`,
    ].filter(Boolean).join(", ");

    if (!brand && !features) {
      return NextResponse.json({ error: "브랜드명 또는 제품 특징을 입력하세요." }, { status: 400 });
    }

    // 카테고리 프리셋 (없거나 auto면 범용 + AI 판단)
    const cat = CATEGORIES[categoryKey] || null;
    const specs = cat ? cat.specs : ["제품 구성/용량", "주요 성분/소재", "사용 방법", "보관/관리", "주의사항"];
    const catLabel = cat ? cat.label : "자동 판단";
    const toneHint = cat ? cat.tone : "";

    // 인물(모델) 포함 정책
    const usePeople =
      modelMode === "without" ? false :
      modelMode === "with" ? true :
      (cat ? cat.persona === "with" : true); // auto = 카테고리 기본값

    // 인물 미포함이면 모든 섹션 model 플래그 off
    const effSections = SECTIONS.map(s => ({ ...s, model: usePeople ? s.model : false }));
    const sectionList = effSections.map((s, i) => `${i + 1}. ${s.key} — ${s.ko} (860x${s.h}px${s.model ? ", 모델 등장" : ", 제품 단독/오브제 중심"})`).join("\n");

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

[제품 카테고리] ${catLabel}${cat ? "" : " — 제품 특징을 보고 카테고리를 스스로 판단해 적절한 스펙 항목으로 구성"}
[상세정보 섹션] 표(Table) 형태로 다음 항목 위주로 구성(해당 없는 항목은 빼고, 제품에 맞게 가감): ${specs.join(", ")}.
${toneHint ? `[톤] ${toneHint} 분위기를 유지.` : ""}

[imagePrompt 규칙 — 핵심 출력]
- 영어로 작성. photorealistic, commercial product photography, natural lighting, minimal clean background (white/light gray), realistic texture, clean ecommerce design, generous whitespace, card-based layout. 과도한 연출 금지.
${usePeople
  ? `- "모델 등장" 표시된 장면만 다음 인물을 묘사: ${modelDesc || "an appropriate Korean model fitting the product"}. 나머지는 제품 중심.`
  : `- 이 상품은 인물 없이 진행: 이미지에 사람/모델/손/신체를 절대 넣지 말 것. 제품 단독 컷, 디테일 클로즈업, 오브제 스타일링, 사용 결과(제품만) 중심으로 연출.`}
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
카테고리: ${catLabel}
인물(모델) 포함: ${usePeople ? "예" : "아니오 (사람 없이)"}
주요 특징:
${features || "(미입력)"}
추가 요청: ${extra || "없음"}

위 정보로 12장 장면을 설계해 JSON으로만 응답하세요.`;

    const completion = await withRetry(() => openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      max_tokens: 16384,
      temperature: 0.8,
    }));

    let parsed: { strategy?: unknown; scenes?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse((completion.choices[0]?.message?.content || "").replace(/```json|```/g, "").trim());
    } catch {
      return NextResponse.json({ error: "프롬프트 생성 결과 파싱 실패. 다시 시도해주세요." }, { status: 502 });
    }

    const aiScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    // 고정 섹션/사이즈에 AI 카피를 매핑 (사이즈는 서버가 보장)
    const scenes = effSections.map((s, i) => {
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
    if (/(503|429|high demand|overloaded|unavailable|rate limit)/i.test(msg)) {
      return NextResponse.json({ error: "지금 AI 서버가 일시적으로 혼잡해요. 30초쯤 뒤에 다시 시도해주세요. (자동 재시도 후에도 실패)" }, { status: 503 });
    }
    return NextResponse.json({ error: "설계 중 오류가 발생했어요. 다시 시도해주세요." }, { status: 500 });
  }
}
