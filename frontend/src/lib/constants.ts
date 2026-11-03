export const APP_NAME = "查证";
export const APP_DESCRIPTION = "可解释、能自我纠错的知识库问答";

export const API_ROUTES = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  LOGOUT: "/auth/logout",
  REFRESH: "/auth/refresh",
  ME: "/auth/me",
  HEALTH: "/health",
  CHAT: "/chat",
} as const;

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  CHAT: "/chat",
  RAG: "/rag",
  REPORTS: "/reports",
  ORCHESTRATION: "/orchestration",
  EVALUATION: "/evaluation",
  ADMIN: "/admin",
} as const;

// WebSocket URL (for chat - direct to backend, use wss:// in production)
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8010";

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Where the browser should open the chat socket. The build bakes WS_URL in, but an address baked for another host
 * (the server moved, or it is opened by another IP) can never connect and the chat shows "offline" forever. So when
 * the baked host is localhost or a bare IP that is not the host the page was loaded from, use the page's own host.
 * A real domain name (a separate WebSocket host behind TLS) is kept as configured.
 */
export function resolveWsUrl(): string {
  if (typeof window === "undefined") return WS_URL;
  try {
    const baked = new URL(WS_URL);
    const here = window.location.hostname;
    const stale = (baked.hostname === "localhost" || IPV4.test(baked.hostname)) && baked.hostname !== here;
    if (!stale) return WS_URL;
    const secure = window.location.protocol === "https:";
    return `${secure ? "wss" : "ws"}://${here}:${baked.port || "8010"}`;
  } catch {
    return WS_URL;
  }
}

// Backend API URL (public, for direct links like API docs)
export const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
