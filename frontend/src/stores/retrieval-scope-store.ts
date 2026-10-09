"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SourceChoice = "all" | "shared" | "mine";

interface RetrievalScopeState {
  /** Which library the next question is answered from. */
  sources: SourceChoice;
  /** Skip the claim-by-claim check for a quicker, unchecked answer. */
  fast: boolean;
  setSources: (sources: SourceChoice) => void;
  setFast: (fast: boolean) => void;
}

export const useRetrievalScopeStore = create<RetrievalScopeState>()(
  persist(
    (set) => ({
      sources: "all",
      fast: false,
      setSources: (sources) => set({ sources }),
      setFast: (fast) => set({ fast }),
    }),
    {
      name: "rag.scope",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sources: state.sources }),
    },
  ),
);

/** The `scope` field of a chat frame; omitted when every library is in play. */
export function currentScopePayload(): { sources: SourceChoice } | undefined {
  const { sources } = useRetrievalScopeStore.getState();
  return sources === "all" ? undefined : { sources };
}
