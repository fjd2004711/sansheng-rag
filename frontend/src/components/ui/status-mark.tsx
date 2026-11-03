import { cn } from "@/lib/utils";

export type MarkStatus = "pending" | "running" | "done" | "failed" | "skipped" | "warn";

const LABELS: Record<MarkStatus, string> = {
  pending: "未开始",
  running: "进行中",
  done: "完成",
  failed: "失败",
  skipped: "已跳过",
  warn: "需注意",
};

/** A status as a reader's mark in the margin (圈点): a filled dot when settled, a hollow ring while waiting. */
export function StatusMark({ status, className }: { status: MarkStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={LABELS[status]}
      title={LABELS[status]}
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        status === "done" && "bg-emerald-500",
        status === "running" && "animate-pulse bg-sky-500",
        status === "failed" && "bg-red-500",
        status === "warn" && "bg-amber-500",
        status === "pending" && "border-foreground/40 border-[1.5px]",
        status === "skipped" && "border-foreground/40 border-[1.5px] border-dashed",
        className,
      )}
    />
  );
}
