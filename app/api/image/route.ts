import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// Gemini 2.0 Flash image generation model
// Update to "gemini-2.5-flash" when Gemini 2.5 Flash image generation is GA
const GEMINI_IMAGE_MODEL = "gemini-2.0-flash-preview-image-generation";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_IMAGE_MODEL });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as any,
    });

    const parts = result.response.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any;
      if (p.inlineData?.data) {
        return NextResponse.json({
          imageUrl: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
        });
      }
    }

    return NextResponse.json({ error: "No image generated" }, { status: 500 });
  } catch (error) {
    console.error("Gemini image API error:", error);
    return NextResponse.json(
      { error: "Image generation failed" },
      { status: 500 }
    );
  }
}
