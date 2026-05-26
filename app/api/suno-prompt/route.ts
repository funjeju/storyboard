import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const isAlbum = body.projectType === "album";
    const trackLabel = isAlbum ? `Track ${body.trackIndex || 1} of ${body.trackCount}` : "Single";
    const bpmText = body.bpmMode === "random" ? "tempo auto-matched to genre" : `${body.bpm} BPM`;

    const styleSystem = `You are a Grammy-winning music producer writing a sonic brief for Suno AI.
The style prompt is the MOST CRITICAL element — it determines everything about how the track sounds.
DO NOT write lyrics. DO NOT use section tags like [Verse] or [Chorus].

⚠️ HARD CONSTRAINT: Suno's Style of Music field accepts a MAXIMUM of 1000 CHARACTERS (including spaces).
Your output MUST be 1000 characters or fewer — count as you write. Target ~900 chars to leave safety margin.
This means you must be DENSE — every word earns its place. No filler, no transitions, no "and also".

Your output is a single rich paragraph of comma-separated descriptors covering ALL of:
① GENRE IDENTITY — specific subgenre blend (e.g. "post-grunge alt-metal" not just "rock")
② ARTIST/SOUND REFERENCE — 1-2 real artists or albums this sonically resembles
③ INSTRUMENTATION — key instruments, playing style, tone, articulation
   (e.g. "down-tuned 7-string guitar, heavy palm muting, mid-scooped crunch")
④ RHYTHM & GROOVE — drum character, kick/snare feel, hi-hat style, ${bpmText}
⑤ BASS — tone, technique, relationship to kick
⑥ VOCAL DELIVERY — gender, technique, texture, emotional delivery
⑦ PRODUCTION STYLE — mixing approach, era/producer reference (e.g. "Rick Rubin-era raw", "modern hyperpop loudness")
⑧ SONIC ATMOSPHERE — the emotional/sonic world
⑨ ENERGY DYNAMICS — how intensity moves through the track

Output ONLY the style descriptor paragraph. Comma-separated, single paragraph, ≤1000 characters.
Be cinematic, specific, and dense. Cut adjectives that don't add sonic info.`;

    const styleUser = `Write a maximally detailed Suno style prompt for this track (${trackLabel}).
Every parameter below MUST be reflected in the sonic description:

GENRE: ${body.genre1}${body.genre2 ? ` + ${body.genre2}` : ""}
MOOD: ${body.mood}
INTENSITY: ${body.intensity}
TEMPO: ${bpmText}
VOCAL: ${body.vocal} (${body.language})
PURPOSE: ${body.purpose || "general release"}
THEME/CONTEXT: ${body.topic || "not specified"}
AVOID: ${body.avoidElements || "nothing specific"}
EXTRA DIRECTION: ${body.additionalRequests || "none"}

This is the most important output. Be specific, cinematic, and precise.`;

    const lyricsSystem = `You are an acclaimed ${body.language === "한국어" ? "Korean" : "English"} lyricist.
Use Suno metatags: [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus], [Outro]
Write COMPLETE lyrics for ALL sections. Never truncate.
Rhyme style: ${body.rhymeStyle || "natural"}
Density: ${body.lyricDensity || "medium"}
Genre/mood: ${body.genre1} / ${body.mood} / ${body.intensity}
Avoid: ${body.avoidElements || "clichés"}`;

    const lyricsUser = `Write complete song lyrics.
Topic: ${body.topic || "자유 주제 — 감정적으로 임팩트 있는 오리지널 테마"}
Hook: ${body.hookLyrics || "자유롭게 창작"}
Notes: ${body.additionalRequests || "없음"}
Write ALL sections fully. No placeholders.`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const lyricsModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: lyricsSystem,
    });

    const [styleResult, lyricsResult, titleResult] = await Promise.all([
      genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: styleSystem })
        .generateContent({
          contents: [{ role: "user", parts: [{ text: styleUser }] }],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      body.vocal !== "없음"
        ? lyricsModel.generateContent({
            contents: [{ role: "user", parts: [{ text: lyricsUser }] }],
            generationConfig: { maxOutputTokens: 16384 },
          })
        : Promise.resolve(null),
      model.generateContent({
        contents: [{
          role: "user",
          parts: [{ text: `Suggest ONE punchy song title (2-5 words) in ${body.language === "한국어" ? "Korean" : "English"} for a ${body.genre1} track. Theme: "${body.topic || "open"}". Reply with ONLY the title. No quotes.` }],
        }],
        generationConfig: { maxOutputTokens: 200 },
      }),
    ]);

    let stylePrompt = styleResult.response.text().trim().replace(/^["'`]|["'`]$/g, "");
    // Hard cap to Suno's 1000-char Style field limit. Trim at last comma to stay clean.
    if (stylePrompt.length > 1000) {
      const trimmed = stylePrompt.slice(0, 1000);
      const lastComma = trimmed.lastIndexOf(",");
      stylePrompt = lastComma > 800 ? trimmed.slice(0, lastComma) : trimmed;
    }
    const lyrics = lyricsResult ? lyricsResult.response.text().trim() : null;
    const suggestedTitle = titleResult.response.text().trim().replace(/^["'「『【\[<]|["'」』】\]>]$/g, "").split("\n")[0].trim();

    return NextResponse.json({ stylePrompt, lyrics, suggestedTitle });
  } catch (error) {
    console.error("Suno prompt API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
