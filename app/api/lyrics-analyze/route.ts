import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { text, type = "full" } = await req.json();
    // type: "full" = complete lyrics, "keywords" = phrases/keywords/inspiration

    const systemPrompt = `You are a music analyst specializing in extracting sonic DNA from lyrics.
Analyze the provided ${type === "full" ? "song lyrics" : "lyric keywords and phrases"} and extract musical context.
Output ONLY valid JSON — no markdown, no explanation.`;

    const userMsg = `Analyze this ${type === "full" ? "song lyrics" : "lyric inspiration text"} and extract style context for a Suno AI music prompt:

"${text}"

Output JSON:
{
  "genre": "best fitting genre in English (1-3 words, e.g. 'indie pop', 'R&B ballad')",
  "mood": "dominant mood in English (1-2 words, e.g. 'melancholic', 'bittersweet')",
  "atmosphere": "3-5 word sonic atmosphere in English (e.g. 'late night urban longing')",
  "emotionSummary": "one-line emotion description for Suno style prompt, English",
  "sceneKeywords": ["keyword1_en", "keyword2_en", "keyword3_en"],
  "styleHint": "1-2 sentence Suno style direction (e.g. 'hushed breathy vocals over sparse piano, intimate recording feel, space and silence as texture')",
  "suggestedMood": "Korean mood chip to pre-select (one of: 어둡고 강렬한, 밝고 경쾌한, 감성적인 / Emotional, 드라마틱한, 몽환적인, 그루비한, 웅장한 / Epic, 잔잔한 / Calm, 하이에너지, 로맨틱한, 우울한 / Melancholic, 신나는 / Upbeat)",
  "suggestedGenre": "genre chip to pre-select (one of: K-Pop, 팝 / Pop, 힙합 / Hip-Hop, R&B, 록 / Rock, 인디 / Indie, EDM, 재즈 / Jazz, 클래식 / Classical, 발라드 / Ballad, 트로트, 시티팝 / City Pop, Lo-Fi, Metal, Folk, Country)"
}`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.3,
        responseMimeType: "application/json",
      } as never,
    });

    const result = await model.generateContent(systemPrompt + "\n\n" + userMsg);
    const data = JSON.parse(result.response.text().trim());

    return NextResponse.json(data);
  } catch (error) {
    console.error("Lyrics analyze error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
