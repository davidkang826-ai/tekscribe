import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Smart voice edit for a scheduled event. The tech speaks a change ("actually
// it's Mrs. Johnson, make it a call, move it to next Tuesday at 3, and use
// 555 1234") and we apply it across the whole event: who, on-site vs call,
// address, the note, the date and time, and the number to call.

const SYSTEM_PROMPT = `You update the fields of a field-service technician's scheduled event based on what the technician just said out loud. You are given the event's CURRENT fields, TODAY's date, and a spoken instruction. Apply the changes the technician describes and return the FULL updated set of fields.

Fields:
- "customer": the customer/client name.
- "kind": either "visit" (on-site) or "call" (a phone-call reminder).
- "address": the service address (only meaningful for a visit).
- "phone": the phone number to call (only meaningful for a call).
- "todo": a short note of what the visit or call is for.
- "date": the date, in strict YYYY-MM-DD format.
- "time": the time, in strict 24-hour HH:MM format.

Rules:
- Always return ALL fields. For any field the technician did not address, return its current value unchanged.
- Apply edits across the right fields, not just the note. A person's name updates "customer". An address updates "address". A phone number updates "phone". If they say it is a phone call, just a call, or a reminder to call, set "kind" to "call"; if they say to go out there or it is an on-site visit, set "kind" to "visit".
- Dates and times: resolve anything relative against TODAY. "tomorrow", "next Tuesday", "this Friday", "in two days", "the 15th" all become a concrete YYYY-MM-DD. "3", "3pm", "at 8", "half past 2", "noon" become HH:MM in 24-hour time. If only a date is mentioned, keep the current time, and vice versa. If neither is mentioned, return both unchanged.
- For "todo": integrate what they said. If they add information, merge it into a clean short note. If they correct or replace something, revise the note to reflect it instead of just appending. Keep it one to three sentences, plain language, no filler.
- Only use information the technician actually stated, or that was already in the current fields. Never invent names, addresses, phone numbers, prices, or details.
- Never use em dashes. Use commas or separate sentences.
- Respond with ONLY a JSON object: {"customer": "...", "kind": "visit" or "call", "address": "...", "phone": "...", "todo": "...", "date": "YYYY-MM-DD", "time": "HH:MM"}.`;

type EventFields = {
  customer: string;
  kind: "visit" | "call";
  address: string;
  phone: string;
  todo: string;
  date: string;
  time: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

/** Snap "HH:MM" to the nearest 5 minutes so it matches the time picker. */
function snapTime(t: string, fallback: string): string {
  if (!TIME_RE.test(t)) return fallback;
  const [h, m] = t.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  let mins = Math.round(m / 5) * 5;
  let hour = h;
  if (mins === 60) {
    mins = 0;
    hour = (hour + 1) % 24;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}:${pad(mins)}`;
}

export async function POST(request: Request) {
  try {
    const { transcript, current, today } = (await request.json()) as {
      transcript?: string;
      current?: Partial<EventFields>;
      today?: string;
    };
    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json({ error: "No transcript provided." }, { status: 400 });
    }

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const now: EventFields = {
      customer: str(current?.customer),
      kind: current?.kind === "call" ? "call" : "visit",
      address: str(current?.address),
      phone: str(current?.phone),
      todo: str(current?.todo),
      date: DATE_RE.test(str(current?.date)) ? str(current?.date) : "",
      time: TIME_RE.test(str(current?.time)) ? str(current?.time) : "",
    };
    const todayStr = str(today) || now.date;

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `TODAY is ${todayStr}.\n\nCurrent event:\n${JSON.stringify(now)}\n\nThe technician said:\n"""${transcript.trim()}"""\n\nReturn the updated JSON.`,
        },
      ],
    });

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}"
    ) as Partial<EventFields>;

    // Fall back to the current value for anything the model dropped or
    // returned in a bad shape, so a field is never wiped by a stray response.
    const pDate = str(parsed.date);
    const pTime = str(parsed.time);
    const updated: EventFields = {
      customer: str(parsed.customer) || now.customer,
      kind: parsed.kind === "call" ? "call" : parsed.kind === "visit" ? "visit" : now.kind,
      address: typeof parsed.address === "string" ? parsed.address.trim() : now.address,
      phone: typeof parsed.phone === "string" ? parsed.phone.trim() : now.phone,
      todo: str(parsed.todo) || now.todo,
      date: DATE_RE.test(pDate) ? pDate : now.date,
      time: snapTime(pTime, now.time),
    };

    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't apply that.";
    console.error("[edit-event]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
