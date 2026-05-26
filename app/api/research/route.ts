import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RESEARCH_PROMPTS: Record<string, string> = {
  hook: `Analyze this product and generate hook research:
- 3 strongest emotional hooks (curiosity, fear of missing out, transformation)
- Top 3 scroll-stopping opening lines for Korean shopping mall
- Key desire triggers for target audience
Return as JSON: { hooks: string[], openingLines: string[], desireTriggers: string[] }`,

  usp: `Analyze this product's unique selling proposition:
- Top 3-5 USPs ranked by impact
- Competitive differentiation points
- Value proposition statement (Korean)
Return as JSON: { usps: string[], differentiation: string[], valueProposition: string }`,

  problemSolution: `Identify customer pain points and solutions:
- Top 5 pain points this product solves
- Before/after transformation narrative
- Objection handling for each pain point
Return as JSON: { painPoints: string[], transformations: string[], objectionHandling: string[] }`,

  specs: `Extract and organize product specifications:
- Key technical specifications grouped by category
- Comparison with typical alternatives
- Spec highlights that matter most to buyers
Return as JSON: { specGroups: { category: string, specs: string[] }[], highlights: string[] }`,

  lifestyle: `Generate lifestyle usage scenarios:
- 3-5 vivid lifestyle scenarios where this product shines
- Target user personas for each scenario
- Aspirational narrative for each scenario
Return as JSON: { scenarios: { scene: string, persona: string, narrative: string }[] }`,

  options: `Analyze product options and promotional angles:
- Option comparison matrix (colors, sizes, bundles)
- Best-value recommendation logic
- Promotional hooks (limited time, bundle savings, exclusivity)
Return as JSON: { optionMatrix: string[], recommendation: string, promoHooks: string[] }`,

  reviews: `Generate social proof strategy:
- 3 archetype customer testimonials (skeptic, enthusiast, professional)
- Key rating dimensions to highlight
- UGC (user-generated content) usage suggestions
Return as JSON: { testimonials: { persona: string, quote: string, rating: number }[], ratingDimensions: string[], ugcSuggestions: string[] }`,

  faq: `Generate comprehensive FAQ:
- Top 8 questions buyers ask before purchasing
- Concise, confidence-building answers
- Questions that address hidden objections
Return as JSON: { faqs: { q: string, a: string }[] }`,

  cta: `Generate high-converting CTA strategy:
- 3 primary CTA button texts
- Urgency/scarcity elements
- Trust signals to include near CTA
- Final closing statement
Return as JSON: { ctaTexts: string[], urgencyElements: string[], trustSignals: string[], closingStatement: string }`,
};

export async function POST(req: NextRequest) {
  try {
    const { sectionType, productInfo } = await req.json();

    const prompt = RESEARCH_PROMPTS[sectionType];
    if (!prompt) return NextResponse.json({ error: "Unknown section type" }, { status: 400 });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: `You are a top Korean e-commerce copywriter and conversion specialist.
Respond in Korean for text content, but keep JSON keys in English.
Product context: ${JSON.stringify(productInfo)}`,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const research = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ research });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
