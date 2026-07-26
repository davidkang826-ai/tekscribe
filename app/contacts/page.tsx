import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import ContactsList from "@/components/ContactsList";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Contact } from "@/lib/types";

export default async function ContactsPage() {
  if (!isSupabaseConfigured) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ask for the address column, tolerating older databases that don't have it
  // yet so the directory always loads.
  let contacts: Contact[] = [];
  const full = await supabase
    .from("customers")
    .select("id, name, email, phone, address")
    .order("name", { ascending: true });
  if (!full.error) {
    contacts = (full.data ?? []) as Contact[];
  } else {
    const { data } = await supabase
      .from("customers")
      .select("id, name, email, phone")
      .order("name", { ascending: true });
    contacts = ((data ?? []) as Omit<Contact, "address">[]).map((c) => ({
      ...c,
      address: null,
    }));
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <AppHeader />

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain w-full max-w-3xl mx-auto px-5 pt-4 pb-28">
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
          Clients
        </h1>
        <p className="text-[14px] text-muted mb-4">
          Everyone you have served, plus anyone you add. New clients are saved
          here automatically when you record a job.
        </p>

        <ContactsList initial={contacts} />
      </main>

      <BottomNav />
    </div>
  );
}
