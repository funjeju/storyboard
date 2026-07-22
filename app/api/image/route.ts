import OpenAI, { toFile } from "openai";
import { NextRequest, NextResponse } from "next/server";
import { resolveKey, keyErrorResponse } from "@/lib/aiKey";


export async function POST(req: NextRequest) {
  let __key = "";
  try { __key = await resolveKey(req, "openai"); } catch (e) { const r = keyErrorResponse(e); if (r) return r; throw e; }
  const openai = new OpenAI({ apiKey: __key });
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
    console.log("[image] mode: generate | model:", MODEL, "| size:", reqSize ?? "1024x1536", "| q:", q, "| prompt length:", prompt.length);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gen = (sz: string) => openai.images.generate({ model: MODEL, prompt, n: 1, size: sz as any, quality: q });

    let response;
    let usedSize = reqSize ?? "1024x1536";
    try {
      response = await gen(usedSize);
    } catch (e) {
      // 임의 사이즈를 API가 거부하면 비율 맞는 표준 사이즈로 폴백
      const msg = e instanceof Error ? e.message : String(e);
      const sizeIssue = /size|dimension|invalid|unsupported|must be|one of|400/i.test(msg);
      if (reqSize && sizeIssue) {
        const [w, h] = reqSize.split("x").map(Number);
        usedSize = h > w * 1.2 ? "1024x1536" : w > h * 1.2 ? "1536x1024" : "1024x1024";
        console.warn(`[image] size '${reqSize}' rejected → fallback '${usedSize}'`);
        response = await gen(usedSize);
      } else {
        throw e;
      }
    }

    console.log("[image] generate done | size:", usedSize, "| usage:", JSON.stringify(response.usage ?? {}));
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned");

    return NextResponse.json({ imageUrl: `data:image/png;base64,${b64}`, model: MODEL, mode: "generate", size: usedSize });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[image] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
