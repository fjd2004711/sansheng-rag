"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, Progress } from "@/components/ui";
import { cn, getErrorMessage } from "@/lib/utils";
import type { ReportSummary } from "@/types/report";

const STATUS: Record<ReportSummary["status"], { label: string; className: string }> = {
  queued: { label: "排队中", className: "text-muted-foreground" },
  running: { label: "生成中", className: "text-sky-600" },
  done: { label: "已完成", className: "text-emerald-600" },
  failed: { label: "失败", className: "text-red-600" },
};

interface ReportListProps {
  items: ReportSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

export function ReportList({ items, loading, selectedId, onSelect, onDelete }: ReportListProps) {
  const [pending, setPending] = useState<ReportSummary | null>(null);
  if (loading) return <p className="text-muted-foreground px-1 text-xs">读取中…</p>;
  if (items.length === 0) return null;

  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => {
          const status = STATUS[item.status];
          return (
            <li key={item.id}>
              <div
                className={cn(
                  "bg-card hover:border-foreground/30 group flex w-full items-start gap-2 rounded-xl border p-3 text-left transition-colors",
                  item.id === selectedId && "border-primary/60 ring-primary/20 ring-2",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium">{item.title || item.topic}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    <span className={status.className}>{status.label}</span> ·{" "}
                    {new Date(item.created_at).toLocaleString("zh-CN")}
                  </p>
                  {(item.status === "running" || item.status === "queued") && (
                    <div className="mt-2 space-y-1">
                      <Progress value={item.progress} className="h-1.5" />
                      <p className="text-muted-foreground truncate text-xs">{item.stage}</p>
                    </div>
                  )}
                  {item.status === "failed" && item.error && (
                    <p className="mt-1 text-xs text-red-600">{item.error}</p>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="删除报告"
                  onClick={() => setPending(item)}
                  className="text-muted-foreground hover:text-destructive shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="删除这份报告？"
        description={pending ? `“${pending.title || pending.topic}”删除后无法恢复。` : undefined}
        confirmLabel="删除"
        destructive
        onConfirm={async () => {
          if (!pending) return;
          try {
            await onDelete(pending.id);
          } catch (error) {
            toast.error(getErrorMessage(error, "删除失败"));
          } finally {
            setPending(null);
          }
        }}
      />
    </>
  );
}
