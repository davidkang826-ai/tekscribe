"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { addTemplate, type TemplateState } from "@/lib/supabase/templates";

export default function AddTemplateForm() {
  const [state, formAction, pending] = useActionState<TemplateState, FormData>(
    addTemplate,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  // Clear the form after a successful add.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setContent("");
      setFileName(null);
    }
  }, [state.ok]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setFileName(file.name);
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

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-muted">
            Template content
          </label>
          <label className="text-xs font-medium text-brand cursor-pointer hover:underline">
            {fileName ? `📄 ${fileName}` : "⬆ Upload .txt"}
            <input
              type="file"
              accept=".txt,.md,text/plain"
              onChange={handleFile}
              className="hidden"
            />
          </label>
        </div>
        <textarea
          name="content"
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder={
            "Paste your template here. Use placeholders the AI should fill, e.g.\n\nCustomer: [name]\nAddress: [address]\nWork performed: [work]\nParts used: [parts]\nRecommended follow-up: [next steps]"
          }
          className="w-full rounded-lg border border-border bg-surface p-3 text-[15px] leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-xs text-muted">
          Tip: write the fields exactly how you want them. Mark blanks with
          things like <code className="text-foreground">[name]</code> or{" "}
          <code className="text-foreground">____</code> and TechTalk fills them
          from what you say.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
      >
        {pending ? "Saving…" : "Save template"}
      </button>
    </form>
  );
}
