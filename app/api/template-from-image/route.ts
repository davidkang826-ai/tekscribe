import { getOpenAI, SUMMARY_MODEL, stripCodeFence } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You convert a photo of a paper form or document (used by a field-service technician) into a reusable fill-in TEMPLATE as plain text.

Rules:
- Transcribe the form's structure: its title, section headings, and every field label.
- For each blank a technician would fill in, add a placeholder in square brackets describing it, e.g. "Customer name: [name]", "Address: [address]", "Work performed: [work]", "Parts used: [parts]".
- Preserve the order and grouping of the original form.
- Do not invent fields that aren't on the form, and do not fill in any values.
- Do not use em dashes (—). Use commas or separate sentences.
- Output ONLY the template text. No explanation.`;

export async function POST(request: Request) {
  try {
    const { image } = await request.json();

    if (typeof image !== "string" || !image.startsWith("data:image")) {
      return Response.json({ error: "No image provided." }, { status: 400 });
    }

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL, // gpt-4o is vision-capable
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Convert this form into a fill-in template." },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

    const content = stripCodeFence(completion.choices[0]?.message?.content ?? "");
    return Response.json({ content });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't read that image.";
    console.error("[template-from-image]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
