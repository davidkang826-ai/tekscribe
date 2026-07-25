import { Resend } from "resend";

// Where new-signup alerts go. Configurable via env so it can change without a
// deploy; defaults to the TekScribe owner inbox.
const OWNER_EMAIL = process.env.SIGNUP_NOTIFY_EMAIL || "tekscribeio@gmail.com";

/**
 * Email the owner when a new account signs up. Best-effort: any failure is
 * logged and swallowed so it can never block or break signup.
 */
export async function notifyNewSignup(input: {
  email: string;
  businessName: string;
}): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !OWNER_EMAIL) return;
    const from = `TekScribe <${
      process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
    }>`;
    const business = input.businessName?.trim() || "(no business name)";
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: OWNER_EMAIL,
      replyTo: input.email || undefined,
      subject: `New TekScribe signup: ${business}`,
      text: [
        "A new account just signed up on TekScribe.",
        "",
        `Business: ${business}`,
        `Email: ${input.email || "(unknown)"}`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[notifyNewSignup]", err);
  }
}
