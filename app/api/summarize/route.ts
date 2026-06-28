import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";
import type { JobSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an assistant for field-service technicians (plumbing, HVAC, appliance repair, electrical, and high-end landscaping). A technician just finished a job and dictated a voice note describing what they did. Convert that raw transcript into a clean, structured job summary.

Rules:
- Be succinct. Bullets are short fragments, not sentences.
- Capture every part/material mentioned (sizes, quantities, fittings, refrigerant, breakers, etc.) — these are billable and must not be lost.
- Only include information present in the transcript. Never invent parts, prices, or work.
- "nextSteps" = follow-ups, return visits, parts to order, or recommendations the tech mentioned. Empty array if none.
- "customerMessage" = a short, friendly, professional paragraph (no jargon) addressed to the HOMEOWNER/CUSTOMER summarizing what was done and any next steps. Warm but concise.

CRITICAL:
- NEVER address the technician, NEVER ask for clarification, and NEVER apologize or mention "transcript", "error", or "unclear". You are a silent formatting tool, not a chat assistant.
- The customerMessage is written TO the customer, never to the technician.
- If the note is short, rough, or doesn't clearly describe a job, just summarize whatever was actually said using the same fields. Put whatever was said into workDone, leave other arrays empty if nothing fits, and write a brief neutral customerMessage. Do not comment on the quality of the input.
- Respond with ONLY a JSON object matching the required schema.`;

export async function POST(request: Request) {
  try {
    const { transcript } = await request.json();

    if (typeof transcript !== "string" || transcript.trim().length === 0) {
      return Response.json(
        { error: "No transcript provided." },
        { status: 400 }
      );
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
          content: `Transcript:\n"""${transcript.trim()}"""\n\nReturn JSON with keys: jobTitle (string), workDone (string[]), partsAndMaterials (string[]), nextSteps (string[]), customerMessage (string).`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<JobSummary>;

    const summary: JobSummary = {
      jobTitle: parsed.jobTitle?.trim() || "Service visit",
      workDone: Array.isArray(parsed.workDone) ? parsed.workDone : [],
      partsAndMaterials: Array.isArray(parsed.partsAndMaterials)
        ? parsed.partsAndMaterials
        : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      customerMessage: parsed.customerMessage?.trim() || "",
    };

    return Response.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summarization failed.";
    console.error("[summarize]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
