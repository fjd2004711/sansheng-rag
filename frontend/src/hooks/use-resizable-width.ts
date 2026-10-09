"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

interface Options {
  storageKey: string;
  initial: number;
  min: number;
  max: number;
  /** Which edge of the panel carries the handle: dragging right grows a "right"-edge panel, dragging left grows a "left"-edge one. */
  edge: "right" | "left";
}

const KEY_STEP = 16;

function readStored(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Drag-to-resize width for a side panel; remembered per browser. Returns props to spread on a ResizeHandle. */
export function useResizableWidth({ storageKey, initial, min, max, edge }: Options) {
  const clamp = useCallback((value: number) => Math.min(max, Math.max(min, value)), [min, max]);
  const [width, setWidth] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const stored = readStored(storageKey);
    if (stored !== null) setWidth(clamp(stored));
  }, [storageKey, clamp]);

  const persist = useCallback(
    (value: number) => {
      try {
        window.localStorage.setItem(storageKey, String(Math.round(value)));
      } catch {
        /* storage unavailable: the width just won't be remembered */
      }
    },
    [storageKey],
  );

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const delta = event.clientX - drag.current.startX;
    setWidth(clamp(drag.current.startWidth + (edge === "right" ? delta : -delta)));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    persist(width);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const grow = edge === "right" ? "ArrowRight" : "ArrowLeft";
    const shrink = edge === "right" ? "ArrowLeft" : "ArrowRight";
    if (event.key !== grow && event.key !== shrink) return;
    event.preventDefault();
    const next = clamp(width + (event.key === grow ? KEY_STEP : -KEY_STEP));
    setWidth(next);
    persist(next);
  };

  const reset = () => {
    setWidth(initial);
    persist(initial);
  };

  return {
    width,
    dragging,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown, onDoubleClick: reset },
    aria: { min, max, now: width },
  };
}
