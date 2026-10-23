"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SourceChoice = "all" | "shared" | "mine";
/** "qa" answers from the knowledge base; "research" searches the web and checks every claim;
 * "report" researches authoritative data and writes a full analysis report. */
export type ChatMode = "qa" | "research" | "report";

interface RetrievalScopeState {
  /** Which library the next question is answered from. */
  sources: SourceChoice;
  /** Skip the claim-by-claim check for a quicker, unchecked answer. */
  fast: boolean;
  mode: ChatMode;
  setSources: (sources: SourceChoice) => void;
  setFast: (fast: boolean) => void;
  setMode: (mode: ChatMode) => void;
}

export const useRetrievalScopeStore = create<RetrievalScopeState>()(
  persist(
    (set) => ({
      sources: "all",
      fast: false,
      mode: "qa",
      setSources: (sources) => set({ sources }),
      setFast: (fast) => set({ fast }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "rag.scope",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sources: state.sources, mode: state.mode }),
    },
  ),
);

/** The `scope` field of a chat frame; omitted when every library is in play. */
export function currentScopePayload(): { sources: SourceChoice } | undefined {
  const { sources } = useRetrievalScopeStore.getState();
  return sources === "all" ? undefined : { sources };
}
