import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { signIn } from "@/lib/supabase/actions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/");
  }

  const { error, deleted } = await props.searchParams;
  const notice = deleted
    ? "Your account and all its data have been deleted. Thanks for trying TekScribe."
    : error === "verification"
      ? "That verification link was invalid or expired. Try signing in, or sign up again."
      : undefined;

  return <AuthForm mode="login" action={signIn} notice={notice} />;
}
