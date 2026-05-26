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

Your output must be a single rich paragraph of comma-separated descriptors covering ALL of the following:

① GENRE IDENTITY — specific subgenre blend, not generic labels (e.g. "post-grunge alt-metal" not just "rock")
② ARTIST/SOUND REFERENCE — 1-2 real artists or albums whose sonic world this resembles
③ INSTRUMENTATION — every instrument present, playing style, tuning, tone, articulation in detail
   (e.g. "down-tuned 7-string guitar with heavy palm muting and mid-scooped crunch distortion")
④ RHYTHM & GROOVE — drum pattern character, kick/snare feel, hi-hat style, groove pocket, ${bpmText}
⑤ BASS — tone, technique, relationship to kick drum
⑥ VOCAL DELIVERY — gender, technique, emotional delivery, vocal texture, any special techniques
⑦ PRODUCTION STYLE — mixing approach, spatial depth, compression character, era reference
   (e.g. "Rick Rubin-era raw and punchy", "modern hyperpop loudness", "lo-fi tape warmth")
⑧ SONIC ATMOSPHERE — the emotional and sonic world the listener is immersed in
⑨ ENERGY DYNAMICS — how intensity builds or shifts (e.g. "slow burn to explosive chorus release")

Output ONLY the style descriptor paragraph. 150-250 words.
Make it so vivid and specific that Suno has zero ambiguity about the sound to create.`;

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

    const stylePrompt = styleResult.response.text().trim().replace(/^["'`]|["'`]$/g, "");
    const lyrics = lyricsResult ? lyricsResult.response.text().trim() : null;
    const suggestedTitle = titleResult.response.text().trim().replace(/^["'「『【\[<]|["'」』】\]>]$/g, "").split("\n")[0].trim();

    return NextResponse.json({ stylePrompt, lyrics, suggestedTitle });
  } catch (error) {
    console.error("Suno prompt API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
