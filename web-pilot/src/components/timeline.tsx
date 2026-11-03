import Link from "next/link";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/labels";
import { formatCost } from "@/lib/publicView";
import type { RecordFilter, RecordView } from "@/lib/services";
import { RECORD_TYPES, STATUSES } from "@/lib/types";
import { btn, EmptyState, inputCls, SourceNote, StatusBadge } from "./ui";

type Params = Record<string, string | string[] | undefined>;

export function parseFilter(sp: Params): RecordFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const type = one("type");
  const status = one("status");
  return {
    type: (RECORD_TYPES as readonly string[]).includes(type ?? "")
      ? (type as RecordFilter["type"])
      : undefined,
    status: (STATUSES as readonly string[]).includes(status ?? "")
      ? (status as RecordFilter["status"])
      : undefined,
    sort: one("sort") === "oldest" ? "oldest" : "newest",
  };
}

/** A plain GET form, so filters work without JavaScript and can be bookmarked. */
export function FilterBar({ filter }: { filter: RecordFilter }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filter records">
      <div>
        <label htmlFor="f-type" className="block text-sm font-semibold">
          Type
        </label>
        <select
          id="f-type"
          name="type"
          defaultValue={filter.type ?? ""}
          className={`${inputCls} w-auto`}
        >
          <option value="">All types</option>
          {RECORD_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-status" className="block text-sm font-semibold">
          Status
        </label>
        <select
          id="f-status"
          name="status"
          defaultValue={filter.status ?? ""}
          className={`${inputCls} w-auto`}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-sort" className="block text-sm font-semibold">
          Order
        </label>
        <select
          id="f-sort"
          name="sort"
          defaultValue={filter.sort ?? "newest"}
          className={`${inputCls} w-auto`}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      <button type="submit" className={btn.secondary}>
        Apply
      </button>
    </form>
  );
}

export function Timeline({
  items,
  vehicleId,
  mode,
  unit,
  filtered,
}: {
  items: RecordView[];
  vehicleId: string;
  mode: "owner" | "demo";
  unit: string;
  filtered: boolean;
}) {
  if (items.length === 0) {
    return filtered ? (
      <EmptyState title="No records match these filters">
        <p>Try a different type or status.</p>
      </EmptyState>
    ) : (
      <EmptyState title="No records yet">
        <p>Add the first mod, service or setup note for this vehicle.</p>
        {mode === "owner" && (
          <Link href={`/garage/${vehicleId}/records/new`} className={btn.primary}>
            Add a record
          </Link>
        )}
      </EmptyState>
    );
  }
  return (
    <ol className="space-y-4">
      {items.map((r) => (
        <li key={r.id}>
          <article
            className="rounded-lg border border-line bg-panel p-4"
            aria-labelledby={`rec-${r.id}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm text-silver">
              <time dateTime={r.date} className="font-semibold text-bone">
                {r.date}
              </time>
              <span>·</span>
              <span>{TYPE_LABELS[r.type]}</span>
              {r.status && <StatusBadge status={r.status} />}
            </div>
            <h3 id={`rec-${r.id}`} className="mt-1 text-lg font-bold">
              {r.title}
            </h3>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Row k="Category" v={r.category} />
              <Row k="Part or service" v={r.partName} />
              <Row k="Brand" v={r.brand} />
              <Row k="Part number" v={r.partNumber} />
              <Row
                k="Odometer"
                v={
                  r.mileage !== undefined
                    ? `${r.mileage.toLocaleString("en-US")} ${unit}`
                    : undefined
                }
              />
              <Row
                k="Cost"
                v={r.costCents !== undefined ? formatCost(r.costCents, r.currency) : undefined}
              />
              <Row k="Sent by (as typed, unchecked)" v={r.submitterLabel} />
            </dl>
            {r.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{r.notes}</p>}
            {r.attachments.length > 0 && (
              <ul className="mt-2 text-sm">
                {r.attachments.map((a) => (
                  <li key={a.id}>
                    📎{" "}
                    {mode === "owner" ? (
                      <a
                        href={`/api/attachments/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {a.displayName}
                      </a>
                    ) : (
                      <span>{a.displayName} (sample, no real file)</span>
                    )}{" "}
                    <span className="text-silver">
                      ({Math.max(1, Math.round(a.size / 1024))} KB)
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <SourceNote source={r.source} />
            </div>
            {mode === "owner" && r.source !== "shared_link" && (
              <div className="mt-3">
                <Link href={`/garage/${vehicleId}/records/${r.id}/edit`} className={btn.secondary}>
                  Edit<span className="sr-only">: {r.title}</span>
                </Link>
              </div>
            )}
          </article>
        </li>
      ))}
    </ol>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-silver">{k}:</dt>
      <dd>{v}</dd>
    </div>
  );
}
