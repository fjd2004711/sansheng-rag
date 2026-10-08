"use client";

import { useCallback, useRef, useState } from "react";
import { CircleAlert, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import { ingestFile } from "@/lib/rag-api";
import { cn, getErrorMessage, MAX_UPLOAD_SIZE_MB } from "@/lib/utils";

interface UploadItem {
  id: string;
  name: string;
  state: "uploading" | "error";
  message?: string;
}

interface KbUploadProps {
  collection: string;
  /** Allowed extensions including the dot, e.g. ".pdf". */
  formats: string[];
  /** Called after at least one file was accepted by the server. */
  onUploaded: () => void;
}

let uploadSeq = 0;

export function KbUpload({ collection, formats, onUploaded }: KbUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (id: string, next: Partial<UploadItem> | null) =>
    setItems((prev) => (next === null ? prev.filter((item) => item.id !== id) : prev.map((item) => (item.id === id ? { ...item, ...next } : item))));

  const handleFiles = useCallback(
    async (files: File[]) => {
      let accepted = 0;
      await Promise.all(
        files.map(async (file) => {
          const id = `upload-${++uploadSeq}`;
          const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
          if (formats.length > 0 && !formats.includes(ext)) {
            setItems((prev) => [...prev, { id, name: file.name, state: "error", message: `不支持 ${ext} 格式` }]);
            return;
          }
          if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
            setItems((prev) => [...prev, { id, name: file.name, state: "error", message: `超过 ${MAX_UPLOAD_SIZE_MB}MB 上限` }]);
            return;
          }
          setItems((prev) => [...prev, { id, name: file.name, state: "uploading" }]);
          try {
            await ingestFile(collection, file);
            accepted++;
            patch(id, null);
          } catch (error) {
            patch(id, { state: "error", message: getErrorMessage(error, "上传失败") });
          }
        }),
      );
      if (accepted > 0) {
        toast.success(`已提交 ${accepted} 个文件，系统正在解析入库`);
        onUploaded();
      }
    },
    [collection, formats, onUploaded],
  );

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-foreground/60 bg-foreground/5" : "border-border hover:border-foreground/30 hover:bg-foreground/[0.02]",
        )}
      >
        <UploadCloud className="text-muted-foreground h-7 w-7" />
        <p className="text-sm font-medium">把文件拖到这里，或点击选择文件</p>
        <p className="text-muted-foreground text-xs">
          支持 PDF、Word（docx）、Markdown、纯文本，单个文件不超过 {MAX_UPLOAD_SIZE_MB}MB。上传后可以直接在对话里提问。
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={formats.join(",")}
          onChange={(event) => {
            if (!event.target.files) return;
            // Copy before clearing: the FileList is live and is emptied by resetting the input.
            const files = Array.from(event.target.files);
            event.target.value = "";
            void handleFiles(files);
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              {item.state === "uploading" ? (
                <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <CircleAlert className="text-destructive h-4 w-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className={cn("shrink-0 text-xs", item.state === "error" ? "text-destructive" : "text-muted-foreground")}>
                {item.state === "uploading" ? "正在上传…" : item.message}
              </span>
              {item.state === "error" && (
                <button type="button" aria-label="忽略" onClick={() => patch(item.id, null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
