import { containsSensitive } from "@/domain/privacy/scrub";
import { EVENT_SCHEMAS, type AnalyticsEvent, type EventName, type EventProps } from "./events";

/** Where batches go. No vendor is chosen yet (see docs/decisions.md), so the default sink drops them. */
export interface AnalyticsSink {
  send(batch: AnalyticsEvent[]): Promise<void>;
}
export const noopSink: AnalyticsSink = { send: async () => {} };

export interface QueueOptions {
  sink: AnalyticsSink;
  anonymousId: string;
  platform: AnalyticsEvent["platform"];
  intervalMs?: number;
  maxQueue?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  /** Called with a short reason when an event is dropped. Never receives the props. */
  onDrop?: (name: string, reason: "invalid" | "sensitive" | "opted_out" | "overflow") => void;
}

/**
 * Batches events and flushes every 30 s (or when the app goes to background).
 * track() never throws and never awaits, so analytics can't block the UI.
 */
export class AnalyticsQueue {
  private buf: AnalyticsEvent[] = [];
  private optedOut = true; // off until consent/tracking status is known
  private flushing = false;
  private readonly o: Required<Omit<QueueOptions, "onDrop">> & Pick<QueueOptions, "onDrop">;

  constructor(opts: QueueOptions) {
    this.o = {
      intervalMs: 30_000,
      maxQueue: 500,
      now: Date.now,
      setInterval: (fn, ms) => setInterval(fn, ms),
      ...opts,
    };
    this.o.setInterval(() => void this.flush(), this.o.intervalMs);
  }

  /** Respect ATT on iOS / Play privacy on Android / the in-app setting. Opting out clears the buffer. */
  setOptedOut(v: boolean) {
    this.optedOut = v;
    if (v) this.buf = [];
  }

  track<N extends EventName>(name: N, props: EventProps<N>): void {
    try {
      if (this.optedOut) return this.o.onDrop?.(name, "opted_out");
      const parsed = EVENT_SCHEMAS[name].safeParse(props);
      if (!parsed.success) return this.o.onDrop?.(name, "invalid");
      if (containsSensitive(parsed.data)) return this.o.onDrop?.(name, "sensitive");
      if (this.buf.length >= this.o.maxQueue) {
        this.buf.shift();
        this.o.onDrop?.(name, "overflow");
      }
      this.buf.push({
        name,
        props: parsed.data as Record<string, unknown>,
        anonymousId: this.o.anonymousId,
        platform: this.o.platform,
        ts: this.o.now(),
      });
    } catch {
      // analytics must never break the app
    }
  }

  get size() {
    return this.buf.length;
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buf.length === 0 || this.optedOut) return;
    this.flushing = true;
    const batch = this.buf.splice(0, this.buf.length);
    try {
      await this.o.sink.send(batch);
    } catch {
      // put back what fits; drop the oldest beyond the cap
      this.buf = [...batch, ...this.buf].slice(-this.o.maxQueue);
    } finally {
      this.flushing = false;
    }
  }
}
