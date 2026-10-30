import {
  Bot,
  CheckCircle2,
  Circle,
  Combine,
  GitFork,
  Loader2,
  MinusCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { TaskStatus } from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { GraphNode } from "@/types/orchestration";

export const KIND_META: Record<
  GraphNode["kind"],
  { label: string; icon: LucideIcon; tone: string }
> = {
  agent: { label: "单步", icon: Bot, tone: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  map: {
    label: "并行扇出",
    icon: GitFork,
    tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  },
  gate: {
    label: "质量门",
    icon: ShieldCheck,
    tone: "bg-amber-500/14 text-amber-600 dark:text-amber-400",
  },
  loop: {
    label: "自循环",
    icon: RefreshCw,
    tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  },
  merge: {
    label: "汇总",
    icon: Combine,
    tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  },
};

export const STATUS_META: Record<TaskStatus, { label: string; text: string; dot: string }> = {
  pending: { label: "等待", text: "text-muted-foreground", dot: "bg-muted-foreground/40" },
  running: { label: "运行中", text: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  done: { label: "完成", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  failed: { label: "失败", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  skipped: { label: "已跳过", text: "text-muted-foreground", dot: "bg-muted-foreground/60" },
};

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const base = cn("h-4 w-4 shrink-0", STATUS_META[status].text, className);
  if (status === "running") return <Loader2 className={cn(base, "animate-spin")} />;
  if (status === "done") return <CheckCircle2 className={base} />;
  if (status === "failed") return <XCircle className={base} />;
  if (status === "skipped") return <MinusCircle className={base} />;
  return <Circle className={base} />;
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const dot =
    status === "done"
      ? "bg-emerald-500"
      : status === "failed"
        ? "bg-red-500"
        : status === "running" || status === "queued"
          ? "bg-sky-500 animate-pulse"
          : "bg-muted-foreground/40";
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dot, className)} />;
}

export function KindIcon({ kind, className }: { kind: GraphNode["kind"]; className?: string }) {
  const meta = KIND_META[kind];
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        meta.tone,
        className,
      )}
    >
      <meta.icon className="h-4 w-4" />
    </span>
  );
}

export const LEVEL_STYLE: Record<string, string> = {
  verified: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  single_source: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  disputed: "bg-orange-500/14 text-orange-700 dark:text-orange-400",
  unverified: "bg-red-500/12 text-red-700 dark:text-red-400",
};
