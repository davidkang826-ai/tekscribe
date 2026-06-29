"use client";

import { useMemo, useState } from "react";
import type { JobSummary } from "@/lib/types";

type Channel = "email" | "text";

function buildEmailBody(summary: JobSummary): string {
  const lines: string[] = [];
  if (summary.customerMessage) lines.push(summary.customerMessage, "");
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

function buildSmsBody(summary: JobSummary): string {
  const lines: string[] = [];
  if (summary.customerMessage) lines.push(summary.customerMessage);
  if (summary.nextSteps.length) {
    lines.push("", "Next steps:");
    for (const item of summary.nextSteps) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

export default function SendToCustomer({
  summary,
  defaultReplyTo = "",
}: {
  summary: JobSummary;
  defaultReplyTo?: string;
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState(
    `Summary of your service visit — ${summary.jobTitle}`
  );
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Where customer replies go. Defaults to the tech's saved reply-to; they can
  // change it for this send.
  const [replyTo, setReplyTo] = useState(defaultReplyTo);
  const [editingReplyTo, setEditingReplyTo] = useState(false);
  const validReplyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo);

  const emailBody = useMemo(() => buildEmailBody(summary), [summary]);
  const smsBody = useMemo(() => buildSmsBody(summary), [summary]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneDigits = phone.replace(/[^\d+]/g, "");
  const validPhone = phoneDigits.replace(/\D/g, "").length >= 10;

  const smsHref = useMemo(
    () => `sms:${phoneDigits}?&body=${encodeURIComponent(smsBody)}`,
    [phoneDigits, smsBody]
  );

  const isEmail = channel === "email";

  async function sendEmail() {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject,
          text: emailBody,
          replyTo: validReplyTo ? replyTo : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed.");
      setSent(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  async function copyAll() {
    const text = isEmail ? `Subject: ${subject}\n\n${emailBody}` : smsBody;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-3">
        Send to customer
      </div>

      <div className="inline-flex rounded-lg bg-slate-100 p-1 mb-3">
        {(["email", "text"] as Channel[]).map((c) => (
          <button
            key={c}
            onClick={() => {
              setChannel(c);
              setSent(false);
              setSendError(null);
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              channel === c
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {c === "email" ? "✉️ Email" : "💬 Text"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {isEmail ? (
          <>
            <div>
              <label className="block text-xs text-muted mb-1">
                Customer email
              </label>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSent(false);
                  setSendError(null);
                }}
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

            {/* Reply-to: confirm or change the address replies go to */}
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              {editingReplyTo ? (
                <div>
                  <label className="block text-xs text-muted mb-1">
                    Replies should go to
                  </label>
                  <input
                    type="email"
                    inputMode="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <button
                    onClick={() => setEditingReplyTo(false)}
                    className="mt-2 text-xs font-medium text-brand hover:underline"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">
                    Replies go to{" "}
                    <span className="font-medium text-foreground">
                      {replyTo || "—"}
                    </span>
                  </span>
                  <button
                    onClick={() => setEditingReplyTo(true)}
                    className="font-medium text-brand hover:underline shrink-0"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            <label className="block text-xs text-muted mb-1">
              Customer mobile number
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(617) 555-0123"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        )}

        <details className="rounded-lg bg-slate-50 px-3 py-2.5">
          <summary className="text-xs text-muted cursor-pointer select-none">
            Preview message
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground font-sans">
            {isEmail ? emailBody : smsBody}
          </pre>
        </details>

        {sendError && (
          <div className="rounded-lg bg-red-50 text-danger text-sm px-3 py-2.5 ring-1 ring-red-100">
            {sendError}
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          {isEmail ? (
            <button
              onClick={sendEmail}
              disabled={!validEmail || sending || sent}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium text-sm shadow-sm transition ${
                sent
                  ? "bg-success text-white"
                  : validEmail && !sending
                    ? "bg-brand text-white hover:bg-brand-600"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {sent
                ? "✓ Sent"
                : sending
                  ? "Sending…"
                  : "✉️ Send email"}
            </button>
          ) : (
            <a
              href={validPhone ? smsHref : undefined}
              aria-disabled={!validPhone}
              onClick={(e) => {
                if (!validPhone) e.preventDefault();
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium text-sm shadow-sm transition ${
                validPhone
                  ? "bg-brand text-white hover:bg-brand-600"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              💬 Open in Messages
            </a>
          )}
          <button
            onClick={copyAll}
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2.5 text-foreground font-medium text-sm ring-1 ring-border hover:bg-slate-50 transition"
          >
            {copied ? "✓ Copied" : "Copy text"}
          </button>
        </div>

        {isEmail ? (
          !validEmail ? (
            <p className="text-xs text-accent-600">
              Enter the customer&apos;s email above to send.
            </p>
          ) : (
            <p className="text-xs text-muted">
              TechTalk sends this email for you — works on any device. Replies go
              straight to your inbox.
            </p>
          )
        ) : (
          <p className="text-xs text-muted">
            Opens your phone&apos;s Messages app with the text filled in, sent
            from your own number. (Texting works from a phone; on a computer use
            “Copy text.”)
          </p>
        )}
      </div>
    </div>
  );
}
