"use client";

import { CornerDownRight } from "lucide-react";

export function FollowupChips({ items, onAsk }: { items: string[]; onAsk: (question: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5" aria-label="接下来可以问">
      <p className="text-muted-foreground text-xs">接下来可以问</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onAsk(item)}
            className="border-border bg-card hover:border-foreground/30 hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-sm transition-colors"
          >
            <CornerDownRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
