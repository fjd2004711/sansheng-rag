"use client";

import { Library as LibraryIcon, FileText } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { useLibrary } from "@/hooks/use-library";

/** Shows what the assistant answers from, so users know the scope of every answer. */
export function LibraryPopover() {
  const { library, loading } = useLibrary();
  const count = library?.documents.length ?? 0;
  const label = loading ? "正在读取资料库…" : count > 0 ? `回答依据：${count} 份资料` : "资料库还是空的";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors"
        >
          <LibraryIcon className="h-3.5 w-3.5" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">回答依据的资料</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            系统只根据这些资料回答；资料里没有的内容会直接说明，不会编造。
          </p>
        </div>
        <ul className="max-h-64 divide-y overflow-y-auto">
          {(library?.documents ?? []).map((doc) => (
            <li key={doc.filename} className="flex items-center gap-2 px-4 py-2 text-sm">
              <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={doc.filename}>
                {doc.filename}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">{doc.chunk_count} 段</span>
            </li>
          ))}
          {!loading && count === 0 && <li className="text-muted-foreground px-4 py-6 text-center text-sm">暂无资料</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
