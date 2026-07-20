import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";
import type { JobSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `You proofread a field technician's outgoing message to their customer. The technician just hand-edited it, and their wording is intentional.

Change ONLY:
- spelling and obvious grammar mistakes
- factual details (part names, sizes, dates, times, quantities) that DIRECTLY contradict the job note data provided

Preserve everything else exactly: their tone, word choice, sentence structure, line breaks, and blank lines. Never use em dashes. If nothing needs fixing, return the text unchanged.

Respond with ONLY a JSON object: {"text": "..."}.`;

export async function POST(request: Request) {
  try {
    const { text, summary } = (await request.json()) as {
      text?: string;
      summary?: Partial<JobSummary>;
    };
    if (typeof text !== "string" || !text.trim()) {
      return Response.json({ error: "No text provided." }, { status: 400 });
    }

    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const note = summary
      ? [
          `JOB TITLE: ${summary.jobTitle ?? ""}`,
          `WORK DONE: ${arr(summary.workDone).join("; ")}`,
          `PARTS USED: ${arr(summary.partsAndMaterials).join("; ")}`,
          `CUSTOMER REQUESTS: ${arr(summary.customerRequests).join("; ")}`,
          `NEXT STEPS: ${arr(summary.nextSteps).join("; ")}`,
        ].join("\n")
      : "(no note data)";

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Job note data:\n${note}\n\nMessage to proofread:\n"""${text}"""\n\nReturn the JSON.`,
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const out = typeof parsed.text === "string" ? parsed.text : "";
    return Response.json({ text: out || text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proofread failed.";
    console.error("[proofread]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
