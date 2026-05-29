import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
export const maxDuration = 60;

const SYSTEM = `You are a MetaPrompt engine. Your job is to interview the user to gather enough information to generate a high-quality, specific prompt for any AI tool (image generation, video, music, text, etc.).

RULES:
1. Output ONLY valid JSON — no markdown fences
2. Ask ONE focused question at a time
3. Estimate how many total questions are needed (3-5 typically)
4. Show your reasoning briefly (1 sentence, what info is still missing)
5. When you have enough info, set isDone=true and generate the final prompt
6. The final prompt must be specific, detailed, and immediately usable

DOMAIN EXAMPLES:
- Image: Midjourney/DALL-E style prompt with style, lighting, composition, mood
- Video: Kling/Runway/Sora style with scene, motion, duration, atmosphere
- Music: Suno style with genre, mood, tempo, instruments, vocal
- Text/Copy: Purpose, tone, audience, format
- General AI: Clear task description with context and constraints

OUTPUT FORMAT:
{
  "reasoning": "한 문장으로 — 지금 어떤 정보가 부족해서 이 질문을 하는지",
  "question": "사용자에게 던질 다음 질문 (한국어, 자연스럽게)",
  "stepCurrent": 1,
  "stepTotal": 4,
  "isDone": false,
  "domain": "감지된 도메인 (이미지생성 / 영상제작 / 음악생성 / 텍스트/카피 / 범용AI / 미감지)",
  "finalPrompt": null
}

When isDone=true:
{
  "reasoning": "모든 정보가 수집됐습니다",
  "question": null,
  "stepCurrent": 4,
  "stepTotal": 4,
  "isDone": true,
  "domain": "이미지생성",
  "finalPrompt": "Complete, detailed, ready-to-use prompt in the appropriate language/format for the detected domain"
}`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json() as {
      messages: { role: "user" | "assistant"; content: string }[];
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
        responseMimeType: "application/json",
      } as never,
    });

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const result = await model.generateContent({
      systemInstruction: SYSTEM,
      contents,
    });

    const data = JSON.parse(result.response.text().trim());
    return NextResponse.json(data);
  } catch (error) {
    console.error("MetaPrompt error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
