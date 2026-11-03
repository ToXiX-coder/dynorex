import type { ReactNode } from "react";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { RecordStatus, Source } from "@/lib/types";

const base =
  "inline-flex min-h-11 items-center justify-center rounded px-4 py-2 text-sm font-bold no-underline transition-colors disabled:opacity-60";

export const btn = {
  primary: `${base} bg-lime text-asphalt hover:bg-bone`,
  secondary: `${base} border border-silver text-bone hover:border-lime hover:text-lime`,
  /** Red marks a destructive action. The word and the confirm step carry the meaning, not just the colour. */
  danger: `${base} border-2 border-alert text-bone hover:bg-alert`,
};

export const inputCls =
  "block w-full min-h-11 rounded border border-silver bg-asphalt px-3 py-2 text-bone placeholder:text-silver/70";

export function Field({
  label,
  name,
  hint,
  children,
  required,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-semibold">
        {label}
        {required && <span className="text-silver"> (required)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${name}-hint`} className="text-sm text-silver">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextInput({
  label,
  name,
  hint,
  required,
  ...rest
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} name={name} hint={hint} required={required}>
      <input
        id={name}
        name={name}
        required={required}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className={inputCls}
        {...rest}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  name,
  hint,
  options,
  defaultValue,
  required,
  blank,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  blank?: string;
  options: readonly (readonly [string, string])[];
  defaultValue?: string;
}) {
  return (
    <Field label={label} name={name} hint={hint} required={required}>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className={inputCls}
      >
        {blank !== undefined && <option value="">{blank}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextArea({
  label,
  name,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  hint?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} name={name} hint={hint}>
      <textarea
        id={name}
        name={name}
        rows={4}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className={inputCls}
        {...rest}
      />
    </Field>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-panel p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6 space-y-2">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl">
        {children}
      </h1>
      {sub && <p className="max-w-prose text-silver">{sub}</p>}
    </header>
  );
}

const STATUS_MARK: Record<RecordStatus, string> = {
  planned: "○",
  ordered: "◔",
  in_progress: "◑",
  installed: "●",
  removed: "✕",
  completed: "✓",
};

/** Status uses a symbol AND a word, so colour is never the only signal. */
export function StatusBadge({ status }: { status: RecordStatus }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-silver px-2 py-0.5 text-xs font-semibold">
      <span aria-hidden="true">{STATUS_MARK[status]}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function SourceNote({ source }: { source: Source }) {
  return (
    <p className="text-sm text-silver">
      <span className="font-semibold text-bone">Source:</span> {SOURCE_LABELS[source].long}
    </p>
  );
}

export function SampleBanner() {
  return (
    <p
      role="note"
      className="mb-6 rounded border-2 border-dashed border-lime p-3 text-center text-sm font-bold uppercase tracking-wide"
    >
      SAMPLE DATA — NOT A REAL CUSTOMER OR VEHICLE
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-silver p-8 text-center">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mx-auto mt-2 max-w-prose space-y-4 text-silver">{children}</div>
    </div>
  );
}
