"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

interface ResizeHandleProps extends Omit<ComponentProps<"div">, "children"> {
  edge: "left" | "right";
  dragging?: boolean;
  aria: { min: number; max: number; now: number };
  label: string;
}

/** A thin draggable divider on one edge of a side panel. Double-click resets; arrow keys nudge. */
export function ResizeHandle({ edge, dragging, aria, label, className, ...rest }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={aria.min}
      aria-valuemax={aria.max}
      aria-valuenow={Math.round(aria.now)}
      // A focusable separator is the WAI-ARIA "window splitter" pattern; the lint rule only knows static roles.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      title="拖动调整宽度，双击恢复默认"
      className={cn(
        "group absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none outline-none",
        edge === "right" ? "-right-1" : "-left-1",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors group-hover:w-0.5 group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-primary/60",
          dragging ? "w-0.5 bg-primary" : "bg-transparent",
        )}
      />
    </div>
  );
}
