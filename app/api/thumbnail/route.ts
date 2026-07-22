import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { resolveKey, keyErrorResponse } from "@/lib/aiKey";


export async function POST(req: NextRequest) {
  let __key = "";
  try { __key = await resolveKey(req, "google"); } catch (e) { const r = keyErrorResponse(e); if (r) return r; throw e; }
  const genAI = new GoogleGenerativeAI(__key);
  try {
    const body = await req.json();
    const { mode, ...inputs } = body;

    const system = mode === "music"
      ? `당신은 유튜브 음악 썸네일 전문 마케팅 AI입니다.
수노(Suno) 스타일 프롬프트와 가사를 분석하여, 유튜브 CTR(클릭률)을 극대화하는 썸네일 이미지 생성 프롬프트를 제작합니다.

분석 원칙:
- 장르, 감정선, 계절감, 시간대, 장소, 분위기, 색채 키워드를 추출
- 타겟 청취자의 심리와 클릭 동기를 분석
- 유튜브 상위 음악 채널의 공통 패턴(명암대비, 중앙집중, 시선유도) 적용
- 감정 → 시각 변환: 행복→여행, 설렘→노을, 외로움→창가, 회상→필름, 자유→드라이브
- CTR 강화 요소: 얼굴 클로즈업, 역광, 노을, 네온, 빛망울, 색상대비 자동 판단

출력 형식 (JSON):
{
  "analysis": {
    "genre": "장르",
    "emotion": "핵심 감정",
    "visual_keywords": ["시각 키워드 배열"],
    "season_time": "계절/시간대",
    "color_palette": ["색상 키워드"],
    "ctr_elements": ["CTR 강화 요소"],
    "concept": "썸네일 콘셉트 한 줄 설명"
  },
  "prompts": {
    "midjourney": "Midjourney 프롬프트 (영문, 파라미터 포함)",
    "flux": "Flux/Stable Diffusion 프롬프트 (영문)",
    "ideogram": "Ideogram 프롬프트 (영문, 텍스트 오버레이 포함)",
    "gpt_image": "GPT Image / DALL-E 프롬프트 (영문)"
  },
  "text_overlay": {
    "main": "썸네일 메인 텍스트 (한국어, 10자 이내)",
    "sub": "서브 텍스트 (선택, 한국어)"
  },
  "branding_tip": "플레이리스트 브랜딩 팁"
}`
      : `당신은 유튜브 썸네일 전문 마케팅 AI입니다.
영상 정보를 분석하여 유튜브 CTR(클릭률)을 극대화하는 썸네일 이미지 생성 프롬프트를 제작합니다.

분석 원칙:
- 콘텐츠의 핵심 메시지와 감정을 시각화
- 타겟 시청자의 클릭 심리(궁금증, 공감, 이상향) 자극
- 유튜브 알고리즘이 선호하는 구도(명암대비, 중앙집중, 시선유도) 적용
- 모바일 화면에서도 식별 가능한 단순하고 강렬한 구성
- CTR 강화 요소: 표정, 텍스트 위치, 색상 대비, 배경 처리

출력 형식 (JSON):
{
  "analysis": {
    "content_type": "콘텐츠 유형",
    "hook": "클릭 유도 핵심 포인트",
    "visual_keywords": ["시각 키워드 배열"],
    "emotion": "자극할 감정",
    "color_palette": ["색상 키워드"],
    "ctr_elements": ["CTR 강화 요소"],
    "concept": "썸네일 콘셉트 한 줄 설명"
  },
  "prompts": {
    "midjourney": "Midjourney 프롬프트 (영문, 파라미터 포함)",
    "flux": "Flux/Stable Diffusion 프롬프트 (영문)",
    "ideogram": "Ideogram 프롬프트 (영문, 텍스트 오버레이 포함)",
    "gpt_image": "GPT Image / DALL-E 프롬프트 (영문)"
  },
  "text_overlay": {
    "main": "썸네일 메인 텍스트 (한국어, 15자 이내)",
    "sub": "서브 텍스트 (선택, 한국어)"
  },
  "branding_tip": "채널 브랜딩 팁"
}`;

    const userPrompt = mode === "music"
      ? `음악 정보를 분석하여 CTR 최적화 썸네일 프롬프트를 생성하세요.

음악 제목: ${inputs.title}
수노 스타일 프롬프트: ${inputs.stylePrompt}
가사: ${inputs.lyrics}
타겟 청취자: ${inputs.target || "20-30대 한국인"}
플레이리스트 시리즈: ${inputs.playlist || "없음"}
메인 컬러: ${inputs.mainColor || "자동 선택"}
`
      : `영상 정보를 분석하여 CTR 최적화 썸네일 프롬프트를 생성하세요.

영상 제목: ${inputs.title}
영상 설명/내용: ${inputs.description}
콘텐츠 유형: ${inputs.contentType || "일반"}
타겟 시청자: ${inputs.target || "전체"}
채널 분위기: ${inputs.channelVibe || "자동 선택"}
원하는 분위기: ${inputs.mood || "자동 선택"}
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: system,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Thumbnail API error:", error);
    return NextResponse.json({ error: "생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
