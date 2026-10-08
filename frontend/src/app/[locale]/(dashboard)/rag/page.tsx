"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks";
import {
  Button,
  Input,
  Badge,
  Skeleton,
  Spinner,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui";
import {
  Database,
  Search,
  Trash2,
  FileText,
  Plus,
  Upload,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";
import {
  listCollections,
  getCollectionInfo,
  createCollection,
  deleteCollection,
  listTrackedDocuments,
  deleteTrackedDocument,
  ingestFile,
  searchDocuments,
  getDocumentDownloadUrl,
  type RAGCollectionInfo,
  type RAGTrackedDocument,
  type RAGSearchResult,
} from "@/lib/rag-api";
import { DragDropOverlay } from "@/components/rag/drag-drop-overlay";
import { apiClient } from "@/lib/api-client";

import { getErrorMessage, isAppAdmin, MAX_UPLOAD_SIZE_MB } from "@/lib/utils";

interface CollectionWithInfo {
  name: string;
  info: RAGCollectionInfo | null;
}

function StatusIcon({ status }: { status: string }) {
  const label = status === "done" ? "已完成" : status === "error" ? "失败" : "处理中";
  return (
    <span role="status" aria-label={label}>
      {status === "done" && <CheckCircle className="text-foreground h-4 w-4" />}
      {status === "error" && <XCircle className="text-destructive h-4 w-4" />}
      {status !== "done" && status !== "error" && (
        <Spinner className="text-muted-foreground h-4 w-4" />
      )}
    </span>
  );
}

export default function RAGPage() {
  const { user } = useAuth();
  const [collections, setCollections] = useState<CollectionWithInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [docs, setDocs] = useState<RAGTrackedDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RAGSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    filename: string;
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTabState] = useState<"documents" | "search">(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "search") return t;
    }
    return "documents";
  });
  const setTab = (t: "documents" | "search") => {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === "documents") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState({}, "", url.toString());
  };
  const [supportedFormats, setSupportedFormats] = useState<string[]>([
    ".pdf",
    ".docx",
    ".txt",
    ".md",
  ]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCollections();
      const items: CollectionWithInfo[] = [];
      for (const name of data.items) {
        try {
          items.push({ name, info: await getCollectionInfo(name) });
        } catch {
          items.push({ name, info: null });
        }
      }
      setCollections(items);
      setSelected((prev) => (items.length > 0 && !prev ? (items[0]?.name ?? "") : prev));
    } catch {
      toast.error("加载集合失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDocs = async (col: string) => {
    if (!col) {
      setDocs([]);
      return;
    }
    setDocsLoading(true);
    try {
      const data = await listTrackedDocuments(col);
      setDocs(data.items || []);
    } catch {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  };


  useEffect(() => {
    fetchCollections();
    apiClient
      .get<{ formats: string[] }>("/rag/supported-formats")
      .then((data) => {
        if (data?.formats) setSupportedFormats(data.formats);
      })
      .catch(() => {});
  }, [fetchCollections]);
  useEffect(() => {
    if (selected) fetchDocs(selected);
  }, [selected]);

  // Poll while any document is still being ingested (the backend has no push channel for status).
  const hasProcessing = docs.some((d) => d.status === "processing");
  useEffect(() => {
    if (!hasProcessing || !selected) return;
    const timer = setInterval(async () => {
      try {
        const data = await listTrackedDocuments(selected);
        const next = data.items || [];
        setDocs((prev) => {
          for (const doc of next) {
            const before = prev.find((d) => d.id === doc.id);
            if (before?.status === "processing" && doc.status === "done") {
              toast.success(`${doc.filename}：入库完成`);
            } else if (before?.status === "processing" && doc.status === "error") {
              toast.error(`${doc.filename}：入库失败`);
            }
          }
          return next;
        });
        if (next.every((d) => d.status !== "processing")) fetchCollections();
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [hasProcessing, selected, fetchCollections]);

  const handleCreate = async () => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    try {
      await createCollection(name);
      toast.success(`已创建集合「${name}」`);
      setNewName("");
      setShowCreate(false);
      await fetchCollections();
      setSelected(name);
    } catch {
      toast.error("创建集合失败");
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteCollection(name);
      toast.success(`已删除集合「${name}」`);
      setCollections((prev) => prev.filter((c) => c.name !== name));
      if (selected === name) {
        setSelected("");
        setDocs([]);
        setSearchResults([]);
      }
    } catch {
      toast.error("删除失败");
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteTrackedDocument(docId);
      toast.success("文档已删除");
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      fetchCollections();
    } catch {
      toast.error("删除失败");
    }
  };

  const processFiles = useCallback(
    async (fileList: File[]) => {
      if (!selected || fileList.length === 0) return;
      const allowedExts = supportedFormats.map((f) => f.toLowerCase());
      let successCount = 0;
      let errorCount = 0;

      setUploading(true);
      for (let i = 0; i < fileList.length; i++) {
        const file: File | undefined = fileList[i];
        if (!file) continue;
        setUploadProgress({ current: i + 1, total: fileList.length, filename: file.name });

        const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
        if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
          toast.error(`${file.name}: 不支持的格式（${ext}）`);
          errorCount++;
          continue;
        }
        if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
          toast.error(`${file.name}: 文件过大（上限 ${MAX_UPLOAD_SIZE_MB}MB）`);
          errorCount++;
          continue;
        }

        try {
          await ingestFile(selected, file);
          successCount++;
        } catch (err) {
          toast.error(`${file.name}: ${getErrorMessage(err, "失败")}`);
          errorCount++;
        }
      }

      setUploading(false);
      setUploadProgress(null);

      if (successCount > 0) {
        toast.success(
          `${successCount} 个文件已提交入库${errorCount > 0 ? `，${errorCount} 个失败` : ""}`,
        );
      }

      await fetchDocs(selected);
      await fetchCollections();
    },
    [selected, supportedFormats, fetchCollections],
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    // Copy before resetting: the FileList is live and is emptied by clearing the input value.
    const files = Array.from(e.target.files);
    e.target.value = "";
    await processFiles(files);
  };

  const handleDrop = useCallback(
    (files: File[]) => {
      if (!selected) {
        toast.error("请先选择集合再拖入文件");
        return;
      }
      processFiles(files);
    },
    [selected, processFiles],
  );

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selected) return;
    setSearching(true);
    try {
      const data = await searchDocuments({
        query: searchQuery,
        collection_name: selected,
        limit: 10,
      });
      setSearchResults(data.results);
      setSearchDone(true);
    } catch {
      toast.error("检索失败");
    } finally {
      setSearching(false);
    }
  };

  const info = collections.find((c) => c.name === selected)?.info;

  if (user && !isAppAdmin(user)) {
    return (
      <div className="border-border bg-card text-muted-foreground mx-auto mt-10 max-w-md rounded-xl border p-8 text-center">
        <Database className="mx-auto mb-3 h-8 w-8" />
        <p className="text-foreground text-sm font-medium">知识库管理需要管理员权限</p>
        <p className="mt-1 text-xs">你仍可以在「对话」中向已入库的知识库提问。</p>
      </div>
    );
  }

  const tabs: { key: "documents" | "search"; label: string }[] = [
    { key: "documents", label: docs.length > 0 ? `文档（${docs.length}）` : "文档" },
    { key: "search", label: "检索验证" },
  ];

  return (
    <div className="space-y-6">
      <DragDropOverlay
        onDrop={handleDrop}
        disabled={!selected || uploading}
        title={selected ? `将文件拖入「${selected}」` : "拖入文件上传"}
        description={
          selected
            ? "文件将入库到当前集合"
            : "请先选择集合"
        }
        acceptedFormats={supportedFormats}
      />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">知识库</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          管理文档集合、上传 PDF / Word / Markdown / 文本文件，并在「检索验证」里查看系统能找到哪些资料。
        </p>
      </div>

      <div className="border-border bg-card rounded-xl border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Database className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                集合
              </span>
            </div>
            {loading ? (
              <Skeleton className="h-9 w-56 rounded-xl" />
            ) : collections.length === 0 ? (
              <span className="text-muted-foreground text-sm">还没有集合，请先新建一个</span>
            ) : (
              <Select
                value={selected}
                onValueChange={(v) => {
                  setSelected(v);
                  setSearchResults([]);
                  setSearchDone(false);
                  setTab("documents");
                }}
              >
                <SelectTrigger className="h-9 w-full rounded-xl sm:w-72">
                  <SelectValue placeholder="选择集合" />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((col) => (
                    <SelectItem key={col.name} value={col.name}>
                      {col.name}
                      {col.info ? ` · ${col.info.total_vectors.toLocaleString()} 向量` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {info && (
              <span className="text-muted-foreground font-mono text-xs">
                {info.total_vectors.toLocaleString()} 向量 · {info.dim} 维
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowCreate((v) => !v)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新建集合
            </Button>
            {uploadProgress ? (
              <div
                className="text-muted-foreground flex items-center gap-2 text-xs"
                role="status"
                aria-live="polite"
              >
                <Spinner className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono">
                  {uploadProgress.current}/{uploadProgress.total}
                </span>
                <span className="max-w-[120px] truncate">{uploadProgress.filename}</span>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !selected}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                上传文件
              </Button>
            )}
            {selected && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive rounded-xl"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除集合「{selected}」？</AlertDialogTitle>
                    <AlertDialogDescription>
                      该集合内所有文档和向量将被永久删除。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleDelete(selected)}
                    >
                      删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <input
              ref={fileRef}
              type="file"
              onChange={handleUpload}
              accept={supportedFormats.join(",")}
              multiple
              className="hidden"
            />
          </div>
        </div>

        {showCreate && (
          <div className="border-border mt-3 flex gap-2 border-t pt-3">
            <Input
              placeholder="collection_name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="h-9 max-w-xs rounded-xl"
            />
            <Button size="sm" className="h-9 rounded-xl" onClick={handleCreate}>
              创建
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 rounded-xl"
              onClick={() => {
                setShowCreate(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {uploadProgress && (
          <div className="mt-3">
            <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
              <div
                className="bg-foreground h-full rounded-full transition-all"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {!selected ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center justify-center rounded-xl border py-16 text-center">
          <Database className="mb-3 h-8 w-8" />
          <p className="text-sm">请选择或新建一个集合开始使用。</p>
        </div>
      ) : (
        <>
          <div className="border-border flex gap-1 border-b">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "documents" &&
            (docsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <div className="border-border bg-card flex flex-col items-center justify-center rounded-xl border py-16 text-center">
                <FileText className="text-muted-foreground mb-3 h-8 w-8" />
                <p className="text-foreground text-sm font-medium">暂无文档</p>
                <p className="text-muted-foreground mt-1 text-xs">上传 PDF、DOCX、TXT 或 MD</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-xl"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" /> 上传文件
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="border-border bg-card hover:bg-accent flex items-center justify-between rounded-xl border p-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <StatusIcon status={doc.status} />
                      <div className="min-w-0">
                        <p className="text-foreground truncate text-sm font-medium">
                          {doc.filename}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {doc.filetype.toUpperCase()}
                          </Badge>
                          {doc.status === "done" && (
                            <span className="text-muted-foreground font-mono text-xs">
                              {(doc.filesize / 1024).toFixed(0)} KB
                            </span>
                          )}
                          {doc.status === "processing" && (
                            <span className="text-muted-foreground text-xs">处理中...</span>
                          )}
                          {doc.status === "error" && (
                            <span className="text-destructive max-w-[200px] truncate text-xs">
                              {doc.error_message}
                            </span>
                          )}
                          {doc.created_at && (
                            <span className="text-muted-foreground text-[10px]">
                              {new Date(doc.created_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {doc.has_file && (
                        <a
                          href={getDocumentDownloadUrl(doc.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
                          title="查看原文件"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="text-destructive hover:bg-accent rounded-lg p-1.5 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除「{doc.filename}」？</AlertDialogTitle>
                            <AlertDialogDescription>
                              将从向量库和存储中移除该文档。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDeleteDoc(doc.id)}
                            >
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {tab === "search" && (
            <div className="space-y-4">
              <div className="border-border bg-card rounded-xl border p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder={`在「${selected}」中检索...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="rounded-xl"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="rounded-xl"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {searching ? "..." : "检索"}
                  </Button>
                </div>
              </div>

              {searchDone && searchResults.length === 0 && !searching && (
                <div className="border-border bg-card flex flex-col items-center justify-center rounded-xl border py-12 text-center">
                  <Search className="text-muted-foreground mb-3 h-8 w-8" />
                  <p className="text-foreground text-sm font-medium">没有检索到结果</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    换一个问法，或检查其他集合
                  </p>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((r, i) => {
                    // Try to find the source document for "View source" link
                    const sourceDoc = docs.find(
                      (d) => d.filename === r.metadata?.filename && d.has_file,
                    );
                    return (
                      <div
                        key={i}
                        className="border-border bg-card rounded-xl border p-4 transition-colors"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <FileText className="text-muted-foreground h-3.5 w-3.5" />
                          <span className="text-foreground text-xs font-medium">
                            {String(r.metadata?.filename ?? "?")}
                          </span>
                          {r.metadata?.page_num != null && (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              p.{String(r.metadata.page_num)}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                            {r.score.toFixed(3)}
                          </Badge>
                          {sourceDoc && (
                            <a
                              href={getDocumentDownloadUrl(sourceDoc.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px] font-medium"
                            >
                              <Eye className="h-3 w-3" /> 查看来源
                            </a>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm leading-relaxed">{r.content}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

