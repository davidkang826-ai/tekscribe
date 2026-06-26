import { Logo } from "@/components/Logo";
import Recorder from "@/components/Recorder";

export default function Home() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo size={30} />
          <span className="text-xs font-medium text-muted">
            for field-service pros
          </span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-10 sm:py-14">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Finish the job. Talk it out.
          </h1>
          <p className="mt-2 text-muted max-w-md mx-auto">
            Record a quick voice note from the truck. TechTalk transcribes it,
            pulls out the parts and next steps, and writes the customer update
            for you.
          </p>
        </div>

        <Recorder />
      </main>

      <footer className="w-full border-t border-border py-6 text-center text-xs text-muted">
        TechTalk · voice-to-summary for the trades
      </footer>
    </div>
  );
}
