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

    const adv = body.advanced as {
      vocalDirection?: string;
      venueMood?: string;
      energyCurve?: string;
      bpmFeel?: string;
      hookStyle?: string;
      vocalProduction?: string;
      songDevice?: string;
      detailedMoods?: string[];
      avoidElementsAdvanced?: string[];
      instruments?: { guitar?: string; drums?: string; bass?: string; synth?: string };
    } | null;

    const isAutoOrEmpty = (v?: string) => !v || v === "자동" || v.startsWith("자동");
    const advancedBlock = adv ? `

═══ ADVANCED SONIC CONTROLS (these OVERRIDE genre defaults) ═══
${!isAutoOrEmpty(adv.vocalDirection) ? `VOCAL DIRECTION: ${adv.vocalDirection} — describe vocal delivery to match this exactly` : ""}
${!isAutoOrEmpty(adv.venueMood) ? `VENUE/PLACE TEXTURE: ${adv.venueMood} — the sonic world must evoke this specific environment` : ""}
${!isAutoOrEmpty(adv.energyCurve) ? `ENERGY CURVE: ${adv.energyCurve} — dynamics must follow this shape across the track` : ""}
${!isAutoOrEmpty(adv.bpmFeel) ? `TEMPO FEEL: ${adv.bpmFeel} — describe rhythm character in these terms` : ""}
${!isAutoOrEmpty(adv.hookStyle) ? `HOOK STYLE: ${adv.hookStyle} — chorus/hook must have this character` : ""}
${!isAutoOrEmpty(adv.vocalProduction) ? `VOCAL PRODUCTION: ${adv.vocalProduction} — describe vocal mix/processing this way` : ""}
${!isAutoOrEmpty(adv.songDevice) ? `SONG DEVICE: ${adv.songDevice} — must explicitly mention this structural device` : ""}
${(adv.detailedMoods?.length ?? 0) > 0 ? `DETAILED MOODS (atmospheric layers): ${adv.detailedMoods!.join(", ")} — weave these specific feelings into the description` : ""}
${!isAutoOrEmpty(adv.instruments?.guitar) ? `GUITAR: ${adv.instruments!.guitar} (override genre default)` : ""}
${!isAutoOrEmpty(adv.instruments?.drums) ? `DRUMS: ${adv.instruments!.drums} (override genre default)` : ""}
${!isAutoOrEmpty(adv.instruments?.bass) ? `BASS: ${adv.instruments!.bass} (override genre default)` : ""}
${adv.instruments?.synth && !adv.instruments.synth.startsWith("자동") ? `SYNTH PRESENCE: ${adv.instruments.synth}` : ""}
${(adv.avoidElementsAdvanced?.length ?? 0) > 0 ? `\n⛔ HARD AVOID LIST (must NEVER appear in the prompt): ${adv.avoidElementsAdvanced!.join(", ")} — do not include any vocabulary, descriptors, or sonic elements that would produce these` : ""}
═══════════════════════════════════════════════════════════` : "";

    const lyricsCtx = body.lyricsContext as {
      genre?: string; mood?: string; atmosphere?: string;
      styleHint?: string; emotionSummary?: string;
    } | null;

    const lyricsContextBlock = lyricsCtx ? `

═══ LYRICS CONTEXT (style MUST complement these lyrics) ═══
Genre hint: ${lyricsCtx.genre || ""}
Mood: ${lyricsCtx.mood || ""}
Atmosphere: ${lyricsCtx.atmosphere || ""}
Emotion: ${lyricsCtx.emotionSummary || ""}
Style direction: ${lyricsCtx.styleHint || ""}
═══════════════════════════════════════════════════════════` : "";

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
EXTRA DIRECTION: ${body.additionalRequests || "none"}${advancedBlock}${lyricsContextBlock}

This is the most important output. Be specific, cinematic, and precise.
Remember the 1000-character hard limit — be DENSE, not wordy.`;

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
