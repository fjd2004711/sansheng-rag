"use client";

import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";

export interface LibraryDocument {
  filename: string;
  filetype: string;
  chunk_count: number;
}

export interface Library {
  collection: string;
  documents: LibraryDocument[];
  /** The signed-in user's own private documents. */
  personal: LibraryDocument[];
}

/** The documents the chat answers from: the shared library and the user's own. */
export function useLibrary(): { library: Library | null; loading: boolean; reload: () => void } {
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // apiClient (not a bare fetch) so an expired access token is refreshed and the request retried.
    apiClient
      .get<Library>("/v1/rag/library")
      .then((data) => {
        if (!cancelled) setLibrary({ ...data, personal: data.personal ?? [] });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { library, loading, reload };
}
