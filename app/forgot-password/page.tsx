import { Logo } from "@/components/Logo";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size={34} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground mb-1">
            Reset your password
          </h1>
          <p className="text-sm text-muted mb-5">
            Enter your email and we&apos;ll send you a 6-digit code.
          </p>
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
