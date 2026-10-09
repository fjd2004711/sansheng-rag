"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { deleteMyDocument, listMyDocuments, uploadMyFile } from "@/lib/rag-api";
import { getErrorMessage } from "@/lib/utils";

import { KbDocuments, type KbDocument } from "./kb-documents";
import { KbUpload } from "./kb-upload";

const DEFAULT_FORMATS = [".pdf", ".docx", ".md", ".txt"];

/** The signed-in user's own library: upload and delete freely; the shared library is never touched. */
export function MyKb() {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [formats, setFormats] = useState(DEFAULT_FORMATS);

  const load = useCallback(async () => {
    try {
      const data = await listMyDocuments();
      setDocuments(
        data.items.map((doc) => ({
          key: doc.id,
          name: doc.filename,
          type: doc.filetype,
          sizeBytes: doc.filesize,
          chunks: doc.chunk_count,
          status: doc.status as KbDocument["status"],
          error: doc.error_message,
          createdAt: doc.created_at,
        })),
      );
    } catch {
      toast.error("加载我的资料失败");
    }
  }, []);

  useEffect(() => {
    void load();
    apiClient
      .get<{ formats: string[] }>("/v1/rag/supported-formats")
      .then((data) => data?.formats?.length && setFormats(data.formats))
      .catch(() => {});
  }, [load]);

  // Ingestion has no push channel: poll while anything is still being parsed.
  const processing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [processing, load]);

  const remove = async (doc: KbDocument) => {
    try {
      await deleteMyDocument(doc.key);
      toast.success("已删除");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "删除失败"));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        这里的文件只有你自己能检索，不会进入共享资料库，也不影响其他人。在对话里选择“我的资料”即可基于它们提问。
      </p>
      <KbUpload collection="" formats={formats} upload={uploadMyFile} onUploaded={() => void load()} />
      {documents.length > 0 ? (
        <KbDocuments documents={documents} onDelete={remove} />
      ) : (
        <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">还没有上传过资料。</div>
      )}
    </div>
  );
}
