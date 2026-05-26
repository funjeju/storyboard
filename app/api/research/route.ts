import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// RESEARCH = strategy, insights, persona, reasoning. NOT finished copy.
// Copy generation step is responsible for actual headlines, body text, bullets.
const RESEARCH_PROMPTS: Record<string, string> = {
  hook: `Extract HOOK STRATEGY for this product. Output strategy and insight ONLY, NO finished copy.
- targetEmotion: the single strongest emotional lever for this product, with reasoning
- buyerMindset: what mental state the buyer is in when they encounter this page (skeptical, browsing, comparing, etc.)
- hookAngles: 3 strategic angles a headline could attack (e.g. "scarcity via seasonal window", "guilt-free indulgence", "gift-giver pride") — describe the ANGLE, not the headline text
- avoidAngles: 2 angles that would fail for this product/persona, with reasoning
- supportingFacts: 3-4 concrete facts or insights the copy should anchor on
DO NOT write headlines, subheadlines, or opening lines. Return strategic analysis only.
JSON: { targetEmotion, buyerMindset, hookAngles: [{angle, reasoning}], avoidAngles: [{angle, why}], supportingFacts: string[] }`,

  usp: `Extract USP STRATEGY. Output ranking and reasoning ONLY, NO finished bullet text.
- competitiveLandscape: what typical alternatives in this category offer
- differentiatorRanking: top 4 differentiators ranked by buyer impact. Each entry needs WHY this matters to the buyer (not just feature) and what PROOF is needed (numbers, certifications, demos)
- weakestCompetitorPoint: where competitors in this category are most vulnerable
- valueProposition: one-sentence positioning statement (this is strategic positioning, not marketing copy)
JSON: { competitiveLandscape, differentiatorRanking: [{point, why, proof}], weakestCompetitorPoint, valueProposition }`,

  problemSolution: `Extract PROBLEM-SOLUTION INSIGHT. NO finished copy.
- primaryPainPoint: the #1 unspoken pain this product addresses, with reasoning why it's #1
- painSymptoms: 3-5 specific daily symptoms the buyer experiences from this pain
- currentWorkarounds: what buyers do now to cope, and why those workarounds fail
- transformationVector: the before→after shift this product enables (emotional shift, not just functional)
- objections: top 2 objections to the solution and how to neutralize each
JSON: { primaryPainPoint, painSymptoms: string[], currentWorkarounds: [{workaround, whyFails}], transformationVector, objections: [{objection, neutralizer}] }`,

  specs: `Extract SPECS PRIORITIZATION strategy. NO finished spec table.
- buyerDecisionDrivers: which 3-4 specs actually drive purchase for THIS category, with reasoning
- specCategoryStructure: how to group remaining specs for scannability (give the grouping logic)
- comparisonContext: typical category baseline values to compare against (for "above industry standard" framing)
- hiddenValueSpecs: specs that look mundane but signal premium quality, and why
JSON: { buyerDecisionDrivers: [{spec, why}], specCategoryStructure: [{groupName, rationale}], comparisonContext, hiddenValueSpecs: [{spec, signal}] }`,

  lifestyle: `Extract LIFESTYLE NARRATIVE STRATEGY. NO finished scene copy.
- targetMoment: the single most aspirational moment of use this product unlocks
- buyerSelfImage: who the buyer becomes / how they feel about themselves when using this (identity shift)
- sceneCandidates: 3 vivid usage scenes — for each: setting (when/where), persona (who), emotional payoff (what feeling)
- sensoryAnchors: specific smell/touch/sound/visual details that would make scenes tangible
JSON: { targetMoment, buyerSelfImage, sceneCandidates: [{setting, persona, payoff}], sensoryAnchors: string[] }`,

  options: `Extract OPTIONS & PROMO STRATEGY. NO finished copy.
- optionDecisionLogic: how buyers actually choose between variants for this product (price-first, use-case, gift, etc.)
- bestValueRationale: which option to push as "best value" and the cognitive reasoning (anchor effect, completeness bias, etc.)
- bundlingOpportunity: which combinations would create perceived deal value
- urgencyMechanic: a LEGITIMATE scarcity/timing angle for THIS specific product (not generic "limited time")
JSON: { optionDecisionLogic, bestValueRationale: {option, reasoning}, bundlingOpportunity, urgencyMechanic }`,

  reviews: `Extract SOCIAL PROOF STRATEGY. NO finished testimonials.
- skepticPersona: profile of the most skeptical buyer for THIS product (their specific doubts, demographic, mindset)
- enthusiastPersona: profile of the buyer who would rave (what specifically they would rave about)
- thirdPartyPersona: a third archetype that adds dimension (professional user, gift giver, repeat buyer, etc.)
- proofPriorities: which proof types matter most for this category (numerical ratings vs. photos vs. detailed text vs. expert endorsement) with reasoning
- trustSignalGaps: trust signals that are typically missing in this category that this product could uniquely provide
JSON: { skepticPersona: {profile, doubts}, enthusiastPersona: {profile, raveAbout}, thirdPartyPersona: {profile, contribution}, proofPriorities, trustSignalGaps }`,

  faq: `Extract FAQ STRATEGY. NO finished Q&A pairs.
- hiddenObjections: 6-8 unstated buyer doubts blocking conversion (deeper than surface questions)
- questionPriority: rank topics by sales impact (which questions actually block purchase vs. just curiosity)
- categoryStandards: what info buyers expect to find in THIS category's FAQ (must-haves)
- contrarianQuestions: 2 questions competitors typically avoid that, if answered, build trust
JSON: { hiddenObjections: string[], questionPriority: [{topic, impact}], categoryStandards: string[], contrarianQuestions: [{question, whyItBuildsTrust}] }`,

  cta: `Extract CTA STRATEGY. NO finished button text.
- conversionMoment: what mental state is the buyer in by the time they reach the CTA on this page?
- residualDoubt: the single biggest doubt still standing between scroll and click
- urgencyType: which urgency mechanic fits this product's truth (real scarcity, social momentum, deadline, regret avoidance) with reasoning
- riskReversal: what guarantee/policy would tip a hesitator over the line
- closingEmotionalTone: the final emotional register (calm confidence vs. urgent push vs. friendly nudge) with reasoning for why this tone matches the product
JSON: { conversionMoment, residualDoubt, urgencyType: {type, reasoning}, riskReversal, closingEmotionalTone: {tone, reasoning} }`,
};

export async function POST(req: NextRequest) {
  try {
    const { sectionType, productInfo } = await req.json();

    const prompt = RESEARCH_PROMPTS[sectionType];
    if (!prompt) return NextResponse.json({ error: "Unknown section type" }, { status: 400 });

    const system = `You are a senior Korean e-commerce STRATEGIST and consumer researcher — NOT a copywriter for this task.

Your job is to deliver strategic ANALYSIS that a copywriter will use as a brief.
You provide: target emotions, buyer mindset, strategic angles, persona blueprints, reasoning, supporting facts.
You do NOT provide: finished headlines, finished bullet text, finished testimonial quotes, finished CTA button text, finished Q&A pairs.

If a finished copy line slips into your output, you have failed the task.
Frame outputs as "the angle should be X because Y" rather than "the headline is X".

Respond in Korean for text content, but keep JSON keys in English.
Product context: ${JSON.stringify(productInfo)}`;

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
