import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { signUp } from "@/lib/supabase/actions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SignupPage() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/");
  }

  return <AuthForm mode="signup" action={signUp} />;
}
