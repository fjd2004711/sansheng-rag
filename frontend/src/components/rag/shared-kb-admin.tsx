"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, FolderPlus, Layers, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { KbDocuments, type KbDocument } from "./kb-documents";
import { KbSearch } from "./kb-search";
import { KbUpload } from "./kb-upload";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { useLibrary } from "@/hooks/use-library";
import { apiClient } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";
import {
  createCollection,
  deleteCollection,
  deleteDocument,
  deleteTrackedDocument,
  getCollectionInfo,
  getDocumentDownloadUrl,
  listCollections,
  listDocuments,
  listTrackedDocuments,
  retryTrackedDocument,
} from "@/lib/rag-api";
import { getErrorMessage } from "@/lib/utils";

const DEFAULT_FORMATS = [".pdf", ".docx", ".md", ".txt"];

async function loadCollectionDetails(name: string) {
  const [info, tracked] = await Promise.all([getCollectionInfo(name), listTrackedDocuments(name)]);
  if (tracked.items.length > 0) {
    const documents: KbDocument[] = tracked.items.map((doc) => ({
      key: doc.id,
      name: doc.filename,
      type: doc.filetype,
      sizeBytes: doc.filesize,
      chunks: doc.chunk_count,
      status: doc.status,
      error: doc.error_message,
      hasStoredFile: doc.has_file,
      createdAt: doc.created_at,
      viewUrl: doc.has_file ? getDocumentDownloadUrl(doc.id) : undefined,
    }));
    return { info, documents, untracked: false };
  }

  // Collections populated by the CLI may only have metadata in the vector store.
  const stored = info.total_vectors > 0 ? await listDocuments(name).catch(() => null) : null;
  const documents: KbDocument[] = (stored?.items ?? []).map((doc) => ({
    key: `vector:${doc.document_id}`,
    name: doc.filename ?? doc.document_id,
    type: doc.filetype ?? "",
    sizeBytes: doc.filesize || undefined,
    chunks: doc.chunk_count,
    status: "done",
  }));
  return { info, documents, untracked: documents.length > 0 };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

export function SharedKbAdmin() {
  const { library, loading: libraryLoading } = useLibrary();
  const chatCollection = library?.collection;
  const queryClient = useQueryClient();

  const [collections, setCollections] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [formats, setFormats] = useState(DEFAULT_FORMATS);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDrop, setConfirmDrop] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      const data = await listCollections();
      setCollections(data.items);
      return data.items;
    } catch {
      toast.error("加载资料集失败");
      return [] as string[];
    }
  }, []);

  const { data: details, isLoading: detailsLoading, errorUpdatedAt } = useQuery({
    queryKey: qk.rag.collectionDetails(selected),
    queryFn: ({ queryKey: [, , name] }) => loadCollectionDetails(name),
    enabled: Boolean(selected),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.documents.some((doc) => doc.status === "processing") ? 3000 : false,
    refetchIntervalInBackground: true,
  });
  const documents = details?.documents ?? [];
  const info = details?.info;

  useEffect(() => {
    if (errorUpdatedAt) toast.error("加载资料失败");
  }, [errorUpdatedAt]);

  useEffect(() => {
    // Wait for the chat's collection so it can be the default selection.
    if (libraryLoading) return;
    void loadCollections().then((items) => {
      setLoading(false);
      setSelected((current) => current || (chatCollection && items.includes(chatCollection) ? chatCollection : (items[0] ?? "")));
    });
  }, [loadCollections, chatCollection, libraryLoading]);

  useEffect(() => {
    apiClient
      .get<{ formats: string[] }>("/v1/rag/supported-formats")
      .then((data) => data?.formats?.length && setFormats(data.formats))
      .catch(() => {});
  }, []);

  const refreshDetails = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.rag.collectionDetails(selected), exact: true }),
    [queryClient, selected],
  );
  const refresh = useCallback(async () => {
    await Promise.all([loadCollections(), refreshDetails()]);
  }, [loadCollections, refreshDetails]);

  const handleCreate = async () => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    try {
      await createCollection(name);
      toast.success(`已创建资料集「${name}」`);
      setCreating(false);
      setNewName("");
      await loadCollections();
      setSelected(name);
    } catch (error) {
      toast.error(getErrorMessage(error, "创建失败，名称只能包含字母、数字和下划线"));
    }
  };

  const handleDeleteDocument = async (doc: KbDocument) => {
    try {
      if (doc.key.startsWith("vector:")) await deleteDocument(selected, doc.key.slice("vector:".length));
      else await deleteTrackedDocument(doc.key);
      toast.success("已删除");
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "删除失败"));
    }
  };

  const handleRetryDocument = async (doc: KbDocument) => {
    await retryTrackedDocument(doc.key);
    await refreshDetails();
  };

  const handleDropCollection = async () => {
    try {
      await deleteCollection(selected);
      queryClient.removeQueries({ queryKey: qk.rag.collectionDetails(selected), exact: true });
      toast.success(`已删除资料集「${selected}」`);
      setSelected("");
      setConfirmDrop(false);
      const items = await loadCollections();
      setSelected(items[0] ?? "");
    } catch (error) {
      toast.error(getErrorMessage(error, "删除失败"));
    }
  };

  const isChatCollection = selected !== "" && selected === chatCollection;

  return (
    <div className="space-y-6">
      {loading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : collections.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <Database className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
          <p className="text-sm font-medium">还没有资料集</p>
          <p className="text-muted-foreground mt-1 text-xs">资料集是一组相关文件的集合，先建一个再上传文件。</p>
          <Button className="mt-4 gap-1.5" onClick={() => setCreating(true)}>
            <FolderPlus className="h-4 w-4" />
            新建资料集
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-10 w-64 rounded-xl">
                <SelectValue placeholder="选择资料集" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                    {name === chatCollection ? "（对话在用）" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isChatCollection ? (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">对话正在使用这个资料集</span>
            ) : (
              <span className="text-muted-foreground text-xs">对话不会使用这个资料集；对话使用的是「{chatCollection ?? "—"}」</span>
            )}
            <span className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
                <FolderPlus className="h-4 w-4" />
                新建资料集
              </Button>
              <Button variant="outline" size="sm" className="text-destructive gap-1.5" onClick={() => setConfirmDrop(true)} disabled={!selected}>
                <Trash2 className="h-4 w-4" />
                删除资料集
              </Button>
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="已入库文件" value={String(documents.filter((doc) => doc.status === "done").length)} />
            <Stat label="资料段数" value={String(info?.total_vectors ?? 0)} hint="文件会被切成若干段，回答时按段引用" />
            <Stat label="处理中" value={String(documents.filter((doc) => doc.status === "processing").length)} />
          </div>

          <Tabs defaultValue="files">
            <TabsList>
              <TabsTrigger value="files" className="gap-1.5">
                <Layers className="h-4 w-4" />
                文件
              </TabsTrigger>
              <TabsTrigger value="search">检索验证</TabsTrigger>
            </TabsList>
            <TabsContent value="files" className="mt-4 space-y-4">
              {selected && <KbUpload collection={selected} formats={formats} onUploaded={() => void refresh()} />}
              {details?.untracked && (
                <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed">
                  这些文件是用脚本导入的，没有上传记录，所以看不到上传时间，也不能下载原文件，但可以正常用于回答。
                </p>
              )}
              {detailsLoading ? (
                <Skeleton className="h-24 w-full rounded-xl" />
              ) : documents.length > 0 ? (
                <KbDocuments
                  key={selected}
                  documents={documents}
                  onDelete={handleDeleteDocument}
                  onRetry={handleRetryDocument}
                />
              ) : (
                <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
                  {info && info.total_vectors > 0 ? "这个资料集里有内容，但无法列出文件。" : "这个资料集还是空的，先上传几个文件吧。"}
                </div>
              )}
            </TabsContent>
            <TabsContent value="search" className="mt-4">
              {selected && <KbSearch collection={selected} />}
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新建资料集</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && void handleCreate()}
              placeholder="例如 teacher_handbook"
              autoFocus
            />
            <p className="text-muted-foreground text-xs">名称只能用英文字母、数字和下划线。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              取消
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!newName.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDrop}
        onOpenChange={setConfirmDrop}
        title={`删除资料集「${selected}」？`}
        description="集合里的所有文件和段落都会被永久删除。如果对话正在使用它，之后将无法回答。"
        confirmText={selected}
        confirmLabel="永久删除"
        cancelLabel="取消"
        destructive
        onConfirm={handleDropCollection}
      />
    </div>
  );
}
