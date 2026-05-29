import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const MODULE_VISUAL_BRIEF: Record<string, {
  purpose: string;
  composition: string;
  copySpace: string;
  visualCode: string;
  aspectRatio?: string;
}> = {
  thumbnail: {
    purpose: "The master representative image — search results, listings, ads. CTR-optimized. Must communicate the product instantly at 200×200px.",
    composition: "Single product centered, fills 60-80% of frame. Strong silhouette, no group shots.",
    copySpace: "NO copy overlay — platform places text externally. Image must be self-sufficient.",
    visualCode: "Maximum-clarity commercial hero. Neutral or branded-solid background. Premium-feel studio lighting.",
    aspectRatio: "--ar 1:1",
  },

  // ── Hook ──────────────────────────────────────────────────────────────────
  hero_hook: {
    purpose: "Hero scroll-stopper. First thing the buyer sees — must create immediate desire.",
    composition: "Slight high-angle or eye-level hero, product as undeniable star. Bold, confident framing.",
    copySpace: "Reserve TOP 35% or LEFT 40% as clean negative space for headline overlay.",
    visualCode: "Photorealistic commercial product hero. Studio catalog quality. NOT lifestyle, NOT art photography.",
  },
  strong_copy: {
    purpose: "Bold statement visual that backs the product's strongest claim.",
    composition: "Close-up hero or 3/4 angle, emphasizing the most compelling feature. Clean and assertive.",
    copySpace: "Reserve CENTER-TOP 30% for the bold statement overlay.",
    visualCode: "High-contrast commercial photography. Strong lighting drama. Crisp and decisive.",
  },
  problem_statement: {
    purpose: "Visual that surfaces the pain point — buyer must feel seen.",
    composition: "Before-state or neutral product shot in a relatable context. Honest, not over-styled.",
    copySpace: "Reserve BOTTOM 35% for pain point copy.",
    visualCode: "Honest commercial documentary style. Warm but slightly muted. Avoid aspirational over-styling.",
  },
  pain_point: {
    purpose: "Deep empathy visual — make the unresolved problem feel real and understood.",
    composition: "Product in contrast to the problem state, or a single poignant product shot.",
    copySpace: "Reserve LEFT or TOP 40% for empathy copy overlay.",
    visualCode: "Subdued, honest commercial photography. Slightly cooler tone. NOT aspirational.",
  },

  // ── Trust ─────────────────────────────────────────────────────────────────
  customer_reviews: {
    purpose: "Authentic proof of use. Real-feeling, on-brand.",
    composition: "Product in natural use or tasteful arrangement with lifestyle context implied.",
    copySpace: "Reserve a clean horizontal band (TOP or BOTTOM 30%) for testimonial quotes.",
    visualCode: "Warm, authentic, but still commercial. Curated authenticity. NOT influencer-messy.",
  },
  expert_cert: {
    purpose: "Authority and credibility through precision and science.",
    composition: "Clean product shot with clinical precision — detail shot, lab-like setting, or certificate-adjacent.",
    copySpace: "Reserve RIGHT 40% for expert name/credential overlay.",
    visualCode: "Clinical commercial photography. White or neutral seamless. Sharp throughout. Authoritative.",
  },
  clinical_results: {
    purpose: "Data-driven credibility. Science-backed visual.",
    composition: "Precise detail shot or graphic infographic-ready composition. Numbers must feel earned.",
    copySpace: "Reserve RIGHT 45% for stat table overlay.",
    visualCode: "Clinical-clean studio. Even lighting, zero distraction. Product is the proof.",
  },
  origin: {
    purpose: "Provenance story — authenticity through place of origin.",
    composition: "Product in or near its origin environment (farm, field, region) OR a clean studio shot with origin-suggesting props.",
    copySpace: "Reserve TOP-LEFT 30% for origin story copy.",
    visualCode: "Natural but commercial. Real location or tasteful natural-light studio. NOT generic stock.",
  },
  manufacturing: {
    purpose: "Behind-the-scenes quality assurance — process as proof.",
    composition: "Detail of craftsmanship: texture, hands, tool, or process step. Product at center.",
    copySpace: "Reserve BOTTOM 30% for process step overlay.",
    visualCode: "Documentary-clean commercial. Honest craftsmanship feel. NOT industrial or cold.",
  },
  brand_story: {
    purpose: "Emotional brand narrative visual — why this brand exists.",
    composition: "Warm hero product shot with subtle brand-world context. Founder-feel or heritage objects.",
    copySpace: "Reserve LEFT 35% for brand story copy.",
    visualCode: "Warm, slightly editorial but still commercial. Heritage feel. Intentional.",
  },
  before_after: {
    purpose: "Transformation contrast — make the 'after' state viscerally desirable.",
    composition: "Split frame (before left / after right) OR a single 'after' shot radiating transformation.",
    copySpace: "Reserve TOP band for BEFORE / AFTER labels.",
    visualCode: "Honest transformation photography. Before: muted/desaturated. After: vibrant, sharp, resolved.",
  },

  // ── Product ───────────────────────────────────────────────────────────────
  feature_desc: {
    purpose: "Showcase key features — scannable visual proof of each benefit.",
    composition: "3/4 product angle or macro detail highlighting the differentiating feature.",
    copySpace: "Reserve RIGHT 40% for feature bullet callouts.",
    visualCode: "Studio product photography. Even lighting revealing texture and material. Catalog-clean.",
  },
  ingredient_desc: {
    purpose: "Ingredient transparency — purity and quality through visual.",
    composition: "Product surrounded by key ingredients/raw materials, flat lay or arranged composition.",
    copySpace: "Reserve TOP 30% or RIGHT side for ingredient labels.",
    visualCode: "Fresh, clean, natural commercial. Light, airy, pure-feeling. Studio or controlled natural light.",
  },
  comparison_table: {
    purpose: "Competitive differentiation — our product wins on sight.",
    composition: "Product centered and dominant, competitors implied as smaller or absent. Clean comparison-friendly.",
    copySpace: "Reserve RIGHT 50% for comparison table overlay.",
    visualCode: "Clean clinical studio. Product looks unambiguously premium vs. generic alternatives.",
  },
  usage_guide: {
    purpose: "Reduce purchase anxiety through clear how-to visuals.",
    composition: "Step-suggesting composition — product in use, hands visible if helpful, step implied.",
    copySpace: "Reserve BOTTOM 35% for step-by-step text overlay.",
    visualCode: "Clear, instructional commercial photography. Bright and approachable. NOT intimidating.",
  },
  option_desc: {
    purpose: "Help buyers choose — variant lineup clearly distinguishable.",
    composition: "Flat lay or organized lineup of all variants. Equal visual weight, symmetric arrangement.",
    copySpace: "Reserve BOTTOM 25% for option labels and best-value badge.",
    visualCode: "Clean catalog flat-lay. Top-down or 3/4. Pure neutral background.",
  },
  faq: {
    purpose: "Reassure and inform. Visual supports clarity, doesn't distract.",
    composition: "Calm product detail shot or simple info-supporting visual.",
    copySpace: "Reserve majority of frame for Q&A list overlay. Image is supporting role.",
    visualCode: "Minimal, clean, undistracting. Neutral background. Product as calm presence.",
  },

  // ── Emotional ─────────────────────────────────────────────────────────────
  lifestyle_image: {
    purpose: "Sell the feeling, not the product. Aspirational context of use.",
    composition: "Product in its intended real-use environment. Human element implied (hand, setting). Product remains focal point.",
    copySpace: "Reserve TOP-LEFT 30% for lifestyle headline overlay.",
    visualCode: "Aspirational but believable. Real-life indoor setting. NOT golden-hour outdoor unless product demands it.",
  },
  emotional_copy: {
    purpose: "Heart-touching visual that creates emotional bond with the brand.",
    composition: "Intimate, warmly lit product moment. Soft depth of field. Feeling over function.",
    copySpace: "Reserve CENTER or BOTTOM 25% for emotional copy.",
    visualCode: "Warm, emotionally resonant commercial photography. Gentle lighting. Evocative, not decorative.",
  },
  usage_scenario: {
    purpose: "Vivid scene of the product in real life — buyer imagines themselves there.",
    composition: "Product actively in use in a specific relatable moment. Scene-setting props minimal and purposeful.",
    copySpace: "Reserve TOP 25% for scenario label and copy.",
    visualCode: "Believable commercial lifestyle. Real moment energy. NOT staged or stock-photo generic.",
  },
  brand_philosophy: {
    purpose: "Deeper purpose and values — the WHY behind the brand.",
    composition: "Abstract-ish product shot or values-suggesting visual. Brand world, not product function.",
    copySpace: "Reserve CENTER or BOTTOM 30% for philosophy statement overlay.",
    visualCode: "Slightly more editorial, but still commercial. Values-communicating aesthetic. Intentional depth.",
  },

  // ── Conversion ────────────────────────────────────────────────────────────
  discount_benefit: {
    purpose: "Price advantage framing that creates value perception urgency.",
    composition: "Product hero with space for benefit badges. Energetic but premium.",
    copySpace: "Reserve TOP-RIGHT or BOTTOM band for benefit callouts and promo text.",
    visualCode: "Commercial product hero with slight energy — brighter, more vivid. Value-signaling.",
  },
  limited_quantity: {
    purpose: "Scarcity-driven urgency — make the product feel precious and rare.",
    composition: "Single product, slightly isolated, premium-positioned. Suggests exclusivity.",
    copySpace: "Reserve TOP band for limited-quantity alert overlay.",
    visualCode: "Premium commercial hero. Slightly dramatic lighting. Precious-object feel.",
  },
  recommended_bundle: {
    purpose: "Upsell through visual bundling — together they look more complete.",
    composition: "Bundle products arranged together, main product dominant, supporting items visible. Organized flat lay or lifestyle.",
    copySpace: "Reserve BOTTOM 30% for bundle names and saving callout.",
    visualCode: "Catalog flat-lay or arranged lifestyle. Clean, organized. Bundle looks curated, not random.",
  },
  cta: {
    purpose: "Final closing image — triggers the buy click. Maximum desire, minimum friction.",
    composition: "Strong centered or rule-of-thirds hero. Premium feel. Product looks irresistible.",
    copySpace: "Reserve CENTER-BOTTOM for CTA button and closing headline.",
    visualCode: "Premium commercial hero. Stronger lighting drama than the opening hook. Still e-commerce, not art.",
  },

  // ── Legacy fallbacks ───────────────────────────────────────────────────────
  hook: {
    purpose: "Hero scroll-stopper. Immediate desire.",
    composition: "High-angle or eye-level hero, product dominant.",
    copySpace: "Reserve TOP 35% or LEFT 40% for headline.",
    visualCode: "Commercial e-commerce hero. Catalog quality.",
  },
  usp: {
    purpose: "Key differentiator visual.",
    composition: "Tight close-up or 3/4 angle product shot.",
    copySpace: "Reserve RIGHT 40% for bullet point callouts.",
    visualCode: "Studio product photography. Even lighting.",
  },
  lifestyle: {
    purpose: "Product in its intended context.",
    composition: "Product in use context, human element implied.",
    copySpace: "Reserve TOP-LEFT 30% for headline.",
    visualCode: "Aspirational but believable. Real-life setting.",
  },
  reviews: {
    purpose: "Authentic proof of use.",
    composition: "Product in natural use or lifestyle context.",
    copySpace: "Reserve band for testimonial overlay.",
    visualCode: "Warm, authentic, curated commercial.",
  },
  faq_legacy: {
    purpose: "Calm informational visual.",
    composition: "Clean product detail or info-supporting visual.",
    copySpace: "Reserve majority for Q&A overlay.",
    visualCode: "Minimal, undistracting. Neutral background.",
  },
};

export async function POST(req: NextRequest) {
  try {
    const { sectionType, productInfo, styleDNA, copy, sectionGuidance, lockedSectionPrompts } = await req.json();

    const brief = MODULE_VISUAL_BRIEF[sectionType] || MODULE_VISUAL_BRIEF.hero_hook;

    const cumulativeRef = lockedSectionPrompts?.length > 0
      ? `\n\nVISUAL CONTINUITY — maintain consistency with these locked sections:\n${lockedSectionPrompts.slice(-3).join("\n")}`
      : "";

    const dnaContext = styleDNA
      ? `\n\nSTYLE DNA (follow strictly for visual consistency):
- Lighting: ${styleDNA.lighting}
- Background: ${styleDNA.background}
- Color palette: ${[...(styleDNA.primaryColors || []), ...(styleDNA.secondaryColors || [])].join(", ")}
- Mood: ${styleDNA.mood}
- Composition: ${styleDNA.composition}
- Aesthetic: ${styleDNA.aesthetic}
- Base prompt: ${styleDNA.promptBase}`
      : "";

    // ── Per-module text rendering rules ────────────────────────────────────────
    // role: headline = H1 bold large | subheadline = H2 medium | body = small paragraph
    //       bullet = small list items | badge = small pill/tag | label = positional label | cta-btn = button
    type TRole = "headline" | "subheadline" | "body" | "bullet" | "badge" | "label-left" | "label-right" | "cta-btn";
    interface TLayer { field: string; role: TRole; maxChars: number; arrayIndex?: number }
    const RULES: Record<string, TLayer[]> = {
      // ── Hook ──────────────────────────────────────────────────────────────
      hero_hook:         [{ field:"headline",    role:"headline",    maxChars:20 },
                          { field:"subheadline", role:"subheadline", maxChars:28 }],
      strong_copy:       [{ field:"statement",   role:"headline",    maxChars:20 },
                          { field:"support",     role:"subheadline", maxChars:30 }],
      problem_statement: [{ field:"problemHeader",role:"headline",   maxChars:22 },
                          { field:"bridge",      role:"subheadline", maxChars:28 }],
      pain_point:        [{ field:"hook",        role:"headline",    maxChars:20 },
                          { field:"pivot",       role:"subheadline", maxChars:28 }],
      // ── Trust ─────────────────────────────────────────────────────────────
      customer_reviews:  [{ field:"headline",    role:"headline",    maxChars:22 },
                          { field:"trust",       role:"subheadline", maxChars:35 }],
                          // testimonial quote rendered by image model from context
      expert_cert:       [{ field:"certTitle",   role:"headline",    maxChars:20 },
                          { field:"expertName",  role:"subheadline", maxChars:20 },
                          { field:"credential",  role:"body",        maxChars:28 }],
      clinical_results:  [{ field:"headline",    role:"headline",    maxChars:22 }],
                          // stats rendered as large number callouts by image model
      origin:            [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"closing",     role:"subheadline", maxChars:28 }],
      manufacturing:     [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"quality",     role:"subheadline", maxChars:30 }],
      brand_story:       [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"mission",     role:"subheadline", maxChars:28 }],
      before_after:      [{ field:"beforeTitle", role:"label-left",  maxChars:10 },
                          { field:"afterTitle",  role:"label-right", maxChars:10 },
                          { field:"result",      role:"badge",       maxChars:22 }],
      // ── Product ───────────────────────────────────────────────────────────
      feature_desc:      [{ field:"title",       role:"headline",    maxChars:20 }],
                          // features rendered as icon+text bullets by image model
      ingredient_desc:   [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"safety",      role:"subheadline", maxChars:30 }],
      comparison_table:  [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"conclusion",  role:"subheadline", maxChars:28 }],
      usage_guide:       [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"result",      role:"subheadline", maxChars:28 }],
      option_desc:       [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"recommendation",role:"subheadline",maxChars:28}],
      faq:               [], // no text — image is purely supportive backdrop
      // ── Emotional ─────────────────────────────────────────────────────────
      lifestyle_image:   [{ field:"headline",    role:"headline",    maxChars:22 }],
                          // breathing room — headline only, no sub
      emotional_copy:    [{ field:"opening",     role:"headline",    maxChars:22 },
                          { field:"resonance",   role:"subheadline", maxChars:28 }],
      usage_scenario:    [{ field:"title",       role:"headline",    maxChars:20 }],
      brand_philosophy:  [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"commitment",  role:"subheadline", maxChars:28 }],
      // ── Conversion ────────────────────────────────────────────────────────
      discount_benefit:  [{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"mainBenefit", role:"subheadline", maxChars:28 },
                          { field:"urgency",     role:"badge",       maxChars:22 }],
      limited_quantity:  [{ field:"alert",       role:"headline",    maxChars:18 },
                          { field:"remaining",   role:"badge",       maxChars:14 },
                          { field:"reason",      role:"subheadline", maxChars:28 }],
      recommended_bundle:[{ field:"title",       role:"headline",    maxChars:20 },
                          { field:"bestPick",    role:"badge",       maxChars:22 }],
      cta:               [{ field:"headline",    role:"headline",    maxChars:20 },
                          { field:"ctaText",     role:"cta-btn",     maxChars:10 },
                          { field:"urgency",     role:"subheadline", maxChars:28 }],
    };

    const ROLE_STYLE: Record<TRole, string> = {
      "headline":    "bold, very large Korean sans-serif, white with text-shadow",
      "subheadline": "medium weight, smaller Korean sans-serif, white or light gray",
      "body":        "small regular Korean text, white or light gray, max 2 lines",
      "bullet":      "small Korean text with bullet dot prefix, white, list format",
      "badge":       "small pill/tag shape, accent color background, Korean text inside",
      "label-left":  "positioned far left, bold Korean label, white with dark area behind",
      "label-right": "positioned far right, bold Korean label, white with dark area behind",
      "cta-btn":     "button shape with rounded corners, high-contrast fill, bold Korean text",
    };

    const layers = RULES[sectionType] || [{ field:"headline", role:"headline" as TRole, maxChars:20 }];
    const c = copy as Record<string, unknown> | null;
    const renderLayers = layers
      .map(l => {
        const v = c?.[l.field];
        const text = typeof v === "string" ? v.trim() : "";
        if (!text || text.length > l.maxChars) return null;
        return { role: l.role, text, style: ROLE_STYLE[l.role] };
      })
      .filter(Boolean) as { role: TRole; text: string; style: string }[];

    const copyContext = copy
      ? `\n\nSECTION COPY — drives BOTH visual tone and in-image typography:
${JSON.stringify(copy, null, 2)}

→ VISUAL TONE: Match lighting, color temperature, and mood to the emotional register of this copy.
${renderLayers.length > 0 ? `
→ TYPOGRAPHY TO RENDER IN IMAGE (critical — must be clearly legible):
${renderLayers.map(l => `  [${l.role.toUpperCase()}] "${l.text}" — ${l.style}`).join("\n")}

Typography rules:
  • Text placement: ${brief.copySpace}
  • Background behind text MUST have enough contrast (darken, blur, or gradient overlay the background in that zone)
  • Korean characters must be fully legible — clean, modern sans-serif
  • Do NOT crowd all text — maintain visual hierarchy and breathing room between layers` : `→ No text overlay for this module type. Image is pure visual backdrop.`}
`
      : "";

    const guidanceContext = sectionGuidance
      ? `\n\nSTRATEGIC GUIDANCE:\n${JSON.stringify(sectionGuidance, null, 2)}`
      : "";

    const user = `Generate a PHOTOREALISTIC commercial product photography prompt for the "${sectionType}" section of an e-commerce detail page.

PRODUCT: ${JSON.stringify(productInfo)}

═══ SECTION VISUAL BRIEF ═══
Purpose: ${brief.purpose}
Composition: ${brief.composition}
Copy overlay space: ${brief.copySpace}
Visual code: ${brief.visualCode}
${guidanceContext}${dnaContext}${copyContext}${cumulativeRef}

═══ HARD REQUIREMENTS ═══
1. PHOTOREALISTIC — this must look like a real photograph, NOT AI art, NOT illustration, NOT painting.
2. COMMERCIAL e-commerce photography for a shopping mall product detail page — catalog quality.
3. Intentional negative space where copy will overlay (per brief above).
4. Background: CLEAN and INTENTIONAL — studio seamless, controlled indoor, or purposeful setting.
5. Product CLEARLY READABLE — texture, color, material must communicate quality.
6. Lighting REVEALS the product — no heavy shadows hiding detail.
7. Copy-driven visual tone: the emotional register of the section copy MUST influence the lighting mood, color temperature, and atmosphere.

═══ OUTPUT FORMAT ═══
Write a single dense English prompt (80-130 words):
- Subject (product, exact description, arrangement)
- Composition (camera angle, framing, negative space placement)
- Background (specific — not just "minimalist")
- Lighting (studio approach: softbox, key+fill, diffusion, color temperature)
- Emotional tone matching the copy's keywords
- Material/texture rendering
- End with: ${brief.aspectRatio || "--ar 4:5"} --style raw --v 6.1

Return ONLY the prompt. No explanation, no markdown, no quotes.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `You are a senior e-commerce product photography art director writing prompts for AI image generation (Midjourney v6, Flux, DALL-E 3).

Your prompts produce PHOTOREALISTIC SHOPPING MALL CATALOG images. Every prompt must:
- Result in an image indistinguishable from a real studio photograph
- Incorporate the emotional and thematic direction from the section copy
- Leave intentional space for copy overlay
- Look like it belongs on Coupang, Smartstore, Wadiz, or Shopify

You do NOT write Instagram-aesthetic or art-photography prompts. You write photorealistic sales images where the visual and the copy feel like a unified creative direction.`,
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
