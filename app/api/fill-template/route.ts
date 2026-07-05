import { getOpenAI, SUMMARY_MODEL, stripCodeFence } from "@/lib/openai";
import { FILL_SYSTEM_PROMPT } from "@/lib/template-form";

export const runtime = "nodejs";
export const maxDuration = 60;

// Legacy plain-text templates: fill the text and return it verbatim.
const TEXT_FILL_PROMPT = `You fill out a document template for a field-service technician using the notes from a job they just spoke aloud.

Rules:
- Keep the template's exact structure, labels, headings, and order.
- Fill in every field you can from the job note (work performed, parts/materials, quantities, sizes, recommendations, etc.).
- Where the template has a placeholder (e.g. [name], {date}, ____, <address>), replace it with the real value from the note.
- If a field genuinely cannot be determined from the note, leave it as "[blank]" so the tech can fill it in.
- Do not use em dashes. Use commas or separate sentences.
- Never invent specific facts (prices, names, dates) that are not in the note.
- Output ONLY the completed template as plain text. No preamble, no explanation.`;

type FillField = { id: string; label: string };

export async function POST(request: Request) {
  try {
    const { transcript, summary, templateContent, fields } =
      await request.json();

    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json(
        { error: "No job note to fill from." },
        { status: 400 }
      );
    }

    const openai = getOpenAI();

    // --- Visual form templates: return a { field id -> value } map ----------
    if (Array.isArray(fields) && fields.length > 0) {
      const fieldList = (fields as FillField[])
        .map((f) => `- ${f.id}: ${f.label}`)
        .join("\n");

      const completion = await openai.chat.completions.create({
        model: SUMMARY_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: FILL_SYSTEM_PROMPT },
          {
            role: "user",
            content: `FORM FIELDS:\n${fieldList}\n\nJOB NOTE (transcript):\n"""${transcript.trim()}"""\n\nSTRUCTURED SUMMARY (for reference):\n${JSON.stringify(summary ?? {}, null, 2)}\n\nReturn the JSON with a "values" object mapping each field id to its value.`,
          },
        ],
      });

      let values: Record<string, string> = {};
      try {
        const parsed = JSON.parse(
          completion.choices[0]?.message?.content ?? "{}"
        );
        const raw = parsed?.values ?? parsed ?? {};
        for (const [k, v] of Object.entries(raw)) {
          values[k] = typeof v === "string" ? v : v == null ? "" : String(v);
        }
      } catch {
        values = {};
      }
      return Response.json({ values });
    }

    // --- Legacy plain-text templates ----------------------------------------
    if (typeof templateContent !== "string" || !templateContent.trim()) {
      return Response.json({ error: "No template provided." }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: TEXT_FILL_PROMPT },
        {
          role: "user",
          content: `TEMPLATE:\n"""${templateContent.trim()}"""\n\nJOB NOTE (transcript):\n"""${transcript.trim()}"""\n\nSTRUCTURED SUMMARY (for reference):\n${JSON.stringify(summary ?? {}, null, 2)}\n\nReturn the completed template.`,
        },
      ],
    });

    const filled = stripCodeFence(completion.choices[0]?.message?.content ?? "");
    return Response.json({ filled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Template fill failed.";
    console.error("[fill-template]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
