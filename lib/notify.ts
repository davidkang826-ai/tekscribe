import { Resend } from "resend";

// Where owner alerts go. Configurable via env so it can change without a
// deploy; defaults to the TekScribe owner inbox.
const OWNER_EMAIL = process.env.SIGNUP_NOTIFY_EMAIL || "tekscribeio@gmail.com";

/** Send one owner alert. Best-effort: any failure is logged and swallowed so
 *  it can never block or break the flow that triggered it. */
async function alertOwner(
  subject: string,
  lines: string[],
  replyTo?: string
): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !OWNER_EMAIL) return;
    const from = `TekScribe <${
      process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
    }>`;
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: OWNER_EMAIL,
      replyTo: replyTo || undefined,
      subject,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("[alertOwner]", err);
  }
}

/** A new account finished email verification. */
export async function notifyNewAccount(input: {
  email: string;
  businessName: string;
}): Promise<void> {
  const business = input.businessName?.trim() || "(no business name)";
  await alertOwner(
    `New TekScribe account: ${business}`,
    [
      "A new account just confirmed their email on TekScribe.",
      "",
      `Business: ${business}`,
      `Email: ${input.email || "(unknown)"}`,
    ],
    input.email
  );
}

/** A tech saved their very first note. */
export async function notifyFirstNote(input: {
  email: string;
  jobTitle?: string;
  customerName?: string;
}): Promise<void> {
  await alertOwner(
    `First note recorded: ${input.email || "a new tech"}`,
    [
      "A technician just recorded their first note on TekScribe.",
      "",
      `Tech: ${input.email || "(unknown)"}`,
      `Job: ${input.jobTitle?.trim() || "(untitled)"}`,
      `Customer: ${input.customerName?.trim() || "(none)"}`,
    ],
    input.email
  );
}

/** A tech upgraded to a paid plan. */
export async function notifyPaidUpgrade(input: {
  email: string;
  planName: string;
}): Promise<void> {
  await alertOwner(
    `Paid upgrade: ${input.planName} (${input.email || "unknown"})`,
    [
      "A technician just upgraded to a paid plan on TekScribe.",
      "",
      `Plan: ${input.planName}`,
      `Email: ${input.email || "(unknown)"}`,
    ],
    input.email
  );
}
