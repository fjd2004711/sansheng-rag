import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { expect, it, vi } from "vitest";

import {
  getCollectionInfo,
  listCollections,
  listTrackedDocuments,
  retryTrackedDocument,
  type RAGRetryResult,
} from "@/lib/rag-api";

import { SharedKbAdmin } from "./shared-kb-admin";

vi.mock("@/hooks/use-library", () => ({
  useLibrary: () => ({ library: { collection: "alpha" }, loading: false }),
}));

vi.mock("@/lib/api-client", () => ({ apiClient: { get: vi.fn().mockResolvedValue({}) } }));

vi.mock("@/lib/rag-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rag-api")>()),
  getCollectionInfo: vi.fn(),
  listCollections: vi.fn(),
  listTrackedDocuments: vi.fn(),
  retryTrackedDocument: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

HTMLElement.prototype.scrollIntoView = vi.fn();

it("keeps the newly selected collection visible when a previous retry completes", async () => {
  vi.mocked(listCollections).mockResolvedValue({ items: ["alpha", "beta"] });
  vi.mocked(getCollectionInfo).mockImplementation(async (name) => ({
    name,
    total_vectors: 0,
    dim: 4,
    indexing_status: "ready",
  }));
  vi.mocked(listTrackedDocuments).mockImplementation(async (name) => ({
    total: 1,
    items: [
      {
        id: `${name}-id`,
        collection_name: name ?? "",
        filename: `${name}.md`,
        filesize: 20,
        filetype: "md",
        status: "error",
        error_message: "failed",
        vector_document_id: null,
        chunk_count: 0,
        has_file: true,
        created_at: null,
        completed_at: null,
      },
    ],
  }));
  let acceptRetry!: (result: RAGRetryResult) => void;
  vi.mocked(retryTrackedDocument).mockReturnValue(
    new Promise((resolve) => {
      acceptRetry = resolve;
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <SharedKbAdmin />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "重试入库：alpha.md" }));
  expect(retryTrackedDocument).toHaveBeenCalledWith("alpha-id");

  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: "beta" }));
  expect(await screen.findByRole("button", { name: "重试入库：beta.md" })).toBeEnabled();

  acceptRetry({ id: "alpha-id", status: "processing", message: "Retry queued" });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("已重新提交入库"));
  expect(screen.getByRole("button", { name: "重试入库：beta.md" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "重试入库：alpha.md" })).not.toBeInTheDocument();
});
