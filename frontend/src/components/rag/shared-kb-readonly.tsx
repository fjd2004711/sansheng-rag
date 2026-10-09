"use client";

import { Skeleton } from "@/components/ui";
import { useLibrary } from "@/hooks/use-library";

import { KbDocuments, type KbDocument } from "./kb-documents";

/** The shared library as an ordinary user sees it: browse only. Managing it is for administrators. */
export function SharedKbReadonly() {
  const { library, loading } = useLibrary();
  if (loading) return <Skeleton className="h-32 w-full rounded-xl" />;

  const documents: KbDocument[] = (library?.documents ?? []).map((doc) => ({
    key: doc.filename,
    name: doc.filename,
    type: doc.filetype,
    chunks: doc.chunk_count,
    status: "done",
  }));

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        共享资料库由管理员维护，所有人都可以基于它提问，你只能查看，不能修改。想用自己的文件，请到“我的资料”上传。
      </p>
      {documents.length > 0 ? (
        <KbDocuments documents={documents} />
      ) : (
        <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">共享资料库暂时是空的。</div>
      )}
    </div>
  );
}
