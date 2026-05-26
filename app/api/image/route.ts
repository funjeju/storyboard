import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_AI_API_KEY!;
const genAI = new GoogleGenerativeAI(API_KEY);

// Known candidate models for Gemini image generation (try in order).
// Names drift between preview / GA; we fall back through them.
const CANDIDATE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-exp",
];

// Cache the working model name for the lifetime of the serverless instance.
let resolvedModel: string | null = null;

async function listImageCapableModels(): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
  );
  if (!res.ok) return [];
  const data: {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  } = await res.json();
  return (data.models || [])
    .filter(
      (m) =>
        m.supportedGenerationMethods?.includes("generateContent") &&
        /image/i.test(m.name)
    )
    .map((m) => m.name.replace(/^models\//, ""));
}

async function tryGenerate(modelName: string, prompt: string) {
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as any,
  });
  const candidate = result.response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  for (const part of parts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = part as any;
    if (p.inlineData?.data) {
      return {
        imageUrl: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
      };
    }
  }
  const textPart = parts.find((p) => "text" in p)?.text || "";
  throw new Error(
    `No image in response (finishReason=${candidate?.finishReason}). Model said: ${textPart.slice(0, 200) || "(empty)"}`
  );
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    // Build attempt order: cached resolved model first, then candidates, then live discovery.
    const triedErrors: string[] = [];

    if (resolvedModel) {
      try {
        const out = await tryGenerate(resolvedModel, prompt);
        return NextResponse.json({ ...out, model: resolvedModel });
      } catch (e) {
        triedErrors.push(`${resolvedModel}: ${String(e).slice(0, 150)}`);
        resolvedModel = null;
      }
    }

    for (const m of CANDIDATE_MODELS) {
      try {
        const out = await tryGenerate(m, prompt);
        resolvedModel = m;
        return NextResponse.json({ ...out, model: m });
      } catch (e) {
        const msg = String(e);
        triedErrors.push(`${m}: ${msg.slice(0, 150)}`);
        // 404 = wrong name → keep trying. Other errors → also keep trying but record.
      }
    }

    // Last resort: ask the API which models actually exist.
    let discovered: string[] = [];
    try {
      discovered = await listImageCapableModels();
    } catch (e) {
      triedErrors.push(`listModels: ${String(e).slice(0, 150)}`);
    }

    for (const m of discovered) {
      if (CANDIDATE_MODELS.includes(m)) continue; // already tried
      try {
        const out = await tryGenerate(m, prompt);
        resolvedModel = m;
        return NextResponse.json({ ...out, model: m });
      } catch (e) {
        triedErrors.push(`${m}: ${String(e).slice(0, 150)}`);
      }
    }

    return NextResponse.json(
      {
        error: "All image model candidates failed.",
        discovered,
        attempts: triedErrors,
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("Gemini image API error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Image API: ${msg}` }, { status: 500 });
  }
}
