import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Clean one spoken snippet into a single contact-form value. Used by the
// per-line mic buttons on the client card (name, phone, email, address).

type Field = "name" | "phone" | "email" | "address";

const GUIDE: Record<Field, string> = {
  name: "a person's name, in proper case.",
  phone: 'a phone number formatted like "(206) 555-0148" when it has 10 US digits; otherwise just the digits.',
  email: 'an email address, lowercase with no spaces. Spoken "at" means @ and "dot" means a period.',
  address: "a street address, as stated.",
};

export async function POST(request: Request) {
  try {
    const { transcript, field } = (await request.json()) as {
      transcript?: string;
      field?: Field;
    };
    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json({ error: "No transcript provided." }, { status: 400 });
    }
    const f: Field =
      field === "phone" || field === "email" || field === "address"
        ? field
        : "name";

    const system = `You clean up a short spoken snippet into ${GUIDE[f]} Return ONLY a JSON object {"value": "..."}. Use only what was said, never invent digits or characters. If nothing usable was said, return {"value": ""}. Never use em dashes.`;

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Spoken:\n"""${transcript.trim()}"""\n\nReturn the JSON.`,
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const value = typeof parsed.value === "string" ? parsed.value.trim() : "";
    return Response.json({ value });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't read that.";
    console.error("[parse-field]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
