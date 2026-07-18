import { LogoMark } from "@/components/Logo";

/**
 * Instant loading state for every route: shows the moment a navigation
 * starts, while the server renders the page. The mark spins up fast,
 * settles at full size, then breathes gently (see .tt-logo-load).
 */
export default function Loading() {
  return (
    <div className="min-h-full flex flex-1 flex-col items-center justify-center">
      <LogoMark size={64} className="tt-logo-load" />
    </div>
  );
}
