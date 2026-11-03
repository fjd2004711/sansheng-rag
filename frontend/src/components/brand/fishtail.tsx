import { cn } from "@/lib/utils";

interface FishtailProps {
  size?: number;
  /** The vermilion dot breathes slowly while an answer is being written and checked. */
  busy?: boolean;
  className?: string;
}

/**
 * 三省's mark: the black fishtail (鱼尾) printed in the block centre of a woodblock book page — the thin
 * "elephant trunk" rule above it, an arched opening lined with a fine paper-coloured line, and a vermilion dot below.
 */
export function Fishtail({ size = 28, busy = false, className }: FishtailProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="三省"
      className={cn("shrink-0", className)}
    >
      <rect x="49" y="4" width="2" height="9" fill="var(--color-foreground)" />
      <rect x="16" y="14" width="68" height="5" fill="var(--color-foreground)" />
      <path
        d="M16 23 H84 V82 C76 74 62 63 50 58 C38 63 24 74 16 82 Z"
        fill="var(--color-foreground)"
      />
      <path
        d="M22 28 H78 V70 C70 64 60 57 50 53 C40 57 30 64 22 70 Z"
        fill="none"
        stroke="var(--color-background)"
        strokeWidth="1.6"
      />
      <circle
        cx="50"
        cy="80"
        r="5.5"
        fill="var(--color-seal)"
        className={cn(busy && "brand-busy")}
      />
    </svg>
  );
}
