"use client";

import { create } from "zustand";

export type SourceChoice = "all" | "shared" | "mine";

interface RetrievalScopeState {
  sources: SourceChoice;
  /** When non-empty, only these files may be used to answer. */
  filenames: string[];
  setSources: (sources: SourceChoice) => void;
  toggleFile: (filename: string) => void;
  clearFiles: () => void;
}

/** What the next question is allowed to be answered from. Kept for the browser session only. */
export const useRetrievalScopeStore = create<RetrievalScopeState>((set) => ({
  sources: "all",
  filenames: [],
  setSources: (sources) => set({ sources }),
  toggleFile: (filename) =>
    set((state) => ({
      filenames: state.filenames.includes(filename)
        ? state.filenames.filter((name) => name !== filename)
        : [...state.filenames, filename],
    })),
  clearFiles: () => set({ filenames: [] }),
}));

/** The `scope` field of a chat frame; omitted entirely when nothing is narrowed. */
export function currentScopePayload(): { sources: SourceChoice; filenames?: string[] } | undefined {
  const { sources, filenames } = useRetrievalScopeStore.getState();
  if (sources === "all" && filenames.length === 0) return undefined;
  return filenames.length ? { sources, filenames } : { sources };
}
