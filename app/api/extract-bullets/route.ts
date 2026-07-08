import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You add detail to ONE section of a field-service technician's job note. You are given the section name, the bullets already in that section, and something the technician just said out loud to add more. Return only the NEW short bullet fragments to append to that section.

Rules:
- Output JSON in the shape {"bullets": string[]}.
- Each bullet is a short fragment, not a full sentence, matching the section's style.
- Only include new information from what the technician said. Do not repeat or reword bullets that already exist.
- "Parts used": list parts and materials, with sizes and quantities when stated.
- "Next steps & things to buy": prefix anything to purchase with "Buy: ".
- "Customer requests": capture what the customer asked for.
- "Work done": capture actions performed.
- Never invent specifics (prices, names, sizes, quantities) that were not said.
- Do not use em dashes. Use commas or separate fragments.
- If nothing meaningful was said for this section, return {"bullets": []}.`;

export async function POST(request: Request) {
  try {
    const { section, existing, text } = await request.json();

    if (typeof text !== "string" || !text.trim()) {
      return Response.json({ error: "Nothing was said." }, { status: 400 });
    }

    const sectionName = typeof section === "string" ? section : "Work done";
    const existingList = Array.isArray(existing)
      ? existing.filter((x): x is string => typeof x === "string")
      : [];

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `SECTION: ${sectionName}\n\nEXISTING BULLETS:\n${
            existingList.map((b) => `- ${b}`).join("\n") || "(none)"
          }\n\nTHE TECHNICIAN SAID:\n"""${text.trim()}"""\n\nReturn the JSON with the new bullets to add.`,
        },
      ],
    });

    let bullets: string[] = [];
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      if (Array.isArray(parsed.bullets)) {
        bullets = parsed.bullets
          .filter(
            (b: unknown): b is string =>
              typeof b === "string" && b.trim().length > 0
          )
          .map((b: string) => b.trim());
      }
    } catch {
      bullets = [];
    }

    return Response.json({ bullets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add that.";
    console.error("[extract-bullets]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
