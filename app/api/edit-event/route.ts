import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Smart voice edit for a scheduled event. The tech speaks a change ("actually
// it's Mrs. Johnson, and the address is now 45 Oak, bring the replacement
// filter") and we apply it across the whole event, not just the notes.

const SYSTEM_PROMPT = `You update the fields of a field-service technician's scheduled event based on what the technician just said out loud. You are given the event's CURRENT fields and a spoken instruction. Apply the changes the technician describes and return the FULL updated set of fields.

Fields:
- "customer": the customer/client name.
- "kind": either "visit" (on-site) or "call" (a phone-call reminder).
- "address": the service address (only meaningful for a visit).
- "todo": a short note of what the visit or call is for.

Rules:
- Always return ALL four fields. For any field the technician did not address, return its current value unchanged.
- Apply edits across the right fields, not just the note. A person's name updates "customer". An address ("the address is now...", "they moved to...") updates "address". If they say it is a phone call, just a call, or a reminder to call, set "kind" to "call"; if they say to go out there or it is an on-site visit, set "kind" to "visit".
- For "todo": integrate what they said. If they add information, merge it into a clean short note. If they correct or replace something ("it's the upstairs bathroom, not the kitchen"), revise the note to reflect the correction instead of just appending. Keep it one to three sentences, plain language, no filler.
- Only use information the technician actually stated, or that was already in the current fields. Never invent names, addresses, prices, or details.
- Never use em dashes. Use commas or separate sentences.
- Respond with ONLY a JSON object: {"customer": "...", "kind": "visit" or "call", "address": "...", "todo": "..."}.`;

type EventFields = {
  customer: string;
  kind: "visit" | "call";
  address: string;
  todo: string;
};

export async function POST(request: Request) {
  try {
    const { transcript, current } = (await request.json()) as {
      transcript?: string;
      current?: Partial<EventFields>;
    };
    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json({ error: "No transcript provided." }, { status: 400 });
    }

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const now: EventFields = {
      customer: str(current?.customer),
      kind: current?.kind === "call" ? "call" : "visit",
      address: str(current?.address),
      todo: str(current?.todo),
    };

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Current event:\n${JSON.stringify(now)}\n\nThe technician said:\n"""${transcript.trim()}"""\n\nReturn the updated JSON.`,
        },
      ],
    });

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}"
    ) as Partial<EventFields>;

    // Fall back to the current value for anything the model dropped, so a field
    // is never wiped by an incomplete response.
    const updated: EventFields = {
      customer: str(parsed.customer) || now.customer,
      kind: parsed.kind === "call" ? "call" : parsed.kind === "visit" ? "visit" : now.kind,
      address: typeof parsed.address === "string" ? parsed.address.trim() : now.address,
      todo: str(parsed.todo) || now.todo,
    };

    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't apply that.";
    console.error("[edit-event]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
