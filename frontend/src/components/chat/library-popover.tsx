"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Library as LibraryIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { useLibrary, type LibraryDocument } from "@/hooks/use-library";
import { apiClient } from "@/lib/api-client";
import { cn, getErrorMessage, MAX_UPLOAD_SIZE_MB } from "@/lib/utils";
import { useRetrievalScopeStore, type SourceChoice } from "@/stores/retrieval-scope-store";

interface MyDocument {
  id: string;
  filename: string;
  status: string;
  chunk_count: number;
  error_message: string | null;
}

const CHOICES: Array<{ value: SourceChoice; label: string }> = [
  { value: "all", label: "全部资料" },
  { value: "shared", label: "只用共享库" },
  { value: "mine", label: "只用我的资料" },
];

/** What the assistant answers from, and the controls to narrow it or add the user's own files. */
export function LibraryPopover() {
  const { library, loading, reload } = useLibrary();
  const { sources, filenames, setSources, toggleFile, clearFiles } = useRetrievalScopeStore();
  const [mine, setMine] = useState<MyDocument[]>([]);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadMine = () =>
    apiClient
      .get<{ items: MyDocument[] }>("/v1/rag/my/documents")
      .then((data) => setMine(data.items))
      .catch(() => {});

  useEffect(() => {
    if (open) void loadMine();
  }, [open]);

  // Keep refreshing while any file is still being parsed.
  const processing = mine.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!open || !processing) return;
    const timer = setInterval(() => {
      void loadMine();
      reload();
    }, 3000);
    return () => clearInterval(timer);
  }, [open, processing, reload]);

  const upload = async (files: File[]) => {
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        await apiClient.post("/v1/rag/my/ingest", form);
      }
      toast.success("已上传，正在解析入库");
      await loadMine();
    } catch (error) {
      toast.error(getErrorMessage(error, "上传失败"));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (doc: MyDocument) => {
    try {
      await apiClient.delete(`/v1/rag/my/documents/${doc.id}`);
      if (filenames.includes(doc.filename)) toggleFile(doc.filename);
      await loadMine();
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, "删除失败"));
    }
  };

  const shared = library?.documents.length ?? 0;
  const personal = library?.personal.length ?? 0;
  const total = shared + personal;
  const scopeNote =
    filenames.length > 0 ? `限定 ${filenames.length} 份` : sources === "all" ? null : CHOICES.find((c) => c.value === sources)?.label;
  const label = loading ? "正在读取资料库…" : total > 0 ? `回答依据：${total} 份资料` : "资料库还是空的";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors"
        >
          <LibraryIcon className="h-3.5 w-3.5" />
          {label}
          {scopeNote && <span className="bg-foreground/10 text-foreground rounded px-1">{scopeNote}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">回答依据的资料</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            系统只根据这些资料回答；资料里没有的内容会直接说明，不会编造。“我的资料”只有你自己能检索。
          </p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="检索范围">
            {CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={sources === choice.value}
                onClick={() => setSources(choice.value)}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1 text-xs transition-colors",
                  sources === choice.value ? "bg-foreground text-background border-foreground" : "hover:bg-foreground/5",
                )}
              >
                {choice.label}
              </button>
            ))}
          </div>
          {filenames.length > 0 && (
            <button type="button" onClick={clearFiles} className="text-muted-foreground hover:text-foreground mt-2 text-xs underline">
              取消“只用选中的 {filenames.length} 份”
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          <Section title={`共享库（${shared}）`}>
            {(library?.documents ?? []).map((doc) => (
              <DocRow key={`s-${doc.filename}`} doc={doc} checked={filenames.includes(doc.filename)} onToggle={() => toggleFile(doc.filename)} />
            ))}
            {!loading && shared === 0 && <Empty text="共享库暂无资料" />}
          </Section>

          <Section
            title={`我的资料（${personal}）`}
            action={
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="hover:bg-foreground/5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                上传
              </button>
            }
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.md,.txt"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length) void upload(files);
              }}
            />
            {mine.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                {doc.status === "done" ? (
                  <input
                    type="checkbox"
                    aria-label={`只用 ${doc.filename}`}
                    checked={filenames.includes(doc.filename)}
                    onChange={() => toggleFile(doc.filename)}
                  />
                ) : doc.status === "processing" ? (
                  <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <FileText className="text-destructive h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate" title={doc.error_message ?? doc.filename}>
                  {doc.filename}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {doc.status === "done" ? `${doc.chunk_count} 段` : doc.status === "processing" ? "解析中" : "失败"}
                </span>
                <button type="button" onClick={() => void remove(doc)} aria-label={`删除 ${doc.filename}`} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {mine.length === 0 && <Empty text={`还没有，点“上传”添加 PDF / Word / Markdown / 文本（≤ ${MAX_UPLOAD_SIZE_MB}MB）`} />}
          </Section>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b last:border-b-0">
      <div className="bg-muted/40 flex items-center justify-between px-4 py-1.5">
        <h3 className="text-muted-foreground text-xs font-semibold">{title}</h3>
        {action}
      </div>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

function DocRow({ doc, checked, onToggle }: { doc: LibraryDocument; checked: boolean; onToggle: () => void }) {
  return (
    <li className="flex items-center gap-2 px-4 py-2 text-sm">
      <input type="checkbox" aria-label={`只用 ${doc.filename}`} checked={checked} onChange={onToggle} />
      <span className="min-w-0 flex-1 truncate" title={doc.filename}>
        {doc.filename}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">{doc.chunk_count} 段</span>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <li className="text-muted-foreground px-4 py-4 text-center text-xs">{text}</li>;
}
