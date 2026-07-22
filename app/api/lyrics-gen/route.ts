import { NextRequest, NextResponse } from "next/server";
import { resolveKey, keyErrorResponse } from "@/lib/aiKey";
import { GoogleGenerativeAI } from "@google/generative-ai";


export const maxDuration = 60;

// 상황별 자동 서사 구조 매핑
const NARRATIVE_MAP: Record<string, { v1: string; v2: string; bridge: string; outro: string }> = {
  "첫만남":     { v1: "처음 마주친 순간의 감각적 묘사",     v2: "마음이 기울어지는 과정",              bridge: "말하지 못한 감정의 폭발",             outro: "여운 남는 설렘" },
  "썸":         { v1: "아직 확실하지 않은 감정",             v2: "조금씩 가까워지는 거리",              bridge: "고백 직전의 긴장감",                  outro: "어떻게 될지 모르는 설렘" },
  "짝사랑":     { v1: "혼자 바라보는 마음",                  v2: "멀리서 지켜보는 일상",                bridge: "감정이 터지는 순간",                  outro: "혼자 삭히는 여운" },
  "재회":       { v1: "오랜만에 마주친 순간",                v2: "예전 감정이 다시 올라오는 과정",       bridge: "변한 것과 변하지 않은 것의 충돌",      outro: "다시 시작할 수 있을까의 열린 결말" },
  "고백 직전":  { v1: "감정을 말해야 한다는 확신",           v2: "망설임과 용기 사이",                  bridge: "결심의 순간",                         outro: "고백하거나 못 하거나의 열린 결말" },
  "여행":       { v1: "낯선 곳에서의 자유로움",              v2: "그 순간 감정이 깊어짐",               bridge: "돌아가야 할 현실과의 대비",            outro: "여행이 남긴 흔적과 여운" },
  "멀어짐":     { v1: "조금씩 멀어지는 거리감",              v2: "그 사이에서 혼자 애쓰는 마음",        bridge: "더 이상 잡을 수 없다는 깨달음",        outro: "조용한 이별" },
  "기다림":     { v1: "기다리는 시간의 무게",                v2: "오지 않는 답에 지쳐가는 마음",        bridge: "기다림을 멈출 것인가의 선택",          outro: "기다림의 끝에 남는 것" },
  "이별 후":    { v1: "익숙하던 것들이 낯설어진 일상",       v2: "지워지지 않는 기억과 흔적",           bridge: "이제는 보내야 한다는 것",              outro: "홀로 서는 법을 배우는 과정" },
  "운명적 만남": { v1: "처음부터 다른 느낌",                 v2: "만날 수밖에 없었다는 확신",           bridge: "현실과 감정 사이의 갈등",              outro: "운명을 받아들이거나 거스르거나" },
};

export async function POST(req: NextRequest) {
  let __key = "";
  try { __key = await resolveKey(req, "google"); } catch (e) { const r = keyErrorResponse(e); if (r) return r; throw e; }
  const genAI = new GoogleGenerativeAI(__key);
  try {
    const body = await req.json();
    const {
      emotions = [],
      emotionIntensity = 60,
      situation = "",
      situationDetail = "",
      scenes = [],
      symbolKeywords = [],
      prohibitions = [],
      prohibitionCustom = "",
      hookStyles = [],
      expressionTone = 50,
      language = "한국어",
      lyricsInspiration = "", // 붙여넣은 영감 키워드/구절
      styleContext = null,    // Path B에서 스타일→가사
    } = body;

    const narrative = NARRATIVE_MAP[situation] || {
      v1: "상황의 시작과 첫 감각",
      v2: "감정이 쌓이고 깊어지는 과정",
      bridge: "전환점 또는 감정의 폭발",
      outro: "여운이 남는 열린 결말",
    };

    const intensityLabel =
      emotionIntensity >= 85 ? "극도로 강렬하게, 터질 듯이" :
      emotionIntensity >= 65 ? "강하게, 감정이 충분히 드러나게" :
      emotionIntensity >= 45 ? "중간 강도, 절제와 표현의 균형" :
      emotionIntensity >= 25 ? "잔잔하고 섬세하게" :
      "극도로 절제하여, 여백으로 표현";

    const toneLabel =
      expressionTone >= 80 ? "완전히 시적/은유적 (직접 언급 절대 금지, 모든 것을 장면과 감각으로)" :
      expressionTone >= 60 ? "은유 위주 (직설은 최소화, 이미지로 감정 전달)" :
      expressionTone >= 40 ? "자연스러운 혼합 (직설과 은유 균형)" :
      expressionTone >= 20 ? "약간 직설적이지만 감성적" :
      "직설적이고 솔직하게 (은유 최소화)";

    const lang = language === "영어" ? "English" : "Korean";

    const systemPrompt = `You are a ${lang} songwriter creating actual song lyrics for Suno AI.

CRITICAL RULES:
1. Output ONLY valid JSON, no markdown fences
2. Show scenes, don't explain emotions ("빗소리만 가득한 방" not "나는 슬프다")
3. Use symbol keywords repeatedly with variations throughout (파도→tide→물결→잠기다)
4. Follow the exact narrative structure provided
5. Never include prohibited elements
6. Lyrics must be complete and performable, not placeholders`;

    const allProhibitions = [...prohibitions, prohibitionCustom].filter(Boolean);

    const userMsg = `
SONG PARAMETERS:

[Core Emotions] ${emotions.length > 0 ? emotions.join(" + ") : "자유롭게"} | Intensity: ${intensityLabel} (${emotionIntensity}%)

[Situation] ${situation || "자유롭게"}
[Detail] ${situationDetail || lyricsInspiration || "없음"}

[Narrative Structure — FOLLOW EXACTLY]
• 1절 (Verse 1): ${narrative.v1}
• 2절 (Verse 2): ${narrative.v2}
• 브릿지 (Bridge): ${narrative.bridge}
• 아웃트로 (Outro/Last Chorus): ${narrative.outro}

[Background Scenes] ${scenes.length > 0 ? scenes.join(", ") : "자유롭게"}
[Symbol Keywords — MUST vary and repeat] ${symbolKeywords.length > 0 ? symbolKeywords.join(" / ") : "없음"}
[Hook/Chorus Style] ${hookStyles.length > 0 ? hookStyles.join(" + ") : "자유롭게"}
[Expression Tone] ${toneLabel}
[Language] ${language}

[ABSOLUTE PROHIBITIONS — Never include]
${allProhibitions.length > 0 ? allProhibitions.join(", ") : "없음"}

${styleContext ? `[Style Context from music style — use for tonal reference]
Genre: ${styleContext.genre || ""} | Mood: ${styleContext.mood || ""}
${styleContext.styleHint || ""}` : ""}

OUTPUT (JSON only):
{
  "lyrics": "Complete song lyrics with section labels like [Verse 1], [Chorus], [Verse 2], [Bridge], [Outro]. Minimum 200 characters.",
  "narrativeUsed": {
    "verse1": "1절에서 실제로 다룬 주제 (1줄)",
    "verse2": "2절에서 실제로 다룬 주제 (1줄)",
    "bridge": "브릿지에서 실제로 다룬 주제 (1줄)",
    "outro": "아웃트로에서 실제로 다룬 주제 (1줄)"
  },
  "symbolVariations": ["상징어 변주 예시 1", "상징어 변주 예시 2", "상징어 변주 예시 3"],
  "hookLine": "가장 기억에 남을 핵심 라인 (후렴의 핵심)"
}`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.88,
        responseMimeType: "application/json",
      } as never,
    });

    const result = await model.generateContent(systemPrompt + "\n\n" + userMsg);
    const data = JSON.parse(result.response.text().trim());

    return NextResponse.json({
      lyrics: data.lyrics,
      narrativeUsed: data.narrativeUsed,
      symbolVariations: data.symbolVariations || [],
      hookLine: data.hookLine || "",
      narrativeStructure: narrative,
    });
  } catch (error) {
    console.error("Lyrics gen error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
