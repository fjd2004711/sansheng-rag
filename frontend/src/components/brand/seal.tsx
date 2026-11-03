import { useId } from "react";

import { cn } from "@/lib/utils";

interface SealProps {
  size?: number;
  /** Breathes slowly while an answer is being written and checked. */
  busy?: boolean;
  className?: string;
}

/**
 * 三省's mark: a small zhuwen (red-character) seal — vermilion strokes and border on the paper, with the slightly
 * uneven edge of a real impression.
 */
export function Seal({ size = 32, busy = false, className }: SealProps) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="三省"
      className={cn("shrink-0", busy && "seal-busy", className)}
    >
      <defs>
        <filter id={`worn-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
        </filter>
      </defs>
      <g filter={`url(#worn-${id})`} fill="var(--color-seal)" stroke="var(--color-seal)">
        <rect x="7" y="7" width="86" height="86" rx="3" fill="none" strokeWidth="6" />
        <text
          x="50"
          y="45"
          textAnchor="middle"
          fontSize="36"
          fontWeight="900"
          stroke="none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          三
        </text>
        <text
          x="50"
          y="83"
          textAnchor="middle"
          fontSize="36"
          fontWeight="900"
          stroke="none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          省
        </text>
      </g>
    </svg>
  );
}
