import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const SECTION_IMAGE_CONTEXT: Record<string, string> = {
  hook: "Hero product shot, full bleed, maximum impact. Product as the star.",
  usp: "Clean feature highlight, minimal distractions, product detail focus.",
  problemSolution: "Before/after visual or transformation imagery. Emotional contrast.",
  specs: "Technical detail shot, precise and clinical. Material and craftsmanship focus.",
  lifestyle: "Lifestyle scene with product in natural use context. Aspirational setting.",
  options: "Flat lay or arranged product variants. Color/size comparison layout.",
  reviews: "Happy customer/lifestyle usage imagery. Warm and authentic feel.",
  faq: "Infographic style or simple product detail. Clear and reassuring.",
  cta: "Strong closing product hero shot. Aspirational and desire-inducing.",
};

export async function POST(req: NextRequest) {
  try {
    const { sectionType, productInfo, styleDNA, lockedSectionPrompts, copy } = await req.json();

    const sectionContext = SECTION_IMAGE_CONTEXT[sectionType] || "Product photography.";
    const cumulativeRef = lockedSectionPrompts && lockedSectionPrompts.length > 0
      ? `\n\nVisual continuity from previous sections:\n${lockedSectionPrompts.slice(-3).join("\n")}`
      : "";

    const dnaContext = styleDNA
      ? `\n\nSTYLE DNA (must follow exactly):
- Lighting: ${styleDNA.lighting}
- Background: ${styleDNA.background}
- Color palette: ${[...styleDNA.primaryColors, ...styleDNA.secondaryColors].join(", ")}
- Mood: ${styleDNA.mood}
- Composition: ${styleDNA.composition}
- Aesthetic: ${styleDNA.aesthetic}
- Base prompt: ${styleDNA.promptBase}`
      : "";

    const copyContext = copy
      ? `\n\nSection copy to visually support:\n${JSON.stringify(copy)}`
      : "";

    const prompt = `Generate an image prompt for the "${sectionType}" section of a product detail page.

Product: ${JSON.stringify(productInfo)}
Section purpose: ${sectionContext}${dnaContext}${copyContext}${cumulativeRef}

Requirements:
1. Start with the product description
2. Include exact lighting, background, composition, color grading from Style DNA
3. Maintain visual consistency with previous sections
4. End with technical specs: --ar 4:5 --style raw (for Midjourney) OR similar
5. 60-100 words, English only
6. No prohibited content

Return ONLY the prompt text, no explanation.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "You are an expert AI image prompt engineer for e-commerce product photography. Create precise, detailed image generation prompts for Midjourney, DALL-E, Flux, or Gemini.",
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    });

    const text = result.response.text().trim();
    return NextResponse.json({ prompt: text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
