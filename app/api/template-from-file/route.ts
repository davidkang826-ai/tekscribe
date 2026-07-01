import { getOpenAI, SUMMARY_MODEL } from "@/lib/openai";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import type OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATE_INSTRUCTIONS = `You convert a document (a form used by a field-service technician — work order, invoice, inspection report, etc.) into a reusable fill-in TEMPLATE as plain text.

Rules:
- Transcribe the document's structure: its title, section headings, and every field label.
- For each blank a technician would fill in, add a placeholder in square brackets describing it, e.g. "Customer name: [name]", "Address: [address]", "Work performed: [work]", "Parts used: [parts]".
- Preserve the order and grouping of the original.
- Do not invent fields that aren't in the document, and do not fill in any values.
- Output ONLY the template text — no explanation.`;

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

    // PDF — send natively; GPT-4o reads both the text and the page layout.
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const dataUrl = `data:application/pdf;base64,${buf.toString("base64")}`;
      const completion = await openai.chat.completions.create({
        model: SUMMARY_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: TEMPLATE_INSTRUCTIONS },
          {
            role: "user",
            content: [
              { type: "text", text: "Convert this form into a fill-in template." },
              {
                type: "file",
                file: { filename: file.name, file_data: dataUrl },
              },
            ] as OpenAI.Chat.Completions.ChatCompletionContentPart[],
          },
        ],
      });
      return Response.json({
        content: completion.choices[0]?.message?.content?.trim() ?? "",
      });
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
      return Response.json(
        { error: "Unsupported file type." },
        { status: 415 }
      );
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
        { role: "system", content: TEMPLATE_INSTRUCTIONS },
        {
          role: "user",
          content: `Document content:\n"""${extracted.slice(0, 14000)}"""\n\nReturn the fill-in template.`,
        },
      ],
    });

    return Response.json({
      content: completion.choices[0]?.message?.content?.trim() ?? "",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't read that file.";
    console.error("[template-from-file]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
