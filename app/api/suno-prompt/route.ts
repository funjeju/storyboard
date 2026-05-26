import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const isAlbum = body.projectType === "album";
    const trackLabel = isAlbum ? `트랙 ${body.trackIndex || 1}/${body.trackCount}` : "싱글";
    const bpmText = body.bpmMode === "random" ? "auto-fit BPM" : `${body.bpm} BPM`;

    // ── 1. Style Prompt ──────────────────────────────────────────────────────
    // Suno "Style of Music" 필드 — 풍부하고 구체적인 음악 디렉션
    const styleSystem = `You are a world-class music producer and sound designer writing Suno AI style prompts.
Your style prompts are RICH and SPECIFIC — they paint a complete sonic picture.
DO NOT write lyrics. DO NOT use section tags.
Write comma-separated musical descriptors covering ALL of these dimensions:
1. Genre + subgenre blend (be specific — e.g. "post-grunge alt-metal" not just "rock")
2. Mood + emotional texture (layered descriptors)
3. Instrumentation (specific instruments, playing techniques, tones)
4. Rhythm & tempo character (groove feel, drum style, ${bpmText})
5. Vocal style (gender, technique, texture, delivery emotion)
6. Production & mixing (space, compression, FX, era/reference sound)
7. Song energy arc (if relevant)
Output ONLY the style descriptor string. Aim for 80-150 words.`;

    const styleUser = `Create a rich Suno style prompt for (${trackLabel}):

GENRE: ${body.genre1}${body.genre2 ? ` + ${body.genre2}` : ""}
MOOD: ${body.mood} | INTENSITY: ${body.intensity}
PURPOSE: ${body.purpose || "general release"}
TEMPO: ${bpmText}
VOCAL: ${body.vocal} | LANGUAGE: ${body.language}
TOPIC/THEME: ${body.topic || "open"}
AVOID: ${body.avoidElements || "nothing"}
EXTRA DIRECTION: ${body.additionalRequests || "none"}

Make it detailed enough that Suno can generate a fully realized, professional-sounding track.
Every parameter above MUST influence the style description.`;

    // ── 2. Lyrics ────────────────────────────────────────────────────────────
    const lyricsSystem = `You are an acclaimed ${body.language === "한국어" ? "Korean" : "English"} lyricist with credits on major label releases.
Your lyrics are sophisticated, emotionally resonant, and avoid clichés.

PARAMETERS TO FOLLOW STRICTLY:
- Language: ${body.language}
- Rhyme style: ${body.rhymeStyle || "natural ABAB or ABCB"}
- Lyric density: ${body.lyricDensity || "medium"} — ${
  body.lyricDensity === "high" ? "많은 음절, 빠른 전달, 랩퍼 수준의 밀도" :
  body.lyricDensity === "low" ? "여백, 느린 전달, 각 라인이 강하게 남는 구조" :
  "자연스러운 밀도, 후렴은 기억하기 쉽게"
}
- Hook strength: ${body.hookStrength || "strong"} — ${
  body.hookStrength === "maximum" ? "후렴이 단번에 귀에 꽂히는 anthemic 수준" :
  body.hookStrength === "strong" ? "명확하고 기억에 남는 후렴" :
  "자연스럽게 녹아드는 후렴"
}
- Genre mood: ${body.genre1}${body.genre2 ? ` + ${body.genre2}` : ""} / ${body.mood} / ${body.intensity}
- Avoid: ${body.avoidElements || "generic platitudes, forced rhymes"}

SUNO FORMAT: Use these tags exactly: [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus], [Outro]
Write COMPLETE lyrics for ALL sections. Never truncate.
Quality bar: lyrics that could appear on a real album.`;

    const lyricsUser = `Write complete, high-quality song lyrics.

TOPIC/THEME: ${body.topic || "자유 주제 — 감정적으로 임팩트 있는 오리지널 테마를 창작하라"}
HOOK IDEA: ${body.hookLyrics || "자유롭게 창작 — 단 후렴은 standalone으로도 강력해야 함"}
SONG STRUCTURE: ${body.songStructure || "Intro-Verse1-PreChorus-Chorus-Verse2-Bridge-FinalChorus-Outro"}
ADDITIONAL NOTES: ${body.additionalRequests || "없음"}

Write ALL sections fully. No placeholders. No truncation.`;

    const styleModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: styleSystem,
    });

    const lyricsModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: lyricsSystem,
    });

    const [styleResult, lyricsResult] = await Promise.all([
      styleModel.generateContent({
        contents: [{ role: "user", parts: [{ text: styleUser }] }],
        generationConfig: { maxOutputTokens: 600 },
      }),
      body.vocal !== "없음"
        ? lyricsModel.generateContent({
            contents: [{ role: "user", parts: [{ text: lyricsUser }] }],
            generationConfig: { maxOutputTokens: 4000 },
          })
        : Promise.resolve(null),
    ]);

    const stylePrompt = styleResult.response.text().trim().replace(/^["'`]|["'`]$/g, "");
    const lyrics = lyricsResult ? lyricsResult.response.text().trim() : null;

    // 제목
    const titleModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const titleResult = await titleModel.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `You are naming a ${body.genre1} song. Based on this style and theme, suggest ONE punchy song title (2-5 words) in ${body.language === "한국어" ? "Korean" : "English"}.\nStyle: ${stylePrompt}\nTheme: ${body.topic || "open"}\nReply with ONLY the title. No quotes. No explanation.` }],
      }],
      generationConfig: { maxOutputTokens: 60 },
    });
    const suggestedTitle = titleResult.response.text().trim().replace(/^["'「『【\[<]|["'」』】\]>]$/g, "").split("\n")[0].trim();

    return NextResponse.json({ stylePrompt, lyrics, suggestedTitle });
  } catch (error) {
    console.error("Suno prompt API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
