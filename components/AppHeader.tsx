import Link from "next/link";
import { Logo } from "./Logo";

/**
 * The app's top bar. Sticky with an opaque backdrop and safe-area padding,
 * so scrolling content slides underneath it instead of colliding with the
 * phone's clock / status bar.
 */
export default function AppHeader({ linkHome = true }: { linkHome?: boolean }) {
  return (
    <header className="sticky top-0 z-30 w-full bg-background/95 px-5 pb-2 pt-[calc(env(safe-area-inset-top)+0.875rem)] backdrop-blur">
      {linkHome ? (
        <Link href="/">
          <Logo size={30} />
        </Link>
      ) : (
        <Logo size={30} />
      )}
    </header>
  );
}
