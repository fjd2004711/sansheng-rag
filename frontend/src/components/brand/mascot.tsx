"use client";

import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/utils";

export type MascotMood = "idle" | "thinking" | "checking" | "happy" | "sorry";

interface MascotProps {
  mood?: MascotMood;
  size?: number;
  /** Eyes follow the pointer. Off for tiny avatars, where it is only noise. */
  lookAtPointer?: boolean;
  className?: string;
}

const MAX_LOOK = 3.2;

/**
 * 小证 — the app's little checker. A round bean with a check-mark antenna.
 * Moods: idle (blinks), thinking (looks up, dots), checking (magnifier), happy (^ ^), sorry (drooping).
 */
export function Mascot({ mood = "idle", size = 96, lookAtPointer = true, className }: MascotProps) {
  const root = useRef<SVGSVGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const id = useId();

  useEffect(() => {
    if (!lookAtPointer || mood !== "idle") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = root.current?.getBoundingClientRect();
        if (!box || !eyes.current) return;
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / 240) * MAX_LOOK;
        eyes.current.style.transform = `translate(${(dx / distance) * reach}px, ${(dy / distance) * reach}px)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [lookAtPointer, mood]);

  const eyeLook =
    mood === "thinking" ? "translate(-2px,-3px)" : mood === "checking" ? "translate(3px,0)" : undefined;
  const happy = mood === "happy";
  const sorry = mood === "sorry";

  return (
    <svg
      ref={root}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="小证"
      className={cn("mascot shrink-0", `mascot-${mood}`, className)}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#E4FF8C" />
          <stop offset="100%" stopColor="#B5E83A" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="93" rx="26" ry="3.6" fill="currentColor" opacity="0.1" />
      <g className="mascot-body">
        {/* check-mark antenna */}
        <path d="M50 24 V14" stroke="#7FA81B" strokeWidth="3" strokeLinecap="round" />
        <circle cx="50" cy="10" r="7" fill="#7FA81B" />
        <path d="M46.5 10 L49 12.6 L54 7.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        <rect x="14" y="22" width="72" height="64" rx="30" fill={`url(#${id}-body)`} />
        <ellipse cx="36" cy="88" rx="9" ry="4" fill="#9CCB2A" />
        <ellipse cx="64" cy="88" rx="9" ry="4" fill="#9CCB2A" />

        <ellipse cx="29" cy="62" rx="6" ry="3.6" fill="#FF9AA8" opacity="0.55" />
        <ellipse cx="71" cy="62" rx="6" ry="3.6" fill="#FF9AA8" opacity="0.55" />

        <g ref={eyes} className="mascot-eyes" style={eyeLook ? { transform: eyeLook } : undefined}>
          {happy ? (
            <>
              <path d="M32 54 Q38 46 44 54" stroke="#1E2410" strokeWidth="3.4" strokeLinecap="round" fill="none" />
              <path d="M56 54 Q62 46 68 54" stroke="#1E2410" strokeWidth="3.4" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <g className="mascot-blink">
              <ellipse cx="38" cy={sorry ? 54 : 52} rx="5" ry={sorry ? 5.5 : 7} fill="#1E2410" />
              <ellipse cx="62" cy={sorry ? 54 : 52} rx="5" ry={sorry ? 5.5 : 7} fill="#1E2410" />
              <circle cx="40" cy="49.5" r="1.7" fill="#fff" />
              <circle cx="64" cy="49.5" r="1.7" fill="#fff" />
            </g>
          )}
          {sorry && (
            <>
              <path d="M31 47 L43 43.5" stroke="#1E2410" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M69 47 L57 43.5" stroke="#1E2410" strokeWidth="2.4" strokeLinecap="round" />
            </>
          )}
        </g>

        {/* mouth */}
        {happy ? (
          <path d="M42 62 A8 9.5 0 0 0 58 62 Z" fill="#1E2410" />
        ) : sorry ? (
          <path d="M43 70 Q50 64 57 70" stroke="#1E2410" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        ) : mood === "thinking" ? (
          <ellipse cx="50" cy="67" rx="3" ry="3.4" fill="#1E2410" />
        ) : mood === "checking" ? (
          <path d="M44 67 H56" stroke="#1E2410" strokeWidth="2.8" strokeLinecap="round" />
        ) : (
          <path d="M43 65 Q50 71 57 65" stroke="#1E2410" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        )}
      </g>

      {mood === "thinking" && (
        <g className="mascot-dots" fill="#7FA81B">
          <circle cx="78" cy="14" r="2.4" />
          <circle cx="86" cy="10" r="2.8" />
          <circle cx="95" cy="5" r="3.2" />
        </g>
      )}
      {mood === "checking" && (
        <g className="mascot-lens">
          <circle cx="70" cy="46" r="13" fill="#fff" fillOpacity="0.28" stroke="#3B4A12" strokeWidth="3.2" />
          <path d="M79.5 55.5 L90 66" stroke="#3B4A12" strokeWidth="4.2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
