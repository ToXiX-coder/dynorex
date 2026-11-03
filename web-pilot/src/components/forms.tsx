"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FormState } from "@/app/actions";
import { btn } from "./ui";

const PendingContext = createContext(false);

export function SubmitButton({
  children,
  pending: pendingText = "Working…",
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pending?: string;
  variant?: keyof typeof btn;
  className?: string;
}) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${btn[variant]} ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

/** Submit button that asks "Are you sure?" first. Works inside any <form action={...}>. */
export function ConfirmButton({
  children,
  message,
  variant = "danger",
}: {
  children: ReactNode;
  message: string;
  variant?: keyof typeof btn;
}) {
  return (
    <button
      type="submit"
      className={btn[variant]}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function CopyBox({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor="copybox">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="copybox"
          readOnly
          value={value}
          className="min-w-0 flex-1 rounded border border-line bg-asphalt px-3 py-2 font-mono text-sm"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className={btn.primary}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied("ok");
            } catch {
              setCopied("fail");
            }
          }}
        >
          Copy link
        </button>
      </div>
      <p role="status" className="text-sm text-silver">
        {copied === "ok" && "Copied."}
        {copied === "fail" && "Could not copy automatically. Select the link and copy it by hand."}
      </p>
    </div>
  );
}

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

/**
 * A form with server validation messages, a busy state, and (optionally) a result area.
 * Works with JavaScript off for the basic submit; the messages need JavaScript.
 */
export function ActionForm({
  action,
  children,
  success,
  className = "space-y-5",
  resetOnSuccess = false,
}: {
  action: Action;
  children: ReactNode;
  /** Shown instead of the form after `state.message` is set. */
  success?: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const alertRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) alertRef.current?.focus();
  }, [state]);
  useEffect(() => {
    if (resetOnSuccess && state.linkUrl) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  if (state.message && success) {
    return (
      <div role="status" className="rounded border border-lime p-4">
        {success}
      </div>
    );
  }

  return (
    // Submitting through a transition (not the `action` prop) keeps what the person typed when the
    // server says "fix this". React would otherwise clear the whole form after every action.
    // method="post" means nothing can end up in the URL if someone submits before the page is ready.
    <form
      ref={formRef}
      method="post"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>
        {state.error && (
          <div
            ref={alertRef}
            role="alert"
            tabIndex={-1}
            className="rounded border-2 border-alert bg-panel p-4"
          >
            <p className="font-bold">⚠ Error: {state.error}</p>
            {state.issues && state.issues.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {state.issues.map((i, n) => (
                  <li key={n}>
                    <span className="font-semibold">{i.path}</span>: {i.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {children}
        {state.linkUrl && (
          <div className="space-y-3 rounded border border-lime bg-panel p-4">
            <p className="font-bold">✓ Link created</p>
            <CopyBox value={state.linkUrl} label="Your link" />
            <p className="text-sm text-silver">{state.linkNote}</p>
          </div>
        )}
      </PendingContext.Provider>
    </form>
  );
}
