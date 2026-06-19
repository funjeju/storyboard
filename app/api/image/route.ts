import OpenAI, { toFile } from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { prompt, refImageBase64, size, quality } = await req.json();
    if (!prompt) return NextResponse.json({ error: "No prompt provided" }, { status: 400 });

    const MODEL = "gpt-image-2";
    // 요청에서 받은 size("860x2400" 등)를 그대로 사용. 형식이 아니면 기본값.
    const reqSize = typeof size === "string" && /^\d{2,5}x\d{2,5}$/.test(size) ? size : null;
    // 이미지 품질 (low/medium/high). 잘못된 값이면 medium.
    const q = (["low", "medium", "high", "auto"].includes(quality) ? quality : "medium") as "low" | "medium" | "high" | "auto";

    if (refImageBase64) {
      // Reference image mode → images.edit
      console.log("[image] mode: edit (ref image) | model:", MODEL, "| prompt length:", prompt.length);
      const base64Data = (refImageBase64 as string).replace(/^data:image\/[^;]+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const mimeMatch = (refImageBase64 as string).match(/^data:(image\/[^;]+);base64,/);
      const mimeType = (mimeMatch?.[1] ?? "image/png") as "image/png" | "image/jpeg" | "image/webp";
      const ext = mimeType === "image/jpeg" ? "reference.jpg" : mimeType === "image/webp" ? "reference.webp" : "reference.png";
      const imageFile = await toFile(imageBuffer, ext, { type: mimeType });

      const response = await openai.images.edit({
        model: MODEL,
        image: imageFile,
        prompt,
        n: 1,
        size: "1024x1024",
        quality: q,
      });

      console.log("[image] edit done | usage:", JSON.stringify(response.usage ?? {}));
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new Error("No image data returned from edit");
      return NextResponse.json({ imageUrl: `data:image/png;base64,${b64}`, model: MODEL, mode: "edit" });
    }

    // Standard text-to-image
    console.log("[image] mode: generate | model:", MODEL, "| prompt length:", prompt.length);
    const response = await openai.images.generate({
      model: MODEL,
      prompt,
      n: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      size: (reqSize ?? "1024x1536") as any,
      quality: "medium",
    });

    console.log("[image] generate done | usage:", JSON.stringify(response.usage ?? {}));
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned");

    return NextResponse.json({ imageUrl: `data:image/png;base64,${b64}`, model: MODEL, mode: "generate" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
