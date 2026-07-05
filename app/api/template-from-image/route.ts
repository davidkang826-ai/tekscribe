import { getOpenAI, SUMMARY_MODEL, stripCodeFence } from "@/lib/openai";
import { FORM_SYSTEM_PROMPT, sanitizeFormHtml } from "@/lib/template-form";

export const runtime = "nodejs";
export const maxDuration = 60;

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
        { role: "system", content: FORM_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Rebuild this form as a clean, fillable HTML copy.",
            },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

    const html = sanitizeFormHtml(
      stripCodeFence(completion.choices[0]?.message?.content ?? "")
    );
    if (!html) {
      return Response.json(
        { error: "Couldn't read a form from that image." },
        { status: 422 }
      );
    }
    return Response.json({ html });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't read that image.";
    console.error("[template-from-image]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
