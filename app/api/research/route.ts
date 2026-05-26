import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { productInfo } = await req.json();

    const system = `You are a senior Korean e-commerce STRATEGIST and consumer researcher.

You produce a UNIFIED strategic brief for an entire product detail page (covering all 9 standard sections at once).
You do NOT write finished marketing copy — you provide the strategy and angles a copywriter will execute against.

If a finished headline, bullet, or testimonial slips into your output, you have failed.
Frame outputs as "the angle should be X because Y" — never the actual headline text.

Respond in Korean for text content, but keep JSON keys in English.
Product context: ${JSON.stringify(productInfo)}`;

    const prompt = `Produce ONE unified strategic research brief for this product's detail page.
This single brief will be reused as the foundation for ALL 9 page sections — so it must be product-wide, not section-specific.

Required JSON structure (all keys English, all values Korean):

{
  "targetPersona": {
    "demographic": "1-2 sentence profile (age, lifestyle, context)",
    "mindset": "what mental state they're in when they land on this page",
    "motivations": "what they're really trying to achieve by buying this",
    "hesitations": "what holds them back from clicking buy"
  },
  "coreEmotion": {
    "emotion": "the single strongest emotional lever (e.g. 'regret avoidance', 'guilt-free indulgence')",
    "reasoning": "why this emotion is the most powerful one for THIS product and persona"
  },
  "marketPosition": "where this product sits competitively — what alternatives buyers are comparing it against, and the positioning angle",
  "valueProposition": "one-sentence strategic positioning (NOT a tagline, NOT marketing copy)",
  "supportingFacts": [
    "5-8 concrete facts, claims, or insights that the copy can anchor on (specific numbers, ingredients, certifications, use cases — be concrete)"
  ],
  "sectionGuidance": {
    "hook": { "angle": "strategic angle the headline should attack", "emotion": "specific feeling to evoke", "openingStrategy": "how the opening should land" },
    "usp": { "topDifferentiators": [{"point": "differentiator", "why": "why this matters to the persona", "proof": "what proof is needed"}], "rankingLogic": "why this order" },
    "problemSolution": { "primaryPain": "the #1 unspoken pain", "painSymptoms": ["3-5 daily symptoms"], "transformation": "the before→after emotional shift" },
    "specs": { "decisionDrivers": ["3-4 specs that actually drive purchase, with reasoning"], "groupingLogic": "how to structure remaining specs for scannability" },
    "lifestyle": { "aspirationalMoment": "the moment of use that's most aspirational", "sceneDirection": "tone + setting direction for the lifestyle image" },
    "options": { "decisionLogic": "how buyers choose between variants", "bestValueRationale": "which option to push as best value and why" },
    "reviews": { "skepticPersona": {"profile": "...", "doubts": "..."}, "enthusiastPersona": {"profile": "...", "raveAbout": "..."}, "thirdPersona": {"profile": "...", "angle": "..."} },
    "faq": { "hiddenObjections": ["6 unstated doubts blocking conversion — deeper than surface questions"] },
    "cta": { "residualDoubt": "the last doubt standing before the click", "urgencyType": "which urgency mechanic fits this product's truth", "closingTone": "final emotional register and why" }
  }
}

Return ONLY this JSON. No markdown, no commentary.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: system,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 32768, responseMimeType: "application/json" },
    });

    const candidate = result.response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const text = (candidate?.content?.parts?.[0]?.text || "").trim();

    if (!text) {
      throw new Error(`Empty response from Gemini. finishReason=${finishReason}`);
    }

    let research;
    try {
      research = JSON.parse(text);
    } catch (parseErr) {
      throw new Error(`JSON parse failed (finishReason=${finishReason}): ${String(parseErr).slice(0, 100)} | head: ${text.slice(0, 300)}`);
    }

    return NextResponse.json({ research });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
