"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, FolderPlus, Layers, MessageSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { KbDocuments, type KbDocument } from "@/components/rag/kb-documents";
import { KbSearch } from "@/components/rag/kb-search";
import { KbUpload } from "@/components/rag/kb-upload";
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
import { useAuth } from "@/hooks";
import { useLibrary } from "@/hooks/use-library";
import { apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
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
  type RAGCollectionInfo,
} from "@/lib/rag-api";
import { getErrorMessage, isAppAdmin } from "@/lib/utils";

const DEFAULT_FORMATS = [".pdf", ".docx", ".md", ".txt"];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const { library, loading: libraryLoading } = useLibrary();
  const chatCollection = library?.collection;

  const [collections, setCollections] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [info, setInfo] = useState<RAGCollectionInfo | null>(null);
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [untracked, setUntracked] = useState(false);
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

  const loadSelected = useCallback(async (name: string) => {
    if (!name) return;
    try {
      const [collectionInfo, tracked] = await Promise.all([getCollectionInfo(name), listTrackedDocuments(name)]);
      setInfo(collectionInfo);
      if (tracked.items.length > 0) {
        setUntracked(false);
        setDocuments(
          tracked.items.map((doc) => ({
            key: doc.id,
            name: doc.filename,
            type: doc.filetype,
            sizeBytes: doc.filesize,
            chunks: doc.chunk_count,
            status: doc.status,
            error: doc.error_message,
            createdAt: doc.created_at,
            viewUrl: doc.has_file ? getDocumentDownloadUrl(doc.id) : undefined,
          })),
        );
        return;
      }
      // Imported by a script: no upload records, but the vector store still knows the files.
      const stored = collectionInfo.total_vectors > 0 ? await listDocuments(name).catch(() => null) : null;
      setUntracked(Boolean(stored?.items.length));
      setDocuments(
        (stored?.items ?? []).map((doc) => ({
          key: `vector:${doc.document_id}`,
          name: doc.filename ?? doc.document_id,
          type: doc.filetype ?? "",
          sizeBytes: doc.filesize || undefined,
          chunks: doc.chunk_count,
          status: "done" as const,
        })),
      );
    } catch {
      toast.error("加载资料失败");
    }
  }, []);

  useEffect(() => {
    // Wait for the chat's collection so it can be the default selection.
    if (libraryLoading) return;
    void loadCollections().then((items) => {
      setLoading(false);
      setSelected((current) => current || (chatCollection && items.includes(chatCollection) ? chatCollection : (items[0] ?? "")));
    });
  }, [loadCollections, chatCollection, libraryLoading]);

  useEffect(() => {
    void loadSelected(selected);
  }, [selected, loadSelected]);

  useEffect(() => {
    apiClient
      .get<{ formats: string[] }>("/v1/rag/supported-formats")
      .then((data) => data?.formats?.length && setFormats(data.formats))
      .catch(() => {});
  }, []);

  // The backend has no push channel for ingestion status, so poll while anything is still parsing.
  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing || !selected) return;
    const timer = setInterval(() => void loadSelected(selected), 3000);
    return () => clearInterval(timer);
  }, [hasProcessing, selected, loadSelected]);

  const totals = useMemo(
    () => ({ files: documents.filter((doc) => doc.status === "done").length, chunks: info?.total_vectors ?? 0 }),
    [documents, info],
  );

  const refresh = useCallback(async () => {
    await Promise.all([loadCollections(), loadSelected(selected)]);
  }, [loadCollections, loadSelected, selected]);

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

  const handleDropCollection = async () => {
    try {
      await deleteCollection(selected);
      toast.success(`已删除资料集「${selected}」`);
      setSelected("");
      setConfirmDrop(false);
      const items = await loadCollections();
      setSelected(items[0] ?? "");
    } catch (error) {
      toast.error(getErrorMessage(error, "删除失败"));
    }
  };

  if (user && !isAppAdmin(user)) {
    return (
      <div className="mx-auto mt-16 max-w-md px-6 text-center">
        <Database className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
        <p className="text-sm font-medium">知识库管理需要管理员权限</p>
        <p className="text-muted-foreground mt-1 text-xs">你仍可以在「对话」中向已入库的资料提问。</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={ROUTES.CHAT}>去对话</Link>
        </Button>
      </div>
    );
  }

  const isChatCollection = selected !== "" && selected === chatCollection;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">知识库</h1>
          <p className="text-muted-foreground mt-1 text-sm">系统只根据这里的资料回答问题。上传文件后，马上就能在「对话」里提问。</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={ROUTES.CHAT}>
            <MessageSquare className="h-4 w-4" />
            去对话试试
          </Link>
        </Button>
      </header>

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
            <Stat label="已入库文件" value={String(totals.files)} />
            <Stat label="资料段数" value={String(totals.chunks)} hint="文件会被切成若干段，回答时按段引用" />
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
              {untracked && (
                <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed">
                  这些文件是用脚本导入的，没有上传记录，所以看不到上传时间，也不能下载原文件，但可以正常用于回答。
                </p>
              )}
              {documents.length > 0 ? (
                <KbDocuments documents={documents} onDelete={handleDeleteDocument} />
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
