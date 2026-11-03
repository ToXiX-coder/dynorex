import { TYPE_LABELS } from "@/lib/labels";
import type { PublicVehicleView } from "@/lib/publicView";
import { StatusBadge } from "./ui";

/** Read-only view used by both real share pages and the demo share preview. */
export function PublicVehicle({ view }: { view: PublicVehicleView }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold uppercase">
          {view.year} {view.make} {view.model}
        </h1>
        {view.nickname && <p className="text-silver">“{view.nickname}”</p>}
        {view.currentMileage !== undefined && (
          <p className="text-silver">
            Odometer: {view.currentMileage.toLocaleString("en-US")} {view.mileageUnit}
          </p>
        )}
        <p className="text-sm text-silver">
          Read-only. Shared by the owner until {view.expiresAt.slice(0, 10)}. Records are
          owner-entered or attached from documents. Dynorex has not independently verified them.
        </p>
      </header>
      {view.records.length === 0 ? (
        <p className="rounded border border-dashed border-silver p-6 text-center text-silver">
          The owner has not shared any entries.
        </p>
      ) : (
        <ol className="space-y-4">
          {view.records.map((r, i) => (
            <li key={i} className="rounded-lg border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-silver">
                <time dateTime={r.date} className="font-semibold text-bone">
                  {r.date}
                </time>
                <span>·</span>
                <span>{TYPE_LABELS[r.type]}</span>
                {r.status && <StatusBadge status={r.status} />}
              </div>
              <h2 className="mt-1 text-lg font-bold">{r.title}</h2>
              <p className="text-sm text-silver">
                {[r.category, r.partName, r.brand, r.partNumber && `Part # ${r.partNumber}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.mileage !== undefined && (
                <p className="text-sm">
                  Odometer: {r.mileage.toLocaleString("en-US")} {view.mileageUnit}
                </p>
              )}
              {r.cost && <p className="text-sm">Cost: {r.cost}</p>}
              {r.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{r.notes}</p>}
              <p className="mt-2 text-sm text-silver">
                <span className="font-semibold text-bone">Source:</span> {r.sourceLabel}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
