import { afterEach, describe, expect, it, vi } from "vitest";

async function resolveFor(baked: string | undefined, host: string, protocol = "http:") {
  vi.resetModules();
  if (baked === undefined) delete process.env.NEXT_PUBLIC_WS_URL;
  else process.env.NEXT_PUBLIC_WS_URL = baked;
  vi.stubGlobal("window", { location: { hostname: host, protocol } });
  const mod = await import("./constants");
  return mod.resolveWsUrl();
}

describe("resolveWsUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_WS_URL;
  });

  it("uses the page's own host when the baked address is another IP (the server moved)", async () => {
    expect(await resolveFor("ws://198.51.100.9:8010", "203.0.113.7")).toBe("ws://203.0.113.7:8010");
  });

  it("replaces a baked localhost when the page is opened from another machine", async () => {
    expect(await resolveFor(undefined, "192.168.1.5")).toBe("ws://192.168.1.5:8010");
  });

  it("keeps the configured address when it matches the page host", async () => {
    expect(await resolveFor("ws://203.0.113.7:8010", "203.0.113.7")).toBe("ws://203.0.113.7:8010");
  });

  it("keeps a real domain name as configured, and switches to wss on https pages", async () => {
    expect(await resolveFor("wss://ws.example.com", "app.example.com", "https:")).toBe("wss://ws.example.com");
    expect(await resolveFor("ws://10.0.0.9:8010", "10.0.0.1", "https:")).toBe("wss://10.0.0.1:8010");
  });
});
