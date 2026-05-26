import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// E-commerce visual code per section.
// These are NOT lifestyle/art directions — these are commercial product photography briefs.
const SECTION_VISUAL_BRIEF: Record<string, {
  purpose: string;
  composition: string;
  copySpace: string;
  visualCode: string;
  aspectRatio?: string;
}> = {
  thumbnail: {
    purpose: "The master representative image — what appears in search results, category lists, ads, social shares. CTR-optimized. Must instantly communicate what this product is at thumbnail size (as small as 200×200px).",
    composition: "Single product centered or rule-of-thirds, product fills 60-80% of the frame, strong silhouette readable even when scaled small. NO group shots, NO complex scenes.",
    copySpace: "NO copy overlay — external system (price, product name, brand) is placed by the platform. The image must be self-sufficient and clean.",
    visualCode: "Maximum-clarity commercial hero. Pure neutral or branded-solid background. Strong but flattering lighting that pops the product. Saturation slightly boosted for thumbnail visibility. Premium-feel.",
    aspectRatio: "--ar 1:1 (square — works on every platform's listing grid)",
  },
  hook: {
    purpose: "Hero shot that stops the scroll. The buyer must immediately understand what this product IS and feel desire.",
    composition: "Slight high-angle or eye-level hero shot, product as undeniable star, clean intentional background.",
    copySpace: "Reserve TOP 35% or LEFT 40% for the headline overlay — empty negative space, no busy elements there.",
    visualCode: "Commercial e-commerce hero. Catalog quality. NOT lifestyle, NOT art photography.",
  },
  usp: {
    purpose: "Showcase the product's key differentiator visually. Detail must be crisp enough to communicate quality.",
    composition: "Tight clean close-up or 3/4 angle product shot. Macro detail of the differentiating feature.",
    copySpace: "Reserve RIGHT 40% for bullet point callouts — clean background on that side.",
    visualCode: "Studio product photography. Even lighting that reveals texture and material quality. Catalog-clean.",
  },
  problemSolution: {
    purpose: "Visualize transformation or contrast. The image must make the 'after' state feel attainable.",
    composition: "Either before/after split frame, or a single image showing the resolved state clearly.",
    copySpace: "Reserve BOTTOM 30% for the transformation copy.",
    visualCode: "Documentary-clean commercial style. Honest, not over-styled. Avoid heavy filters.",
  },
  specs: {
    purpose: "Communicate technical precision and craftsmanship. Buyer evaluates quality from this shot.",
    composition: "Clean detail shot or exploded-view-like angle showing structure, material, or scale reference.",
    copySpace: "Reserve RIGHT 45% for the spec table overlay.",
    visualCode: "Clinical commercial photography. White or neutral seamless background. Sharp focus throughout.",
  },
  lifestyle: {
    purpose: "Show the product in its INTENDED context of use so the buyer can imagine themselves with it. This is the ONE section where styled scene is appropriate — but still commercial, not editorial.",
    composition: "Product in real use context (kitchen counter, desk, dining table, etc.) with a human element implied (a hand, a setting that suggests presence) but the product remains the focal point.",
    copySpace: "Reserve TOP-LEFT 30% for the lifestyle headline overlay.",
    visualCode: "Aspirational but believable. Real-life setting, NOT a field/forest/golden-hour outdoor scene. Indoor or controlled environment that matches how the buyer would actually use it.",
  },
  options: {
    purpose: "Display variant lineup so the buyer can pick. Each variant must be clearly distinguishable.",
    composition: "Flat lay or arranged lineup of all variants. Equal visual weight, organized grid or symmetric arrangement.",
    copySpace: "Reserve BOTTOM 25% for option labels and the best-value badge.",
    visualCode: "Clean catalog flat-lay. Top-down or 3/4 organized arrangement. Pure neutral background.",
  },
  reviews: {
    purpose: "Authentic-feeling proof of use. Suggests real customers, but is still product-centric and on-brand.",
    composition: "Product being used in a natural moment OR a tasteful arrangement with the product visible alongside lifestyle elements.",
    copySpace: "Reserve a clean band for testimonial quote overlays.",
    visualCode: "Warm, authentic, but still commercial. NOT influencer-style or candid-messy. Curated authenticity.",
  },
  faq: {
    purpose: "Reassure and inform. Visual supports clarity, doesn't distract.",
    composition: "Clean product detail shot or simple info-supporting visual. Calm and ordered.",
    copySpace: "Reserve majority of frame for Q&A list overlay. Image is supporting role.",
    visualCode: "Minimal product detail or icon-clean infographic-friendly composition. Clean neutral background.",
  },
  cta: {
    purpose: "Final closing image that triggers the buy click. Maximum desire, minimum friction.",
    composition: "Strong centered or rule-of-thirds hero. Slight depth, premium feel. Product looks irresistible.",
    copySpace: "Reserve CENTER-BOTTOM for the CTA button and closing headline.",
    visualCode: "Premium commercial hero. Stronger lighting drama than the opening hook for closing impact. Still e-commerce, not art.",
  },
};

export async function POST(req: NextRequest) {
  try {
    const { sectionType, productInfo, styleDNA, copy, sectionGuidance, lockedSectionPrompts } = await req.json();

    const brief = SECTION_VISUAL_BRIEF[sectionType] || SECTION_VISUAL_BRIEF.hook;

    const cumulativeRef = lockedSectionPrompts && lockedSectionPrompts.length > 0
      ? `\n\nVISUAL CONTINUITY — these previous sections are locked, maintain consistency with their look:\n${lockedSectionPrompts.slice(-3).join("\n")}`
      : "";

    const dnaContext = styleDNA
      ? `\n\nSTYLE DNA (visual consistency across all 9 sections — must follow):
- Lighting: ${styleDNA.lighting}
- Background: ${styleDNA.background}
- Color palette: ${[...(styleDNA.primaryColors || []), ...(styleDNA.secondaryColors || [])].join(", ")}
- Mood: ${styleDNA.mood}
- Composition tendency: ${styleDNA.composition}
- Aesthetic: ${styleDNA.aesthetic}
- Base prompt: ${styleDNA.promptBase}`
      : "";

    const copyContext = copy
      ? `\n\nSECTION COPY THAT WILL OVERLAY THIS IMAGE (the visual must leave room for this text):
${JSON.stringify(copy)}`
      : "";

    const guidanceContext = sectionGuidance
      ? `\n\nTHIS SECTION'S STRATEGIC GUIDANCE (from unified research brief):
${JSON.stringify(sectionGuidance, null, 2)}`
      : "";

    const user = `Generate an E-COMMERCE PRODUCT DETAIL PAGE image prompt for the "${sectionType}" section.

PRODUCT: ${JSON.stringify(productInfo)}

═══ SECTION VISUAL BRIEF ═══
Purpose: ${brief.purpose}
Composition: ${brief.composition}
Copy overlay space: ${brief.copySpace}
Visual code: ${brief.visualCode}
${guidanceContext}${dnaContext}${copyContext}${cumulativeRef}

═══ HARD REQUIREMENTS (do not violate) ═══
1. This is COMMERCIAL e-commerce photography for a shopping mall product detail page — NOT editorial, NOT Instagram lifestyle, NOT golden-hour-outdoor art photography.
2. The image MUST have intentional negative space where copy will overlay (per the brief above).
3. Backgrounds must be CLEAN and INTENTIONAL — neutral seamless, controlled studio, or purposeful indoor setting. NO random nature backgrounds (fields, forests, sunsets) unless the product itself demands it (e.g. outdoor gear).
4. Product must be CLEARLY READABLE — texture, color, material, scale must communicate quality at a glance.
5. Lighting must REVEAL the product, not stylize over it. Avoid heavy directional shadows that hide product detail.
6. The image must work as a SALES TOOL — buyer should immediately understand what the product is and want it.

═══ OUTPUT FORMAT ═══
Write a single dense English image prompt (80-120 words) covering:
- Subject (product, exact description, quantity, arrangement)
- Composition (camera angle, framing, where the negative space sits)
- Background (specific, intentional — not "natural" or "minimalist" alone)
- Lighting (commercial studio approach — softbox, key+fill, even diffusion, etc.)
- Color grading consistent with Style DNA
- Material/texture rendering details
- End with: ${brief.aspectRatio || "--ar 4:5"} --style raw

Return ONLY the prompt text. No explanation, no markdown, no quotes.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `You are a senior e-commerce product photography art director writing prompts for AI image generation (Midjourney, Flux, Gemini, DALL-E).

Your prompts produce SHOPPING MALL CATALOG images — commercial product photography optimized for online retail. You do NOT write Instagram-aesthetic or art-photography prompts. You write SALES IMAGES.

Every prompt you write must result in an image that:
- Sells the product on sight
- Leaves intentional space for marketing copy to overlay
- Communicates product quality through clarity, not styling
- Looks like it belongs on Coupang, Smartstore, Wadiz, Shopify — NOT on a moodboard.`,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 8192 },
    });

    const text = result.response.text().trim().replace(/^["'`]|["'`]$/g, "");
    return NextResponse.json({ prompt: text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
