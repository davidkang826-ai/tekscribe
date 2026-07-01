"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { addTemplate, type TemplateState } from "@/lib/supabase/templates";

/** Downscale a photo to a modest JPEG data URL so the vision upload stays small. */
async function fileToScaledDataUrl(
  file: File,
  maxDim = 1500,
  quality = 0.8
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });
  let { width, height } = img;
  const longest = Math.max(width, height);
  if (longest > maxDim) {
    const scale = maxDim / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export default function AddTemplateForm() {
  const [state, formAction, pending] = useActionState<TemplateState, FormData>(
    addTemplate,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [templateName, setTemplateName] = useState("");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setTemplateName("");
      setContent("");
      setFileName(null);
      setReadError(null);
    }
  }, [state.ok]);

  // "Invoice_Template.pdf" -> "Invoice Template"
  function niceName(filename: string) {
    return filename
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");

    // Non-image files upload as-is; Vercel caps request bodies at ~4.5 MB.
    const MAX_BYTES = 4 * 1024 * 1024;
    if (!isImage && file.size > MAX_BYTES) {
      setReadError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the max is 4 MB. Try a smaller PDF, or use “Take a photo” of each page instead.`
      );
      e.target.value = "";
      return;
    }

    setReading(true);
    setReadError(null);
    try {
      let res: Response;
      if (isImage) {
        // Downscale photos in the browser so the upload stays small.
        const image = await fileToScaledDataUrl(file);
        res = await fetch("/api/template-from-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });
      } else {
        // PDF / Word / Excel / text — send the raw file for extraction.
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch("/api/template-from-file", {
          method: "POST",
          body: fd,
        });
      }

      // The response may not be JSON (e.g. a 413 from the platform).
      let data: { content?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        if (res.status === 413) {
          throw new Error(
            "That file is too large — try one under 4 MB, or photograph the pages."
          );
        }
        throw new Error(`Upload failed (${res.status}).`);
      }
      if (!res.ok) throw new Error(data.error || "Couldn't read that file.");
      setContent(data.content || "");
      setFileName(file.name);
      // Pre-fill the name from the file so it's ready to save in one click.
      setTemplateName((prev) => prev || niceName(file.name));
    } catch (err) {
      setReadError(
        err instanceof Error ? err.message : "Couldn't read that file."
      );
    } finally {
      setReading(false);
      // allow re-selecting the same file
      e.target.value = "";
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-3"
    >
      <h2 className="font-semibold text-foreground">Add a template</h2>

      {state.error && (
        <div className="rounded-lg bg-red-50 text-danger text-sm px-3 py-2.5 ring-1 ring-red-100">
          {state.error}
        </div>
      )}
      {readError && (
        <div className="rounded-lg bg-red-50 text-danger text-sm px-3 py-2.5 ring-1 ring-red-100">
          {readError}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          Template name
        </label>
        <input
          name="name"
          type="text"
          required
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="Work order, Invoice, Inspection report…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {/* Start a template from a photo of a paper form, or a text file */}
      <div className="rounded-xl border border-dashed border-brand/40 bg-brand-50/50 p-5 text-center">
        {reading ? (
          <p className="text-sm font-medium text-brand py-2">
            📸 Reading your form…
          </p>
        ) : (
          <>
            <div className="text-2xl mb-1">📸</div>
            <p className="text-sm font-semibold text-foreground">
              Start from a paper form
            </p>
            <p className="text-xs text-muted mt-0.5 mb-3">
              {fileName
                ? `Loaded from ${fileName} — review it below.`
                : "Snap a photo, or upload a PDF, Word, or Excel file — we'll turn it into a fillable template."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 transition shadow-sm">
                📷 Take a photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
              <label className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3.5 py-2 text-foreground text-sm font-medium ring-1 ring-border cursor-pointer hover:bg-slate-50 transition">
                📎 Upload a file
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[11px] text-muted mt-2">
              PDF · PNG · JPEG · DOC/DOCX · XLS/XLSX
            </p>
          </>
        )}
        {readError && !reading && (
          <div className="mt-3 rounded-lg bg-red-50 text-danger text-sm px-3 py-2 ring-1 ring-red-100 text-left">
            {readError}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted">or write it yourself</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div>
        <textarea
          name="content"
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder={
            "Customer: [name]\nAddress: [address]\nWork performed: [work]\nParts used: [parts]\nRecommended follow-up: [next steps]"
          }
          className="w-full rounded-lg border border-border bg-surface p-3 text-[15px] leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1.5 text-xs text-muted">
          Mark blanks with things like{" "}
          <code className="text-foreground">[name]</code> or{" "}
          <code className="text-foreground">____</code> — TekScribe fills them
          from what you say.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending || reading}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {pending ? "Saving…" : "Save template"}
      </button>
    </form>
  );
}
