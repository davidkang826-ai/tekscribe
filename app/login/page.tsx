import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { signIn } from "@/lib/supabase/actions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/");
  }

  const { error } = await props.searchParams;
  const notice =
    error === "verification"
      ? "That verification link was invalid or expired. Try signing in, or sign up again."
      : undefined;

  return <AuthForm mode="login" action={signIn} notice={notice} />;
}
