import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./api-client";

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("apiClient", () => {
  it("refreshes the session once after a 401 and retries the request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401)) // original request: access token expired
      .mockResolvedValueOnce(json(200, { access_token: "new" })) // /api/auth/refresh
      .mockResolvedValueOnce(json(200, { ok: true })); // retry
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.get("/v1/rag/library")).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/v1/rag/library", "/api/auth/refresh", "/api/v1/rag/library"]);
  });

  it("gives up with the original 401 when the refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(401, { detail: "未登录" })).mockResolvedValueOnce(json(401)));

    await expect(apiClient.get("/v1/rag/library")).rejects.toMatchObject({ status: 401 });
  });

  it("sends FormData untouched so the browser can set the multipart boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { id: "1" }));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("file", new File(["x"], "a.md"));

    await apiClient.post("/v1/rag/collections/c/ingest", form);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("still sends JSON bodies as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.post("/auth/register", { email: "a@b.c" });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe('{"email":"a@b.c"}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
