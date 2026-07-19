"use client";

import { useMemo, useState } from "react";
import type { JobSummary } from "@/lib/types";

type Channel = "email" | "text";

type Contact = { phone?: string; email?: string };

/** US-style (###) ###-#### when the number has 10 digits; otherwise as-is. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const ten =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw.trim();
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** A closing line so the customer knows how to reach the tech for follow-ups. */
function contactLine(contact?: Contact): string {
  const phone = contact?.phone?.trim() ? formatPhone(contact.phone) : "";
  const email = contact?.email?.trim();
  if (phone && email)
    return `If you have any follow-up questions, reach me at ${phone} or ${email}.`;
  if (phone) return `If you have any follow-up questions, reach me at ${phone}.`;
  if (email) return `If you have any follow-up questions, reach me at ${email}.`;
  return "";
}

/** Next steps a customer should see: everything except the tech's own
 *  shopping list ("Buy: …" items stay internal). */
function customerNextSteps(summary: JobSummary): string[] {
  return summary.nextSteps.filter((s) => !/^buy\s*:/i.test(s.trim()));
}

function buildEmailBody(
  summary: JobSummary,
  opts: { signoffName?: string; contact?: Contact } = {}
): string {
  // The AI message already acknowledges the customer's requests in flowing
  // sentences, so there's no separate "you asked us to note" bullet list.
  const lines: string[] = [];
  if (summary.customerMessage) lines.push(summary.customerMessage, "");
  if (summary.workDone.length) {
    lines.push("What we did:");
    for (const item of summary.workDone) lines.push(`• ${item}`);
    lines.push("");
  }
  const next = customerNextSteps(summary);
  if (next.length) {
    lines.push("Next steps:");
    for (const item of next) lines.push(`• ${item}`);
    lines.push("");
  }
  const reach = contactLine(opts.contact);
  if (reach) lines.push(reach, "");
  lines.push("Thank you for allowing me to serve you!");
  if (opts.signoffName) lines.push("", "Best,", opts.signoffName);
  return lines.join("\n");
}

function buildSmsBody(summary: JobSummary, contact?: Contact): string {
  const lines: string[] = [];
  if (summary.customerMessage) lines.push(summary.customerMessage);
  const next = customerNextSteps(summary);
  if (next.length) {
    lines.push("", "Next steps:");
    for (const item of next) lines.push(`- ${item}`);
  }
  const reach = contactLine(contact);
  if (reach) lines.push("", reach);
  lines.push("", "Thank you for allowing me to serve you!");
  return lines.join("\n");
}

export default function SendToCustomer({
  summary,
  defaultReplyTo = "",
  defaultCustomerEmail = "",
  defaultCustomerPhone = "",
  techName = "",
  techPhone = "",
  onCustomerMessageChange,
}: {
  summary: JobSummary;
  defaultReplyTo?: string;
  defaultCustomerEmail?: string;
  defaultCustomerPhone?: string;
  techName?: string;
  techPhone?: string;
  /** When provided, the preview offers in-place editing of the customer
   *  message (the edit writes back to the live note). */
  onCustomerMessageChange?: (message: string) => void;
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState(defaultCustomerEmail);
  const [phone, setPhone] = useState(defaultCustomerPhone);
  const [subject, setSubject] = useState(
    `Your ${summary.jobTitle} Summary`
  );
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [editingMsg, setEditingMsg] = useState(false);

  // Where customer replies go. Defaults to the tech's saved reply-to; they can
  // change it for this send.
  const [replyTo, setReplyTo] = useState(defaultReplyTo);
  const [editingReplyTo, setEditingReplyTo] = useState(false);
  const validReplyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo);

  // Sign off with the tech's first name ("Best, Johnny").
  const firstName = techName.trim().split(/\s+/)[0] || "";
  // How the customer can reach the tech for follow-ups (their phone + the
  // reply-to email, which is what replies already go to).
  const contact = useMemo(
    () => ({ phone: techPhone, email: validReplyTo ? replyTo : "" }),
    [techPhone, replyTo, validReplyTo]
  );
  const emailBody = useMemo(
    () => buildEmailBody(summary, { signoffName: firstName, contact }),
    [summary, firstName, contact]
  );
  const smsBody = useMemo(
    () => buildSmsBody(summary, contact),
    [summary, contact]
  );

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
                      {replyTo || "your email"}
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
          {onCustomerMessageChange && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingMsg((v) => !v)}
                className="text-xs font-medium text-brand hover:underline"
              >
                {editingMsg ? "✓ Done" : "✏️ Edit message"}
              </button>
            </div>
          )}
          {editingMsg && onCustomerMessageChange ? (
            <>
              <textarea
                value={summary.customerMessage}
                onChange={(e) => onCustomerMessageChange(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-border bg-surface p-3 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <p className="mt-1 text-xs text-muted">
                You&apos;re editing your message to the customer. The rest of
                the preview updates automatically.
              </p>
            </>
          ) : (
            <pre className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground font-sans">
              {isEmail ? emailBody : smsBody}
            </pre>
          )}
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

        {isEmail && !validEmail && (
          <p className="text-xs text-accent-600">Enter an email to send.</p>
        )}
      </div>
    </div>
  );
}
