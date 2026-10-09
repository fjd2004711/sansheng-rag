"use client";

import { create } from "zustand";
import type { SourceItem } from "@/lib/chat-sources";

interface SourcesPanelState {
  isOpen: boolean;
  sources: SourceItem[];
  highlightedIndex: number | null;
  /** The answer statement the opened source is supposed to back, shown above it. */
  claim: string | null;
  open: (sources: SourceItem[], highlightedIndex?: number | null, claim?: string | null) => void;
  close: () => void;
}

export const useSourcesPanelStore = create<SourcesPanelState>((set) => ({
  isOpen: false,
  sources: [],
  highlightedIndex: null,
  claim: null,
  open: (sources, highlightedIndex = null, claim = null) => set({ isOpen: true, sources, highlightedIndex, claim }),
  close: () => set({ isOpen: false, highlightedIndex: null, claim: null }),
}));
