"use client";

import { createContext, useContext } from "react";
import type { Wedding } from "@/lib/types";

type WeddingContextValue = {
  wedding: Wedding;
  userEmail: string;
};

const WeddingContext = createContext<WeddingContextValue | null>(null);

export function WeddingProvider({ value, children }: { value: WeddingContextValue; children: React.ReactNode }) {
  return <WeddingContext.Provider value={value}>{children}</WeddingContext.Provider>;
}

export function useWedding() {
  const value = useContext(WeddingContext);
  if (!value) throw new Error("useWedding must be used inside WeddingProvider");
  return value;
}
