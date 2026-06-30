import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Privacy Policy — TekScribe" };

export default function PrivacyPage() {
  return (
    <div className="min-h-full">
      <header className="border-b border-border bg-surface">
        <div className="max-w-2xl mx-auto px-5 h-16 flex items-center">
          <Link href="/">
            <Logo size={28} />
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-10 text-[15px] leading-relaxed text-foreground">
        <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
        <p className="text-sm text-muted mb-8">Last updated: June 29, 2026</p>

        <p className="mb-4">
          TekScribe (&quot;we&quot;) helps field-service technicians turn voice
          notes into job summaries and customer messages. This policy explains
          what we collect and how we use it.
        </p>

        <Section title="Information we collect">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Account info:</strong> your email, business name, and
              phone number.
            </li>
            <li>
              <strong>Voice recordings &amp; transcripts:</strong> the audio you
              record and the text/summaries generated from it.
            </li>
            <li>
              <strong>Customer details you enter:</strong> the email addresses
              and phone numbers you use to send summaries to your customers.
            </li>
            <li>
              <strong>Usage data:</strong> basic logs needed to operate and
              secure the service.
            </li>
          </ul>
        </Section>

        <Section title="How we use it">
          <p>
            To transcribe and summarize your recordings, send the messages you
            ask us to send, maintain your account and history, and keep the
            service secure and reliable.
          </p>
        </Section>

        <Section title="Service providers we share data with">
          <p>We use trusted processors to run TekScribe:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>OpenAI</strong> — transcription and AI summarization.
            </li>
            <li>
              <strong>Supabase</strong> — authentication and data storage.
            </li>
            <li>
              <strong>Resend</strong> — sending customer emails.
            </li>
            <li>
              <strong>Vercel</strong> — application hosting.
            </li>
          </ul>
          <p className="mt-2">
            We do not sell your data or your customers&apos; data.
          </p>
        </Section>

        <Section title="Data retention">
          <p>
            We keep your recordings, transcripts, and summaries until you delete
            them or close your account. You can delete saved notes at any time.
          </p>
        </Section>

        <Section title="Your responsibilities">
          <p>
            You are responsible for having the right to record and to contact
            the customers whose details you enter, in line with applicable laws.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can access, correct, export, or delete your data by contacting
            us. We will respond within a reasonable time.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions? Email{" "}
            <a href="mailto:privacy@tekscribe.io" className="text-brand">
              privacy@tekscribe.io
            </a>
            .
          </p>
        </Section>

        <p className="mt-10 text-xs text-muted">
          This policy is provided as a starting point and is not legal advice;
          have it reviewed by a qualified attorney before broad commercial use.
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <div className="text-muted">{children}</div>
    </section>
  );
}
