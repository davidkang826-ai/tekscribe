import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-8">
          <Logo size={34} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-7 shadow-sm">
          <div className="text-4xl mb-3">📬</div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Check your email
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            We sent you a verification link. Click it to confirm your account,
            then you&apos;ll add your phone number and you&apos;re ready to go.
          </p>
        </div>
        <p className="text-center text-sm text-muted mt-5">
          Already verified?{" "}
          <Link href="/login" className="text-brand font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
