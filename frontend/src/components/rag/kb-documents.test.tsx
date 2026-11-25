import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { KbDocuments, type KbDocument } from "./kb-documents";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const failed: KbDocument = {
  key: "failed",
  name: "notes.md",
  type: "md",
  chunks: 0,
  status: "error",
  error: "解析失败",
  hasStoredFile: true,
};

describe("knowledge base document retry", () => {
  it("offers retry only for failed uploads with a stored original and a retry handler", () => {
    const missing = { ...failed, key: "missing", name: "missing.md", hasStoredFile: false };
    const done = { ...failed, key: "done", name: "done.md", status: "done" as const };
    const processing = {
      ...failed,
      key: "processing",
      name: "processing.md",
      status: "processing" as const,
    };
    const documents = [failed, missing, done, processing];
    const { rerender } = render(<KbDocuments documents={documents} onRetry={vi.fn()} />);

    const buttons = screen.getAllByRole("button", { name: /重试入库/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("重试入库：notes.md");

    rerender(<KbDocuments documents={documents} />);
    expect(screen.queryByRole("button", { name: /重试入库/ })).not.toBeInTheDocument();
  });

  it("blocks repeat clicks while the row is submitting and updates after refresh", async () => {
    let finishRetry!: () => void;
    const request = new Promise<void>((resolve) => {
      finishRetry = resolve;
    });
    const onRetry = vi.fn(() => request);
    const { rerender } = render(
      <KbDocuments documents={[failed]} onRetry={onRetry} onDelete={vi.fn()} />,
    );
    const row = within(screen.getByRole("row", { name: /notes.md/ }));
    const button = row.getByRole("button", { name: "重试入库：notes.md" });

    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(row.getByTitle("删除")).toBeDisabled();
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(failed);

    rerender(
      <KbDocuments
        documents={[{ ...failed, status: "processing", error: null }]}
        onRetry={onRetry}
        onDelete={vi.fn()}
      />,
    );
    finishRetry();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("已重新提交入库"));
    expect(row.getByText("解析中")).toBeInTheDocument();
    expect(row.queryByRole("button", { name: /重试入库/ })).not.toBeInTheDocument();
    expect(row.getByTitle("删除")).toBeEnabled();
  });

  it("shows a useful error and lets the user try again after a failed request", async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error("The original file is missing."));
    render(<KbDocuments documents={[failed]} onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: "重试入库：notes.md" });

    fireEvent.click(button);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("找不到原文件，请重新上传"));
    expect(button).toBeEnabled();
    expect(screen.getByText("解析失败")).toBeInTheDocument();
  });
});
