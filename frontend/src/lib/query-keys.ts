/**
 * Centralized, typed React Query key factory.
 *
 * One source of truth for cache keys so queries dedupe and mutations can
 * invalidate precisely (e.g. `queryClient.invalidateQueries({ queryKey: qk.conversations.list() })`).
 * Keep keys hierarchical: broader prefixes invalidate everything beneath them.
 */
export const qk = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
  health: () => ["health"] as const,
  conversations: {
    all: () => ["conversations"] as const,
    list: () => ["conversations", "list"] as const,
    count: () => ["conversations", "count"] as const,
    messages: (id: string) => ["conversations", id, "messages"] as const,
  },
  rag: {
    collections: () => ["rag", "collections"] as const,
  },
} as const;
