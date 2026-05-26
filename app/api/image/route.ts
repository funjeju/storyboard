import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image-preview";

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

    const candidate = result.response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const parts = candidate?.content?.parts ?? [];

    for (const part of parts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any;
      if (p.inlineData?.data) {
        return NextResponse.json({
          imageUrl: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
        });
      }
    }

    const textPart = parts.find((p) => "text" in p)?.text || "";
    return NextResponse.json(
      {
        error: `No image in response (finishReason=${finishReason}). Model said: ${textPart.slice(0, 300) || "(empty)"}`,
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("Gemini image API error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Image API: ${msg}` }, { status: 500 });
  }
}
