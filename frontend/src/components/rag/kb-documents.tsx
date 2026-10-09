"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Eye, FileText, Loader2, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface KbDocument {
  key: string;
  name: string;
  type: string;
  sizeBytes?: number;
  chunks: number;
  status: "done" | "processing" | "error";
  error?: string | null;
  createdAt?: string | null;
  viewUrl?: string;
}

const STATUS = {
  done: { label: "已入库", icon: CircleCheck, tone: "text-emerald-600" },
  processing: { label: "解析中", icon: Loader2, tone: "text-amber-600" },
  error: { label: "失败", icon: CircleAlert, tone: "text-destructive" },
} as const;

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} 字节`;
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export function KbDocuments({
  documents,
  onDelete,
}: {
  documents: KbDocument[];
  /** Omit for a read-only list (no delete button). */
  onDelete?: (doc: KbDocument) => Promise<void>;
}) {
  const [pending, setPending] = useState<KbDocument | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
            <tr>
              <th className="px-4 py-2.5 font-medium">文件</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">大小</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">段数</th>
              <th className="px-4 py-2.5 font-medium">状态</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">上传时间</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {documents.map((doc) => {
              const status = STATUS[doc.status];
              const StatusIcon = status.icon;
              return (
                <tr key={doc.key} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block max-w-[28ch] truncate font-medium sm:max-w-[40ch]" title={doc.name}>
                          {doc.name}
                        </span>
                        {doc.error && <span className="text-destructive block text-xs">{doc.error}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 sm:table-cell">{formatSize(doc.sizeBytes)}</td>
                  <td className="text-muted-foreground hidden px-4 py-3 sm:table-cell">{doc.chunks || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", status.tone)}>
                      <StatusIcon className={cn("h-3.5 w-3.5", doc.status === "processing" && "animate-spin")} />
                      {status.label}
                    </span>
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 md:table-cell">{formatDate(doc.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center justify-end gap-1">
                      {doc.viewUrl && (
                        <a
                          href={doc.viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="查看原文件"
                          className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-2"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      )}
                      {onDelete && (
                      <button
                        type="button"
                        title="删除"
                        onClick={() => setPending(doc)}
                        className="text-muted-foreground hover:text-destructive hover:bg-accent rounded-md p-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={`删除「${pending?.name ?? ""}」？`}
        description="删除后，对话里将不再引用这份文件的内容。此操作不能撤销。"
        confirmLabel="删除"
        cancelLabel="取消"
        destructive
        onConfirm={async () => {
          if (pending && onDelete) await onDelete(pending);
          setPending(null);
        }}
      />
    </>
  );
}
