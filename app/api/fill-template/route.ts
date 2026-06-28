import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You fill out a document template for a field-service technician using the notes from a job they just spoke aloud.

Rules:
- Keep the template's exact structure, labels, headings, and order.
- Fill in every field you can from the job note (work performed, parts/materials, quantities, sizes, recommendations, etc.).
- Where the template has a placeholder (e.g. [name], {date}, ____, <address>), replace it with the real value from the note.
- If a field genuinely cannot be determined from the note, leave it as "[—]" so the tech can fill it in.
- Never invent specific facts (prices, names, dates) that are not in the note.
- Output ONLY the completed template as plain text. No preamble, no explanation.`;

export async function POST(request: Request) {
  try {
    const { transcript, summary, templateContent } = await request.json();

    if (typeof templateContent !== "string" || !templateContent.trim()) {
      return Response.json({ error: "No template provided." }, { status: 400 });
    }
    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json({ error: "No job note to fill from." }, { status: 400 });
    }

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `TEMPLATE:\n"""${templateContent.trim()}"""\n\nJOB NOTE (transcript):\n"""${transcript.trim()}"""\n\nSTRUCTURED SUMMARY (for reference):\n${JSON.stringify(summary ?? {}, null, 2)}\n\nReturn the completed template.`,
        },
      ],
    });

    const filled = completion.choices[0]?.message?.content?.trim() ?? "";
    return Response.json({ filled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Template fill failed.";
    console.error("[fill-template]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
