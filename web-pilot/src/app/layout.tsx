import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { TorqPlaceholder, Wordmark } from "@/components/brand";
import { logOutAction } from "./actions";
import { currentUser } from "@/lib/session";
import { btn } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "Dynorex: Prove Your Build. Find Your Road.", template: "%s | Dynorex" },
  description: "Keep your build records together. Share them when you choose.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111315" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const nav =
    "inline-flex min-h-11 items-center px-2 text-sm font-semibold text-bone no-underline hover:text-lime";
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only-focusable bg-lime px-4 py-2 font-bold text-asphalt">
          Skip to content
        </a>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-3 text-bone no-underline"
              aria-label="Dynorex home"
            >
              <TorqPlaceholder size={32} />
              <Wordmark className="text-xl" />
            </Link>
            <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
              <Link className={nav} href="/demo">
                Demo garage
              </Link>
              <Link className={nav} href="/pilot">
                Shop pilot
              </Link>
              {user ? (
                <>
                  <Link className={nav} href="/garage">
                    My garage
                  </Link>
                  <Link className={nav} href="/account">
                    Account
                  </Link>
                  <form action={logOutAction}>
                    <button className={btn.secondary} type="submit">
                      Log out
                    </button>
                  </form>
                </>
              ) : (
                <Link className={nav} href="/login">
                  Log in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl space-y-2 px-4 py-6 text-sm text-silver">
            <p>
              <Wordmark /> is an early pilot. Records are entered by owners or attached from
              documents. Dynorex does not independently verify vehicles, parts, work or the people
              who submit it.
            </p>
            <p>No ads, no location tracking, no third-party analytics.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
