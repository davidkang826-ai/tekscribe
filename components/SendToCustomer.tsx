"use client";

import { useMemo, useState } from "react";
import type { JobSummary } from "@/lib/types";

/** Builds a clean, customer-friendly email body from the AI summary. */
function buildEmailBody(summary: JobSummary): string {
  const lines: string[] = [];

  if (summary.customerMessage) {
    lines.push(summary.customerMessage, "");
  }

  if (summary.workDone.length) {
    lines.push("What we did:");
    for (const item of summary.workDone) lines.push(`• ${item}`);
    lines.push("");
  }

  if (summary.nextSteps.length) {
    lines.push("Next steps:");
    for (const item of summary.nextSteps) lines.push(`• ${item}`);
    lines.push("");
  }

  lines.push("Thank you for your business.");
  return lines.join("\n");
}

export default function SendToCustomer({ summary }: { summary: JobSummary }) {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(
    `Summary of your service visit — ${summary.jobTitle}`
  );
  const [copied, setCopied] = useState(false);

  const body = useMemo(() => buildEmailBody(summary), [summary]);

  const mailtoHref = useMemo(() => {
    const params = new URLSearchParams({ subject, body });
    return `mailto:${encodeURIComponent(email)}?${params.toString()}`;
  }, [email, subject, body]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be blocked; ignore
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-3">
        Send to customer
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted mb-1">Customer email</label>
          <input
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <details className="rounded-lg bg-slate-50 px-3 py-2.5">
          <summary className="text-xs text-muted cursor-pointer select-none">
            Preview email body
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground font-sans">
            {body}
          </pre>
        </details>

        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href={validEmail ? mailtoHref : undefined}
            aria-disabled={!validEmail}
            onClick={(e) => {
              if (!validEmail) e.preventDefault();
            }}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium text-sm shadow-sm transition ${
              validEmail
                ? "bg-brand text-white hover:bg-brand-600"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            ✉️ Open in email app
          </a>
          <button
            onClick={copyAll}
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2.5 text-foreground font-medium text-sm ring-1 ring-border hover:bg-slate-50 transition"
          >
            {copied ? "✓ Copied" : "Copy text"}
          </button>
        </div>
        <p className="text-xs text-muted">
          Opens your phone&apos;s mail app with everything filled in — sent from
          your own address. Just hit send.
        </p>
      </div>
    </div>
  );
}
