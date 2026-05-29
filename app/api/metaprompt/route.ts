import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
export const maxDuration = 60;

const SYSTEM = `You are a MetaPrompt engine. Your job is to interview the user briefly, then generate a high-quality prompt for any AI tool (image generation, video, music, text, etc.).

CRITICAL RULES:
1. Output ONLY valid JSON — no markdown fences
2. Ask ONE focused question at a time
3. MAXIMUM 4 questions total — you MUST generate after 4 questions no matter what
4. If the user has given enough info (even after 2-3 questions), generate immediately — don't over-ask
5. If the user says "바로 생성해줘" or similar, set isDone=true immediately
6. The final prompt must be specific, detailed, and immediately usable
7. stepTotal is ALWAYS 4 (fixed) — never increase it

WHEN TO STOP ASKING:
- You have subject + style/mood + at least one specific detail → generate now
- You've asked 4 questions → generate now, period
- User explicitly asks to generate → generate now

DOMAIN EXAMPLES:
- Image: Midjourney/DALL-E style — subject, style, lighting, composition, mood, color palette
- Video: Kling/Runway/Sora — scene description, motion, atmosphere, duration
- Music: Suno — genre, mood, tempo, instruments, vocal style
- Text/Copy: purpose, tone, audience, format, key message
- General AI: clear task with context and constraints

OUTPUT FORMAT:
{
  "reasoning": "한 문장 — 어떤 정보가 아직 없어서 이 질문을 하는지",
  "question": "다음 질문 (한국어, 짧고 명확하게)",
  "stepCurrent": 1,
  "stepTotal": 4,
  "isDone": false,
  "domain": "이미지생성 / 영상제작 / 음악생성 / 텍스트카피 / 범용AI / 미감지",
  "finalPrompt": null
}

When isDone=true:
{
  "reasoning": "충분한 정보가 수집됐습니다",
  "question": null,
  "stepCurrent": 4,
  "stepTotal": 4,
  "isDone": true,
  "domain": "이미지생성",
  "finalPrompt": "Complete, detailed, ready-to-use prompt for the detected domain"
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

    // Server-side hard cap: force generation after 4 questions
    const userTurns = messages.filter(m => m.role === "user").length;
    if (!data.isDone && userTurns >= 4) {
      const forceRes = await model.generateContent({
        systemInstruction: SYSTEM,
        contents: [
          ...contents,
          { role: "model", parts: [{ text: JSON.stringify(data) }] },
          { role: "user", parts: [{ text: "지금까지 수집된 정보로 바로 최종 프롬프트를 생성해줘. isDone을 true로 설정하고 finalPrompt를 작성해줘." }] },
        ],
      });
      const forced = JSON.parse(forceRes.response.text().trim());
      forced.isDone = true;
      forced.stepCurrent = 4;
      forced.stepTotal = 4;
      return NextResponse.json(forced);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("MetaPrompt error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
