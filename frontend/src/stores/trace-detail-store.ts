"use client";

import { create } from "zustand";

/** Which answer's detailed operation process is open in the drawer (null = closed). */
interface TraceDetailState {
  messageId: string | null;
  open: (messageId: string) => void;
  close: () => void;
}

export const useTraceDetailStore = create<TraceDetailState>((set) => ({
  messageId: null,
  open: (messageId) => set({ messageId }),
  close: () => set({ messageId: null }),
}));
