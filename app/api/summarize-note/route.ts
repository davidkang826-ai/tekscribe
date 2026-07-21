import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `You turn a technician's quick voice memo about an upcoming visit or phone call into a short, tight note. Keep every concrete detail (what to do, parts, addresses, names, times, prices, follow-ups) but cut filler and repetition. One to three sentences, plain language. Never use em dashes. Respond with ONLY a JSON object: {"note": "..."}.`;

export async function POST(request: Request) {
  try {
    const { transcript } = (await request.json()) as { transcript?: string };
    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json({ error: "No transcript provided." }, { status: 400 });
    }

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Voice memo:\n"""${transcript.trim()}"""\n\nReturn the JSON.`,
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const note = typeof parsed.note === "string" ? parsed.note.trim() : "";
    return Response.json({ note: note || transcript.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summarize failed.";
    console.error("[summarize-note]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
