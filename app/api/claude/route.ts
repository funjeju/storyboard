import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { resolveKey, keyErrorResponse } from "@/lib/aiKey";


export async function POST(req: NextRequest) {
  let __key = "";
  try { __key = await resolveKey(req, "google"); } catch (e) { const r = keyErrorResponse(e); if (r) return r; throw e; }
  const genAI = new GoogleGenerativeAI(__key);
  try {
    const { system, user, maxTokens = 32768 } = await req.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: system,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    });

    const text = result.response.text();
    return NextResponse.json({ text });
  } catch (error) {
    console.error("Gemini API error:", error);
    return NextResponse.json({ error: "Gemini API error" }, { status: 500 });
  }
}
