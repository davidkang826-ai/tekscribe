"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string };

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
      data: { business_name: businessName || null },
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

export async function saveProfile(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();

  if (!phone) return { error: "Please enter your phone number." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ phone, business_name: businessName || null })
    .eq("id", user.id);

  if (error) return { error: error.message };
  redirect("/");
}
