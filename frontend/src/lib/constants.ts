export const APP_NAME = "自纠错智能问答";
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
  EVALUATION: "/evaluation",
  ADMIN: "/admin",
} as const;

// WebSocket URL (for chat - direct to backend, use wss:// in production)
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8010";

// Backend API URL (public, for direct links like API docs)
export const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
