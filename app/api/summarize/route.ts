import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";
import { recentMessageSamples } from "@/lib/supabase/samples";
import type { JobSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an assistant for field-service technicians (plumbing, HVAC, appliance repair, electrical, and high-end landscaping). A technician just finished a job and dictated a voice note. Convert that raw transcript into a clean, structured job summary.

Fields:
- "jobTitle": a short title for the visit.
- "workDone": what was done. Short bullet fragments, not sentences.
- "partsAndMaterials": parts/materials USED on this job (sizes, quantities, fittings, refrigerant, breakers, etc.). These are billable and must not be lost. Empty array if none.
- "nextSteps": everything still to do: follow-ups, return visits, recommendations, AND anything to BUY or order. Prefix a purchase with "Buy: " (e.g. "Buy: 3/4-inch shutoff valve"). Empty array if none.
- "customerRequests": specific things the CUSTOMER asked for or wants (e.g. "wants a quote for a new water heater", "call before arriving", "prefers morning visits", "asked us to look at the upstairs sink next time"). Only include real requests stated in the note. Empty array if none.
- "customerMessage": a short, warm, professional paragraph addressed to the HOMEOWNER. It MUST open with a greeting from the technician by name, like "Hi, it's {TECH_NAME}. Thanks again for letting me help you today." then summarize what was done and any next steps, in plain language (no jargon). Weave any customerRequests into flowing sentences so the customer knows they were heard, e.g. "As you asked during the visit, we'll schedule the next visit for Tuesday morning and bring extra drop cloths." Never use bullet points or lists in this message. Never mention parts or items the technician plans to buy, order, or pick up; purchases are internal notes, not customer information.

CRITICAL:
- NEVER use em dashes (—) in any field. Use commas or separate sentences.
- NEVER address the technician, NEVER ask for clarification, and NEVER apologize or mention "transcript", "error", or "unclear". You are a silent formatting tool, not a chat assistant.
- Only include information present in the transcript. Never invent parts, prices, names, or dates.
- If the note is short or rough, still fill the fields with whatever was actually said. Do not comment on the quality of the input.
- Respond with ONLY a JSON object with keys: jobTitle, workDone, partsAndMaterials, nextSteps, customerRequests, customerMessage.`;

export async function POST(request: Request) {
  try {
    const { transcript, techName } = await request.json();

    if (typeof transcript !== "string" || transcript.trim().length === 0) {
      return Response.json({ error: "No transcript provided." }, { status: 400 });
    }

    const name =
      typeof techName === "string" ? techName.trim().slice(0, 60) : "";
    const greetingNote = name
      ? `The technician's name is "${name}". The customerMessage must greet the customer as this technician, e.g. "Hi, it's ${name}. Thanks again for letting me help you today."`
      : `No technician name is available, so open the customerMessage with a warm greeting without a name, e.g. "Hi, thanks again for letting me help you today."`;

    // Mimic the tech's own voice: their recently sent messages, if any.
    const samples = await recentMessageSamples().catch(() => [] as string[]);
    const styleNote = samples.length
      ? `\n\nThis technician's recently sent messages are below. Write the customerMessage in the same voice: match their tone, phrasing, and level of formality. Mimic style only, never copy facts from them.\n${samples
          .map((s, i) => `EXAMPLE ${i + 1}:\n${s}`)
          .join("\n---\n")}`
      : "";

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${greetingNote}${styleNote}\n\nTranscript:\n"""${transcript.trim()}"""\n\nReturn the JSON object.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<JobSummary>;

    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

    const summary: JobSummary = {
      jobTitle: parsed.jobTitle?.trim() || "Service visit",
      workDone: arr(parsed.workDone),
      partsAndMaterials: arr(parsed.partsAndMaterials),
      nextSteps: arr(parsed.nextSteps),
      customerRequests: arr(parsed.customerRequests),
      customerMessage: parsed.customerMessage?.trim() || "",
    };

    return Response.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summarization failed.";
    console.error("[summarize]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
