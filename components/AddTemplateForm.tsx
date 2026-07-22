"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { addTemplate, type TemplateState } from "@/lib/supabase/templates";
import { withFormMarker } from "@/lib/template-form";

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

type Original = { url: string | null; kind: "image" | "pdf" | "file"; name: string };

export default function AddTemplateForm() {
  const [state, formAction, pending] = useActionState<TemplateState, FormData>(
    addTemplate,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const overrideRef = useRef<HTMLInputElement>(null);
  const [templateName, setTemplateName] = useState("");
  // A form rebuilt from an upload (HTML), or null while writing one by hand.
  const [formHtml, setFormHtml] = useState<string | null>(null);
  const [manualContent, setManualContent] = useState("");
  const [original, setOriginal] = useState<Original | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [dismissedConflict, setDismissedConflict] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const mode: "form" | "manual" = formHtml ? "form" : "manual";

  const revokeOriginal = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setTemplateName("");
      setFormHtml(null);
      setManualContent("");
      setReadError(null);
      revokeOriginal();
      setOriginal(null);
    }
  }, [state.ok]);

  // Revoke any preview URL when the component unmounts.
  useEffect(() => revokeOriginal, []);

  // Show a fresh conflict prompt each time the action returns one.
  useEffect(() => {
    setDismissedConflict(false);
  }, [state]);

  function replaceExisting() {
    if (overrideRef.current) overrideRef.current.value = "1";
    formRef.current?.requestSubmit();
  }

  // "Invoice_Template.pdf" -> "Invoice Template"
  function niceName(filename: string) {
    return filename
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim();
  }

  function startOver() {
    revokeOriginal();
    setOriginal(null);
    setFormHtml(null);
    setReadError(null);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    // Non-image files upload as-is; Vercel caps request bodies at ~4.5 MB.
    const MAX_BYTES = 4 * 1024 * 1024;
    if (!isImage && file.size > MAX_BYTES) {
      setReadError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The max is 4 MB. Try a smaller PDF, or use "Take a photo" of each page instead.`
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
        // PDF / Word / Excel / text, send the raw file for extraction.
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch("/api/template-from-file", {
          method: "POST",
          body: fd,
        });
      }

      // The response may not be JSON (e.g. a 413 from the platform).
      let data: { html?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        if (res.status === 413) {
          throw new Error(
            "That file is too large. Try one under 4 MB, or photograph the pages."
          );
        }
        throw new Error(`Upload failed (${res.status}).`);
      }
      if (!res.ok) throw new Error(data.error || "Couldn't read that file.");
      if (!data.html) throw new Error("Couldn't build a form from that file.");

      setFormHtml(data.html);
      // Keep the original so the tech can eyeball it against the rebuilt form.
      revokeOriginal();
      if (isImage || isPdf) {
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        setOriginal({ url, kind: isImage ? "image" : "pdf", name: file.name });
      } else {
        setOriginal({ url: null, kind: "file", name: file.name });
      }
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
      <input ref={overrideRef} type="hidden" name="override" defaultValue="" />

      {state.error && (
        <div className="rounded-lg bg-red-50 text-danger text-[15px] px-3 py-2.5 ring-1 ring-red-100">
          {state.error}
        </div>
      )}
      {readError && (
        <div className="rounded-lg bg-red-50 text-danger text-[15px] px-3 py-2.5 ring-1 ring-red-100">
          {readError}
        </div>
      )}
      {state.conflict && !dismissedConflict && (
        <div className="rounded-lg bg-amber-50 text-amber-900 text-[15px] px-3 py-3 ring-1 ring-amber-200">
          <p>
            A template named{" "}
            <span className="font-semibold">&ldquo;{state.conflict}&rdquo;</span>{" "}
            already exists. Replace it with this one?
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              type="button"
              onClick={replaceExisting}
              className="tt-pop rounded-md bg-brand px-3 py-1.5 text-white text-[13px] font-medium hover:bg-brand-600 transition-colors"
            >
              Replace it
            </button>
            <button
              type="button"
              onClick={() => setDismissedConflict(true)}
              className="tt-pop rounded-md bg-surface px-3 py-1.5 text-foreground text-[13px] font-medium ring-1 ring-border hover:bg-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="block text-[13px] font-medium text-muted mb-1">
          Template name
        </label>
        <input
          name="name"
          type="text"
          required
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="Work order, Invoice, Inspection report…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[17px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {mode === "form" ? (
        /* --- A form rebuilt from an upload: show it, and save it as-is --- */
        <div className="space-y-3">
          <input
            type="hidden"
            name="content"
            value={withFormMarker(formHtml ?? "")}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] text-success font-medium">
              ✓ Here&apos;s your form. TekScribe fills it in from what you say.
            </p>
            <button
              type="button"
              onClick={startOver}
              className="tt-pop shrink-0 text-[13px] font-medium text-muted hover:text-foreground transition-colors"
            >
              Use a different file
            </button>
          </div>

          <div className="rounded-xl border border-border bg-white p-5 shadow-inner overflow-x-auto">
            <div
              className="tt-form"
              dangerouslySetInnerHTML={{ __html: formHtml ?? "" }}
            />
          </div>

          {original && (
            <details className="text-[15px]">
              <summary className="cursor-pointer text-muted hover:text-foreground transition-colors">
                Compare with what you uploaded
              </summary>
              <div className="mt-2 rounded-xl border border-border bg-surface p-3">
                {original.kind === "image" && original.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={original.url}
                    alt={original.name}
                    className="mx-auto max-h-[420px] w-auto rounded-lg"
                  />
                ) : original.kind === "pdf" && original.url ? (
                  <iframe
                    src={original.url}
                    title={original.name}
                    className="h-[420px] w-full rounded-lg"
                  />
                ) : (
                  <p className="text-muted">Uploaded {original.name}</p>
                )}
              </div>
            </details>
          )}
        </div>
      ) : (
        /* --- No upload yet: offer to snap/upload, or write one by hand --- */
        <>
          <div className="rounded-xl border border-dashed border-brand/40 bg-brand-50/50 p-5 text-center">
            {reading ? (
              <p className="text-[15px] font-medium text-brand py-2">
                📸 Reading your form…
              </p>
            ) : (
              <>
                <div className="text-2xl mb-1">📸</div>
                <p className="text-[15px] font-semibold text-foreground">
                  Start from a paper form
                </p>
                <p className="text-[13px] text-muted mt-0.5 mb-3">
                  Snap a photo, or upload a PDF, Word, or Excel file. We rebuild
                  it as a clean form that fills itself in.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-white text-[15px] font-medium cursor-pointer hover:bg-brand-600 transition shadow-sm">
                    📷 Take a photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleUpload}
                      className="hidden"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3.5 py-2 text-foreground text-[15px] font-medium ring-1 ring-border cursor-pointer hover:bg-slate-50 transition">
                    📎 Upload a file
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      onChange={handleUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-[13px] text-muted mt-2">
                  PDF · PNG · JPEG · DOC/DOCX · XLS/XLSX
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[13px] text-muted">or write it yourself</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div>
            <textarea
              name="content"
              required
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              rows={6}
              placeholder={
                "Customer: [name]\nAddress: [address]\nWork performed: [work]\nParts used: [parts]\nRecommended follow-up: [next steps]"
              }
              className="w-full rounded-lg border border-border bg-surface p-3 text-[17px] leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <p className="mt-1.5 text-[13px] text-muted">
              Mark blanks with things like{" "}
              <code className="text-foreground">[name]</code> or{" "}
              <code className="text-foreground">____</code>. TekScribe fills them
              in from what you say.
            </p>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={pending || reading}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-[15px] shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {pending ? "Saving…" : "Save template"}
      </button>
    </form>
  );
}
