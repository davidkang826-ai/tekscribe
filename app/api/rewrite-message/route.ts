import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";
import { recentMessageSamples } from "@/lib/supabase/samples";
import type { JobSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You write the short customer-facing message for a field-service technician's job note, using the note's structured sections as the single source of truth. The technician just edited those sections, so the message must reflect them exactly.

Rules:
- One short, warm, professional paragraph addressed to the HOMEOWNER/CUSTOMER. Plain language, no jargon.
- When a technician name is given, it MUST open with a greeting from them by name, e.g. "Hi, it's {name}. Thanks again for letting me help you today." Without a name, open warmly without one.
- Summarize the work done, and mention any next steps so the customer knows what happens next. Never mention parts or items the technician plans to buy, order, or pick up ("Buy:" items); purchases are internal notes, not customer information.
- Weave any customer requests into flowing sentences so the customer knows they were heard, e.g. "As you asked during the visit, we'll schedule the next visit for Tuesday morning." Never use bullet points or lists.
- Use ONLY facts from the sections provided. Never invent details, prices, names, or dates.
- NEVER include any phone number or email address in the message, not the customer's and not the technician's; the app appends the technician's own contact details separately.
- Do not use em dashes. Use commas or separate sentences.
- Return JSON only, in the shape {"customerMessage": "..."}.`;

export async function POST(request: Request) {
  try {
    const { summary, techName } = (await request.json()) as {
      summary?: Partial<JobSummary>;
      techName?: string;
    };

    if (!summary || typeof summary !== "object") {
      return Response.json({ error: "No summary provided." }, { status: 400 });
    }

    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const name =
      typeof techName === "string" ? techName.trim().slice(0, 60) : "";

    const sections = [
      `JOB TITLE: ${summary.jobTitle?.trim() || "Service visit"}`,
      `WORK DONE:\n${arr(summary.workDone).map((b) => `- ${b}`).join("\n") || "(none)"}`,
      `PARTS USED:\n${arr(summary.partsAndMaterials).map((b) => `- ${b}`).join("\n") || "(none)"}`,
      `CUSTOMER REQUESTS:\n${arr(summary.customerRequests).map((b) => `- ${b}`).join("\n") || "(none)"}`,
      `NEXT STEPS & THINGS TO BUY:\n${arr(summary.nextSteps).map((b) => `- ${b}`).join("\n") || "(none)"}`,
    ].join("\n\n");

    const greetingNote = name
      ? `The technician's name is "${name}".`
      : `No technician name is available.`;

    // Mimic the tech's own voice: their recently sent messages, if any.
    const samples = await recentMessageSamples().catch(() => [] as string[]);
    const styleNote = samples.length
      ? `\n\nThis technician's recently sent messages are below. Write in the same voice: match their tone, phrasing, and level of formality. Mimic style only, never copy facts from them.\n${samples
          .map((s, i) => `EXAMPLE ${i + 1}:\n${s}`)
          .join("\n---\n")}`
      : "";

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${greetingNote}${styleNote}\n\n${sections}\n\nReturn the JSON with the customerMessage.`,
        },
      ],
    });

    let customerMessage = "";
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      if (typeof parsed.customerMessage === "string")
        customerMessage = parsed.customerMessage.trim();
    } catch {
      customerMessage = "";
    }

    if (!customerMessage) {
      return Response.json(
        { error: "Couldn't write the message." },
        { status: 422 }
      );
    }
    return Response.json({ customerMessage });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't update the message.";
    console.error("[rewrite-message]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
