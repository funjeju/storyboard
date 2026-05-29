import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
export const maxDuration = 60;

const QUESTION_SYSTEM = `You are a MetaPrompt interviewer. Ask ONE focused question to gather information for generating a high-quality AI prompt.

RULES:
1. Output ONLY valid JSON — no markdown fences
2. Ask the single most useful question given what you know so far
3. Questions should progressively get more specific
4. Early questions (1-3): domain, subject, purpose
5. Mid questions (4-7): style, mood, reference, specific details
6. Late questions (8-10): fine details, constraints, special requests
7. Always ask in Korean, naturally and conversationally
8. question 2: always ask "참고할 이미지나 URL이 있으신가요? 있다면 첨부하거나 링크를 붙여넣어 주세요. 없으면 없다고 해주세요."

OUTPUT:
{
  "reasoning": "한 문장 — 왜 이 질문이 지금 가장 필요한가",
  "question": "질문 내용 (한국어)",
  "domain": "이미지생성 / 영상제작 / 음악생성 / 텍스트카피 / 범용AI / 미감지"
}`;

const PROMPT_SYSTEM = `You are a world-class prompt engineer. Based on the conversation history, generate the best possible prompt for the detected domain.

RULES:
1. Output ONLY valid JSON — no markdown fences
2. Generate a complete, specific, immediately usable prompt
3. For image generation: rich visual description with style, lighting, composition, color, mood, technical specs
4. For other domains: optimized for the specific tool/platform
5. Make it as detailed and specific as the collected info allows — fill gaps with sensible creative choices

OUTPUT:
{
  "domain": "이미지생성 / 텍스트카피 / 범용AI / etc",
  "finalPrompt": "The complete generated prompt",
  "reasoning": "한 문장 — 어떤 핵심 요소들로 프롬프트를 구성했는지"
}`;

export async function POST(req: NextRequest) {
  try {
    const { messages, mode } = await req.json() as {
      messages: { role: "user" | "assistant"; content: string }[];
      mode: "question" | "generate";
    };

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    if (mode === "generate") {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: PROMPT_SYSTEM,
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.8,
          responseMimeType: "application/json",
        } as never,
      });
      const result = await model.generateContent({ contents });
      const data = JSON.parse(result.response.text().trim());
      return NextResponse.json({ ...data, isDone: true });
    }

    // mode === "question"
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: QUESTION_SYSTEM,
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.7,
        responseMimeType: "application/json",
      } as never,
    });
    const result = await model.generateContent({ contents });
    const data = JSON.parse(result.response.text().trim());
    return NextResponse.json({ ...data, isDone: false });

  } catch (error) {
    console.error("MetaPrompt error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
