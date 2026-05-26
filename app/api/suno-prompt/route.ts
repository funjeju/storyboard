import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const system = `You are a professional music producer creating optimized prompts for Suno AI music generation.
Generate a complete, production-ready Suno prompt based on the user's parameters.

FORMAT RULES:
- Use section tags: [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus], [Outro]
- Include ACTUAL LYRICS in each section (not placeholders)
- End with a [Style: ...] tag containing: genre, mood, BPM, vocal style, instruments, production style
- If no vocal: mark sections as [Instrumental Intro], etc., with mood/feel descriptions instead of lyrics
- If topic is empty, create compelling original lyrics

QUALITY STANDARDS:
- Lyrics must rhyme naturally and fit the requested density/rhyme style
- Hook must be memorable and standalone
- Emotional arc: build through verse → release in chorus
- Style tag must be specific and actionable for Suno`;

    const userMsg = `Generate a Suno prompt with these parameters:

PROJECT: ${body.projectType === "album" ? `Album — Track ${body.trackIndex || 1} of ${body.trackCount}` : "Single"}
TITLE: ${body.title || "AI will decide"}

SONG CONTENT:
- Topic: ${body.topic || "AI choice — make something compelling"}
- Hook Lyrics: ${body.hookLyrics || "AI generated"}
- Structure: ${body.songStructure || "Intro-Verse-PreChorus-Chorus-Verse-Bridge-FinalChorus-Outro"}
- Lyric Density: ${body.lyricDensity}
- Hook Strength: ${body.hookStrength}
- Rhyme Style: ${body.rhymeStyle}
- Avoid: ${body.avoidElements || "nothing specific"}
- Extra Notes: ${body.additionalRequests || "none"}

STYLE:
- Genre 1: ${body.genre1}
- Genre 2: ${body.genre2 || "none"}
- Purpose: ${body.purpose || "general release"}
- Mood: ${body.mood}
- Intensity: ${body.intensity}

TECHNICAL:
- BPM: ${body.bpmMode === "random" ? "AI choice (fit the genre)" : body.bpm}
- Duration: ${body.duration}
- Vocal: ${body.vocal}
- Language: ${body.language}
- Prompt Language: ${body.promptLanguage}

Output the complete Suno prompt only. No explanation, no preamble.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: userMsg }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return NextResponse.json({ prompt: text });
  } catch (error) {
    console.error("Suno prompt API error:", error);
    return NextResponse.json({ error: "Prompt generation failed" }, { status: 500 });
  }
}
