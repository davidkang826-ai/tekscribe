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
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setContent("");
      setFileName(null);
      setReadError(null);
    }
  }, [state.ok]);

  async function handleTextFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContent(await file.text());
    setFileName(file.name);
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const image = await fileToScaledDataUrl(file);
      const res = await fetch("/api/template-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read that image.");
      setContent(data.content || "");
      setFileName(file.name);
    } catch (err) {
      setReadError(
        err instanceof Error ? err.message : "Couldn't read that image."
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
          placeholder="Work order, Invoice, Inspection report…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {/* Start a template from a photo of a paper form, or a text file */}
      <div>
        <label className="block text-xs font-medium text-muted mb-2">
          Start from a paper form (optional)
        </label>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 transition">
            📷 Take a photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImage}
              className="hidden"
            />
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-foreground text-sm font-medium ring-1 ring-border cursor-pointer hover:bg-slate-50 transition">
            🖼 Photo / file
            <input
              type="file"
              accept="image/*"
              onChange={handleImage}
              className="hidden"
            />
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-foreground text-sm font-medium ring-1 ring-border cursor-pointer hover:bg-slate-50 transition">
            ⬆ .txt
            <input
              type="file"
              accept=".txt,.md,text/plain"
              onChange={handleTextFile}
              className="hidden"
            />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {reading
            ? "📸 Reading your form…"
            : fileName
              ? `Loaded from ${fileName} — review and edit below.`
              : "Snap a photo of a work order or invoice and we'll turn it into a fillable template."}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          Template content
        </label>
        <textarea
          name="content"
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder={
            "Paste your template here, or start from a photo above. Use placeholders, e.g.\n\nCustomer: [name]\nAddress: [address]\nWork performed: [work]\nParts used: [parts]\nRecommended follow-up: [next steps]"
          }
          className="w-full rounded-lg border border-border bg-surface p-3 text-[15px] leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-xs text-muted">
          Tip: mark blanks with things like{" "}
          <code className="text-foreground">[name]</code> or{" "}
          <code className="text-foreground">____</code> and TekScribe fills them
          from what you say.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending || reading}
        className="rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {pending ? "Saving…" : "Save template"}
      </button>
    </form>
  );
}
