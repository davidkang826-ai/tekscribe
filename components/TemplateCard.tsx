"use client";

import { useState } from "react";
import DeleteTemplateButton from "@/components/DeleteTemplateButton";
import { isFormTemplate, stripFormMarker } from "@/lib/template-form";

export default function TemplateCard({
  id,
  name,
  content,
}: {
  id: string;
  name: string;
  content: string;
}) {
  const [previewing, setPreviewing] = useState(false);
  const isForm = isFormTemplate(content);

  return (
    <li className="relative pt-1.5">
      {/* Clip tab, makes each card read as a little clipboard */}
      <span className="absolute top-0 left-1/2 z-10 h-3 w-10 -translate-x-1/2 rounded-md bg-brand" />
      <button
        type="button"
        onClick={() => setPreviewing(true)}
        className="relative flex min-h-[112px] w-full flex-col items-center justify-center rounded-2xl border-2 border-border bg-surface px-3 pt-6 pb-4 text-center shadow-sm transition hover:border-brand/50 hover:shadow"
      >
        <h3 className="text-[15px] font-semibold leading-snug text-foreground break-words">
          {name}
        </h3>
        <span className="mt-1.5 text-[13px] font-medium text-brand">
          {isForm ? "Preview form" : "Preview"}
        </span>
      </button>
      <DeleteTemplateButton id={id} name={name} />

      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewing(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="font-semibold text-foreground">{name}</h3>
              <button
                type="button"
                onClick={() => setPreviewing(false)}
                aria-label="Close preview"
                className="tt-pop text-muted hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto p-5">
              {isForm ? (
                <div className="rounded-xl border border-border bg-white p-5">
                  <div
                    className="tt-form"
                    dangerouslySetInnerHTML={{
                      __html: stripFormMarker(content),
                    }}
                  />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap rounded-xl border border-border bg-slate-50 p-4 text-[16px] leading-relaxed text-foreground font-sans">
                  {content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
