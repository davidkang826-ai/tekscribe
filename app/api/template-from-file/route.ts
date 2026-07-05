import { getOpenAI, SUMMARY_MODEL, stripCodeFence } from "@/lib/openai";
import { FORM_SYSTEM_PROMPT, sanitizeFormHtml } from "@/lib/template-form";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import type OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Expected a file upload." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "No file provided." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    const openai = getOpenAI();

    // PDF: send natively; GPT-4o reads both the text and the page layout.
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const dataUrl = `data:application/pdf;base64,${buf.toString("base64")}`;
      const completion = await openai.chat.completions.create({
        model: SUMMARY_MODEL,
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
              {
                type: "file",
                file: { filename: file.name, file_data: dataUrl },
              },
            ] as OpenAI.Chat.Completions.ChatCompletionContentPart[],
          },
        ],
      });
      const html = sanitizeFormHtml(
        stripCodeFence(completion.choices[0]?.message?.content ?? "")
      );
      if (!html) {
        return Response.json(
          { error: "Couldn't read a form from that PDF." },
          { status: 422 }
        );
      }
      return Response.json({ html });
    }

    // Extract plain text from Office / text formats, then structure with AI.
    let extracted = "";
    if (name.endsWith(".docx")) {
      extracted = (await mammoth.extractRawText({ buffer: buf })).value;
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const wb = XLSX.read(buf, { type: "buffer" });
      extracted = wb.SheetNames.map(
        (n) => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`
      ).join("\n\n");
    } else if (
      /\.(txt|csv|md|tsv)$/.test(name) ||
      file.type.startsWith("text/")
    ) {
      extracted = buf.toString("utf8");
    } else if (name.endsWith(".doc")) {
      return Response.json(
        {
          error:
            "Old .doc files aren't supported. Please save it as .docx or PDF and try again.",
        },
        { status: 415 }
      );
    } else {
      return Response.json({ error: "Unsupported file type." }, { status: 415 });
    }

    if (!extracted.trim()) {
      return Response.json(
        { error: "Couldn't read any content from that file." },
        { status: 422 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: FORM_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Rebuild this form as a clean, fillable HTML copy. Document content:\n"""${extracted.slice(0, 14000)}"""`,
        },
      ],
    });

    const html = sanitizeFormHtml(
      stripCodeFence(completion.choices[0]?.message?.content ?? "")
    );
    if (!html) {
      return Response.json(
        { error: "Couldn't build a form from that file." },
        { status: 422 }
      );
    }
    return Response.json({ html });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't read that file.";
    console.error("[template-from-file]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
