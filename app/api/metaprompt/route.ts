import { NextRequest, NextResponse } from "next/server";
import { resolveKey, keyErrorResponse } from "@/lib/aiKey";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

function extractJSON(raw: string): unknown {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* try extraction */ }
  // Strip markdown fences
  const stripped = trimmed.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
  try { return JSON.parse(stripped); } catch { /* try regex */ }
  // Extract first {...} block
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fall through */ } }
  throw new Error(`JSON extraction failed. Raw (first 300): ${raw.slice(0, 300)}`);
}

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

MANDATORY — PROFESSIONAL ROLE PREFIX:
The very first line of finalPrompt MUST be a professional role declaration matching the domain.
Use exactly one of these prefixes (translate/adapt naturally):

- 이미지생성 (photo/illustration): "Envisioned by a world-class commercial art director and photographer. "
- 이미지생성 (graphic design/card/poster/logo): "Designed by a senior graphic designer with 20 years of brand identity experience. "
- 영상제작: "Directed by an award-winning cinematographer and creative director. "
- 음악생성: "Composed and produced by a Grammy-level music producer and sound designer. "
- 텍스트카피: "Written by a senior brand copywriter and conversion optimization specialist. "
- 범용AI: "Architected by a world-class prompt engineer and AI systems specialist. "
- 기타: "Created by a top-tier professional in the relevant domain. "

Pick the most fitting prefix for the user's specific request, then continue with the full prompt content.

OUTPUT:
{
  "domain": "이미지생성 / 텍스트카피 / 범용AI / etc",
  "finalPrompt": "[ROLE PREFIX] + [full detailed prompt]",
  "reasoning": "한 문장 — 어떤 핵심 요소들로 프롬프트를 구성했는지"
}`;

export async function POST(req: NextRequest) {
  let __key = "";
  try { __key = await resolveKey(req, "google"); } catch (e) { const r = keyErrorResponse(e); if (r) return r; throw e; }
  const genAI = new GoogleGenerativeAI(__key);
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
      // generate mode: use thinking model for best quality final prompt
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
      const raw = result.response.text();
      const data = extractJSON(raw) as Record<string, unknown>;
      return NextResponse.json({ ...data, isDone: true });
    }

    // mode === "question": gemini-2.5-flash with thinking disabled — fast stable JSON
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: QUESTION_SYSTEM,
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.7,
        responseMimeType: "application/json",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinkingConfig: { thinkingBudget: 0 },
      } as never,
    });
    const result = await model.generateContent({ contents });
    const raw = result.response.text();
    const data = extractJSON(raw) as Record<string, unknown>;
    return NextResponse.json({ ...data, isDone: false });

  } catch (error) {
    console.error("MetaPrompt error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
