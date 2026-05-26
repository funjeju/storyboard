import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const isAlbum = body.projectType === "album";
    const trackLabel = isAlbum ? `트랙 ${body.trackIndex || 1}/${body.trackCount}` : "싱글";

    // ── 1. Style Prompt (Suno "Style of Music" 필드용) ──────────────────────
    const styleSystem = `You are a professional music producer who writes optimized style prompts for Suno AI.
Suno's "Style of Music" field accepts a SHORT comma-separated description (max 120 characters is ideal, never exceed 200).
DO NOT write lyrics. DO NOT use section tags like [Verse] or [Chorus].
Write ONLY musical descriptors: genre, mood, instruments, tempo, vocal style, production notes.
Output ONLY the style prompt string, nothing else.`;

    const styleUser = `Write a Suno style prompt for this track (${trackLabel}):
Genre: ${body.genre1}${body.genre2 ? `, ${body.genre2}` : ""}
Mood: ${body.mood} | Intensity: ${body.intensity}
Purpose: ${body.purpose || "general release"}
BPM: ${body.bpmMode === "random" ? "auto" : body.bpm}
Vocal: ${body.vocal} | Language: ${body.language}
Extra context: ${body.additionalRequests || "none"}
${body.topic ? `Theme: ${body.topic}` : ""}

Output ONLY the comma-separated style descriptor. Example format:
"emotional K-pop ballad, melancholic and nostalgic, male vocalist with husky tenor, piano melody with orchestral strings, 75 BPM, cinematic reverb, studio quality"`;

    // ── 2. Lyrics (Suno Custom Mode용, 선택사항) ────────────────────────────
    const lyricsSystem = `You are a professional songwriter writing lyrics for Suno AI's custom mode.
Use Suno metatags: [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus], [Outro]
Write COMPLETE lyrics — never cut off mid-sentence.
Lyrics language: ${body.language}
Rhyme style: ${body.rhymeStyle || "natural"}
Lyric density: ${body.lyricDensity || "medium"}
Hook strength: ${body.hookStrength || "strong"}
Structure: ${body.songStructure || "Verse-PreChorus-Chorus-Verse-Bridge-FinalChorus-Outro"}
Output ONLY the lyrics with tags, nothing else.`;

    const lyricsUser = `Write complete song lyrics for (${trackLabel}):
Topic: ${body.topic || "create a compelling original theme"}
Hook idea: ${body.hookLyrics || "AI will create"}
Avoid: ${body.avoidElements || "nothing specific"}
Extra notes: ${body.additionalRequests || "none"}

Write ALL sections completely. Never truncate.`;

    const styleModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: styleSystem,
    });

    const lyricsModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: lyricsSystem,
    });

    // 스타일 프롬프트 + 가사 병렬 생성
    const [styleResult, lyricsResult] = await Promise.all([
      styleModel.generateContent({
        contents: [{ role: "user", parts: [{ text: styleUser }] }],
        generationConfig: { maxOutputTokens: 500 },
      }),
      body.vocal !== "없음" ? lyricsModel.generateContent({
        contents: [{ role: "user", parts: [{ text: lyricsUser }] }],
        generationConfig: { maxOutputTokens: 3000 },
      }) : Promise.resolve(null),
    ]);

    const stylePrompt = styleResult.response.text().trim().replace(/^["']|["']$/g, "");
    const lyrics = lyricsResult ? lyricsResult.response.text().trim() : null;

    // 제목 제안 — stylePrompt 완성 후 sequential하게
    const titleModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const titleResult = await titleModel.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Suggest ONE short evocative song title (2-5 words) in ${body.language === "한국어" ? "Korean" : "English"} for this style: "${stylePrompt}"${body.topic ? `. Theme: ${body.topic}` : ""}. Reply with ONLY the title text, no quotes, no explanation.` }],
      }],
      generationConfig: { maxOutputTokens: 100 },
    });
    const suggestedTitle = titleResult.response.text().trim().replace(/^["'「『]|["'」』]$/g, "").split("\n")[0].trim();

    return NextResponse.json({ stylePrompt, lyrics, suggestedTitle });
  } catch (error) {
    console.error("Suno prompt API error:", error);
    return NextResponse.json({ error: "Prompt generation failed" }, { status: 500 });
  }
}
