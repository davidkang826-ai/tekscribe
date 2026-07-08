import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";
import type { JobSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You update a field-service technician's structured job note with something they just said out loud while reviewing it.

You are given the current note as JSON and the technician's spoken addition. Return the FULL updated note as JSON with the same keys: jobTitle, workDone, partsAndMaterials, customerRequests, nextSteps, customerMessage.

Rules:
- File each new fact into the right section: actions performed go to workDone, parts and materials ALREADY USED on the job (with sizes and quantities) go to partsAndMaterials, things the customer asked for go to customerRequests, follow-ups and purchases go to nextSteps (prefix purchases with "Buy: "). Anything the technician still needs to buy, grab, pick up, or order is a purchase for nextSteps, NOT a part used.
- Anything the CUSTOMER wants, asked about, or requested (a quote, a callback, a preference, something to look at) goes to customerRequests. The "Buy: " prefix is ONLY for physical parts or materials to purchase, never for quotes, visits, or tasks.
- Keep every existing entry unless the technician directly corrects it (e.g. "actually it was a 50 gallon, not a 40").
- New entries are short fragments matching the existing style. Do not duplicate what is already there.
- Rewrite customerMessage so it reflects the final note. When a technician name is given it MUST open with a greeting from them by name, e.g. "Hi, it's {name}. Thanks again for letting me help you today." Plain language, acknowledge customerRequests so the customer knows they were heard, and mention next steps.
- Only use facts from the current note and what was said. Never invent details, prices, names, or dates.
- Do not use em dashes. Use commas or separate sentences.
- Return JSON only.`;

export async function POST(request: Request) {
  try {
    const { summary, techName, text } = (await request.json()) as {
      summary?: Partial<JobSummary>;
      techName?: string;
      text?: string;
    };

    if (!summary || typeof summary !== "object") {
      return Response.json({ error: "No note provided." }, { status: 400 });
    }
    if (typeof text !== "string" || !text.trim()) {
      return Response.json({ error: "Nothing was said." }, { status: 400 });
    }

    const name =
      typeof techName === "string" ? techName.trim().slice(0, 60) : "";
    const greetingNote = name
      ? `The technician's name is "${name}".`
      : `No technician name is available, so open the customerMessage warmly without a name.`;

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${greetingNote}\n\nCURRENT NOTE:\n${JSON.stringify(summary, null, 2)}\n\nTHE TECHNICIAN JUST SAID:\n"""${text.trim()}"""\n\nReturn the full updated note as JSON.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<JobSummary>;

    const arr = (v: unknown, fallback: string[]): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : fallback;
    const prev = summary as JobSummary;

    const merged: JobSummary = {
      jobTitle: parsed.jobTitle?.trim() || prev.jobTitle || "Service visit",
      workDone: arr(parsed.workDone, prev.workDone ?? []),
      partsAndMaterials: arr(
        parsed.partsAndMaterials,
        prev.partsAndMaterials ?? []
      ),
      nextSteps: arr(parsed.nextSteps, prev.nextSteps ?? []),
      customerRequests: arr(
        parsed.customerRequests,
        prev.customerRequests ?? []
      ),
      customerMessage:
        parsed.customerMessage?.trim() || prev.customerMessage || "",
    };

    return Response.json({ summary: merged });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't add that to the note.";
    console.error("[merge-details]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
