"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; ok?: boolean };

async function siteOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") || `http://${h.get("host") ?? "localhost:3000"}`;
}

export async function signUp(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const businessName = String(formData.get("business_name") ?? "").trim();

  if (!businessName)
    return { error: "Please enter your business name (or your own name)." };
  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      data: { business_name: businessName },
    },
  });

  if (error) return { error: error.message };
  redirect("/verify-email");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email." };

  const supabase = await createClient();
  const origin = await siteOrigin();
  // Sends a recovery link; /auth/confirm verifies it and forwards to reset.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  // Always report success (don't reveal whether the email exists).
  return { ok: true };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (password !== confirm)
    return {
      error: "Those passwords don't match. Type the same password in both boxes.",
    };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function saveProfile(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const replyTo = String(formData.get("reply_to_email") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!phone) return { error: "Please enter your phone number." };
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo))
    return { error: "That reply-to email doesn't look right." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({
      phone,
      reply_to_email: replyTo || user.email,
      display_name: displayName || null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  redirect("/");
}

/** Settings page: update the tech's name, reply-to email, and business name. */
export async function updateSettings(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const replyTo = String(formData.get("reply_to_email") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();

  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo))
    return { error: "That reply-to email doesn't look right." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName || null,
      reply_to_email: replyTo || user.email,
      business_name: businessName || null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}
