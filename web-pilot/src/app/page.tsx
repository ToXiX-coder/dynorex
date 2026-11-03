import Link from "next/link";
import { TAGLINE, TorqPlaceholder, Wordmark } from "@/components/brand";
import { btn, Card } from "@/components/ui";

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  return (
    <div className="space-y-12">
      {deleted && (
        <p role="status" className="rounded border border-lime p-3">
          ✓ Your account and all of its records were deleted.
        </p>
      )}
      <section className="space-y-6 pt-4">
        <div className="flex items-center gap-4">
          <TorqPlaceholder size={56} />
          <Wordmark className="text-4xl sm:text-6xl" />
        </div>
        <p className="font-display text-2xl font-bold uppercase tracking-wide text-lime sm:text-4xl">
          {TAGLINE}
        </p>
        <h1 className="max-w-2xl text-xl sm:text-2xl">
          Keep your build records together. Share them when you choose.
        </h1>
        <p className="max-w-2xl text-silver">
          Log your mods, repairs and setup notes in one place, with receipts and sheets attached.
          Your garage is private. You decide what goes on any link you share, and you can turn the
          link off.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/demo" className={btn.primary}>
            Open demo garage
          </Link>
          <Link href="/pilot" className={btn.secondary}>
            Join the shop pilot
          </Link>
        </div>
        <p className="max-w-2xl rounded border border-line p-3 text-sm text-silver">
          <strong className="text-bone">How records work:</strong> build records are owner-entered
          or attached from documents. Dynorex does not independently verify the work.
        </p>
      </section>

      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="font-display text-2xl font-bold uppercase">
          How the pilot works
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <h3 className="font-bold">1. Log it</h3>
            <p className="mt-1 text-sm text-silver">
              Add a vehicle. Add mods, service and setup notes in date order. Attach a receipt or
              sheet.
            </p>
          </Card>
          <Card>
            <h3 className="font-bold">2. Ask for a record</h3>
            <p className="mt-1 text-sm text-silver">
              Send a one-time link to a shop. They fill a short form. You approve it before it shows
              up.
            </p>
          </Card>
          <Card>
            <h3 className="font-bold">3. Share on your terms</h3>
            <p className="mt-1 text-sm text-silver">
              Pick the entries and fields. Get a read-only link that expires and can be revoked.
            </p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="shops" className="space-y-3">
        <h2 id="shops" className="font-display text-2xl font-bold uppercase">
          For shops
        </h2>
        <p className="max-w-2xl text-silver">
          Dynorex is testing whether owners and shops find a simple record link useful. No shops
          have signed up as partners yet, and nobody has agreed to pay for anything. If you want to
          talk, tell us a little about your shop.
        </p>
        <Link href="/pilot" className={btn.secondary}>
          Join the shop pilot
        </Link>
      </section>

      <section aria-labelledby="soon" className="space-y-2">
        <h2 id="soon" className="font-display text-2xl font-bold uppercase">
          Not built yet
        </h2>
        <p className="max-w-2xl text-silver">
          Later ideas, not part of this pilot: <strong className="text-bone">The Line</strong>{" "}
          (routes and drives) and <strong className="text-bone">The Paddock</strong> (community and
          events).
        </p>
      </section>
    </div>
  );
}
