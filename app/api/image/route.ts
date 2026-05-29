import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) return NextResponse.json({ error: "No prompt provided" }, { status: 400 });

    const MODEL = "gpt-image-2";
    console.log("[image] model:", MODEL, "| prompt length:", prompt.length);

    const response = await openai.images.generate({
      model: MODEL,
      prompt,
      n: 1,
      size: "1024x1536",
      quality: "medium",
    });

    console.log("[image] done | usage:", JSON.stringify(response.usage ?? {}));

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned");

    return NextResponse.json({ imageUrl: `data:image/png;base64,${b64}`, model: MODEL });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
