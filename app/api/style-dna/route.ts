import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { images } = await req.json();
    // images: string[] ??base64 data URLs

    const imageParts = images.map((dataUrl: string) => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image format");
      return { inlineData: { mimeType: match[1], data: match[2] } };
    });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          ...imageParts,
          {
            text: `You are a visual style analyst for e-commerce product pages. Analyze these reference images and extract a consistent Style DNA.

Return ONLY valid JSON with this exact structure:
{
  "primaryColors": ["#hex1", "#hex2"],
  "secondaryColors": ["#hex1", "#hex2"],
  "lighting": "string describing lighting style (e.g. 'soft diffused natural light', 'dramatic studio lighting')",
  "background": "string describing background (e.g. 'clean white studio', 'warm wooden surface')",
  "composition": "string describing composition style (e.g. 'centered product, minimal props', 'lifestyle flat lay')",
  "mood": "string describing mood (e.g. 'premium luxury', 'playful and energetic')",
  "aesthetic": "string describing overall aesthetic (e.g. 'minimalist Scandinavian', 'bold streetwear')",
  "overallTone": "string (e.g. 'warm and inviting', 'cool and clinical')",
  "promptBase": "A concise English image generation prompt (40-60 words) that captures the consistent visual style: lighting, background, color palette, mood, and composition style ??WITHOUT naming specific products"
}`,
          },
        ],
      }],
    });

    const text = result.response.text().replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response: " + text.slice(0, 200));
    const dna = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ dna });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
