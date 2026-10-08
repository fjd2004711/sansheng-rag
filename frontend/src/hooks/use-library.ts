"use client";

import { useEffect, useState } from "react";

export interface LibraryDocument {
  filename: string;
  filetype: string;
  chunk_count: number;
}

export interface Library {
  collection: string;
  documents: LibraryDocument[];
}

/** The documents the chat answers from (visible to every signed-in user). */
export function useLibrary(): { library: Library | null; loading: boolean } {
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/rag/library", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setLibrary(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { library, loading };
}
