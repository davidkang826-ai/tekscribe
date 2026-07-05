// Shared helpers for "visual" form templates: an uploaded work order / invoice /
// inspection sheet is rebuilt by the AI as a self-contained HTML form the tech can
// see and approve, then filled in on each job. All exports here are pure string
// functions (no DOM, no Node APIs) so they're safe to import on the server AND the
// client. Value injection (which needs the DOM) lives in the client components.

/** Stored form templates begin with this marker so we can tell them apart from
 *  legacy plain-text templates that live in the same `content` column. */
export const FORM_MARKER = "<!--tt-form-->";

export function isFormTemplate(content: string | null | undefined): boolean {
  return !!content && content.startsWith(FORM_MARKER);
}

/** The HTML of a form template, with the marker removed. */
export function stripFormMarker(content: string): string {
  return content.startsWith(FORM_MARKER)
    ? content.slice(FORM_MARKER.length)
    : content;
}

export function withFormMarker(html: string): string {
  return FORM_MARKER + html;
}

/**
 * Strip anything unsafe from AI-generated form HTML before we store/render it.
 * The content is the technician's own form, so this is defense-in-depth, not a
 * hostile-input boundary: drop scripts, styles, embeds, event handlers, and
 * javascript: URLs, but keep inline `style=` attributes (that's the layout).
 */
export function sanitizeFormHtml(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|link|meta|object|embed|base)\b[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2")
    .trim();
}

/** Pull the fillable fields out of a form's HTML (single source of truth). */
export function extractFields(html: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  const tagRe = /<[^>]*\bdata-field\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const labelM = m[0].match(/\bdata-label\s*=\s*["']([^"']*)["']/i);
    out.push({ id, label: labelM ? labelM[1] : id });
  }
  return out;
}

// --- AI prompts, shared by the image + file extraction routes ----------------

export const FORM_SYSTEM_PROMPT = `You convert a field-service document (work order, invoice, inspection report, service ticket, estimate, etc.) into a clean, fillable digital copy of the SAME form, as a self-contained HTML fragment.

Reproduce the form faithfully:
- Keep the title, every section heading, and every field label, in the same order and grouping as the original.
- Recreate tables, columns, checkboxes, boxed sections, and lines using HTML (<table>, <div>) with INLINE styles only (style="...").
- Match the look reasonably: bold title, boxed sections, table borders, black text on a white sheet. Keep it print friendly and easy to read.

For EVERY blank the technician fills in, output an empty placeholder exactly like this:
<span class="tt-fill" data-field="snake_case_id" data-label="Human readable label"></span>
- data-field is a short unique snake_case id.
- data-label says what goes there (e.g. "Customer name", "Date", "Work performed", "Parts used", "Total").
- Leave the span EMPTY. Never put a value inside it.
- For a checkbox the tech would tick, use an empty box like <span style="display:inline-block;width:14px;height:14px;border:1px solid #475569;"></span> next to its label, and make the label's value a tt-fill span only if the tech writes something there.

Hard rules:
- Output ONLY the HTML fragment. No <html>, <head>, <body>, <script>, <style>, <link>, or markdown code fences.
- Inline styles only. No external images, fonts, scripts, or URLs.
- Do not invent fields that are not in the document, and do not fill in any values.
- Do not use em dashes. Use commas or separate sentences.`;

export const FILL_SYSTEM_PROMPT = `You fill out a field-service technician's form using the notes from a job they just spoke aloud.

You are given the form's fields (each with an id and a label) and the job note. Return a JSON object that maps each field id to the value to write on the form.

Rules:
- Use ONLY facts stated in the job note. Never invent prices, names, dates, or measurements.
- If a field cannot be determined from the note, use an empty string so the tech can fill it in by hand.
- Keep values short and appropriate to the label (a name, a date, a line item, a short phrase).
- Do not use em dashes. Use commas or separate sentences.
- Return JSON only, in the shape {"values": {"<field_id>": "<value>", ...}}. No prose.`;
