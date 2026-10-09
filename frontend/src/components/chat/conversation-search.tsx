"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";

import { apiClient } from "@/lib/api-client";

interface Hit {
  id: string;
  title: string | null;
  updated_at: string;
  snippet: string | null;
}

/** A search box over the user's own conversations; shows the normal list while the box is empty. */
export function ConversationSearch({
  onSelect,
  children,
}: {
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const text = query.trim();

  useEffect(() => {
    if (!text) {
      setHits(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiClient
        .get<{ items: Hit[] }>("/conversations/search", { params: { q: text } })
        .then((data) => !cancelled && setHits(data.items))
        .catch(() => !cancelled && setHits([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pt-3 pb-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-5 h-3.5 w-3.5 -translate-y-1/2 translate-y-[2px]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索对话"
          aria-label="搜索对话"
          className="bg-muted/50 focus:border-foreground/30 w-full rounded-lg border border-transparent py-1.5 pr-7 pl-8 text-sm outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="清除搜索"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-5 -translate-y-1/2 translate-y-[2px]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!text ? (
        children
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {hits === null && <li className="text-muted-foreground px-3 py-3 text-xs">搜索中…</li>}
          {hits?.length === 0 && <li className="text-muted-foreground px-3 py-3 text-xs">没有找到相关对话</li>}
          {hits?.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(hit.id);
                  setQuery("");
                }}
                className="hover:bg-accent w-full rounded-lg px-3 py-2 text-left"
              >
                <p className="truncate text-sm font-medium">{hit.title || "新对话"}</p>
                {hit.snippet && <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{hit.snippet}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
