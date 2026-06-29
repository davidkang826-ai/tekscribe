import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request: Request) {
  try {
    const { to, subject, text, replyTo: replyToOverride } = await request.json();

    if (!to || !subject || !text) {
      return Response.json(
        { error: "Missing recipient, subject, or message." },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Email sending isn't set up yet (missing RESEND_API_KEY)." },
        { status: 500 }
      );
    }

    // Pull the technician's identity so the email looks like it's from them.
    // Reply-to priority: per-send override → saved profile → signup email.
    let replyTo: string | undefined =
      typeof replyToOverride === "string" && replyToOverride.includes("@")
        ? replyToOverride
        : undefined;
    let fromName = "TechTalk";
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("business_name, reply_to_email")
          .eq("id", user.id)
          .single();
        if (profile?.business_name) fromName = profile.business_name;
        if (!replyTo) replyTo = profile?.reply_to_email || user.email || undefined;
      }
    } catch {
      // Supabase not configured (open mode) — send with defaults.
    }

    const from =
      process.env.RESEND_FROM || `${fromName} <onboarding@resend.dev>`;
    const html = text
      .split("\n")
      .map((line: string) => escapeHtml(line))
      .join("<br>");

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      text,
      html,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      return Response.json(
        { error: error.message || "Resend rejected the email." },
        { status: 502 }
      );
    }
    return Response.json({ ok: true, id: data?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    console.error("[send-email]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
