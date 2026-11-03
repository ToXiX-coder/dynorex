/**
 * PLACEHOLDER monogram for the Torq mascot concept (angular T-Rex / skull with tachometer cues).
 * No approved vector exists in this repository, so this is deliberately just a plain "T" in a notched
 * tile. It is not a logo. Replace it when real art is approved.
 */
export function TorqPlaceholder({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Torq mascot placeholder"
      className="shrink-0"
    >
      <polygon points="6,2 34,2 38,10 38,38 2,38 2,10" fill="#AAFF00" />
      <path d="M11 11h18v5h-6.5v14h-5V16H11z" fill="#111315" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-black uppercase tracking-[0.18em] ${className}`}>
      DYNOREX
    </span>
  );
}

export const TAGLINE = "Prove Your Build. Find Your Road.";
