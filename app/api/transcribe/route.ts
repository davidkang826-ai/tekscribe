import { getOpenAI, TRANSCRIPTION_MODEL } from "@/lib/openai";

// Audio upload + Whisper call — must run on Node, not edge.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("audio");

    if (!(file instanceof File) || file.size === 0) {
      return Response.json(
        { error: "No audio file provided." },
        { status: 400 }
      );
    }

    const openai = getOpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
      language: "en",
    });

    return Response.json({ text: transcription.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed.";
    console.error("[transcribe]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
