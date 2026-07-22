import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Fill the client card by voice. The tech speaks the customer's details ("this
// is Maria Lopez, 206 555 0148, maria at gmail, 45 Oak Street Seattle") and we
// pull out name, phone, email, and address.

const SYSTEM_PROMPT = `You extract a customer's contact details from what a field-service technician just said out loud, and return them as structured fields. You are given the CURRENT field values and a spoken instruction.

Fields:
- "name": the customer/client name.
- "phone": the phone number, digits only formatting is fine (e.g. "(206) 555-0148").
- "email": the email address, lowercase, no spaces. Spoken "at" means @ and "dot" means a period.
- "address": the street address.

Rules:
- Always return ALL four fields. For any field the technician did not mention, return its current value unchanged.
- Interpret spoken forms: "two oh six, five five five..." is a phone number; "maria at gmail dot com" is "maria@gmail.com"; "forty five Oak Street" is "45 Oak Street".
- Only use information the technician actually stated, or that was already in the current fields. Never invent a name, number, email, or address. If something is unclear, leave that field as its current value.
- Never use em dashes.
- Respond with ONLY a JSON object: {"name": "...", "phone": "...", "email": "...", "address": "..."}.`;

type ClientFields = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

export async function POST(request: Request) {
  try {
    const { transcript, current } = (await request.json()) as {
      transcript?: string;
      current?: Partial<ClientFields>;
    };
    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json({ error: "No transcript provided." }, { status: 400 });
    }

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const now: ClientFields = {
      name: str(current?.name),
      phone: str(current?.phone),
      email: str(current?.email),
      address: str(current?.address),
    };

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Current fields:\n${JSON.stringify(now)}\n\nThe technician said:\n"""${transcript.trim()}"""\n\nReturn the updated JSON.`,
        },
      ],
    });

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}"
    ) as Partial<ClientFields>;

    // Keep the current value for anything the model dropped, so a field is
    // never wiped by a partial response.
    const pick = (v: unknown, fallback: string) =>
      typeof v === "string" ? v.trim() : fallback;
    const updated: ClientFields = {
      name: pick(parsed.name, now.name),
      phone: pick(parsed.phone, now.phone),
      email: pick(parsed.email, now.email),
      address: pick(parsed.address, now.address),
    };

    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't read that.";
    console.error("[extract-client]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
