"use client";

import { ReactNode } from "react";
import { HistoryProvider } from "@/lib/history-context";
import HistoryDrawer from "@/components/HistoryDrawer";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <HistoryProvider>
      {children}
      <HistoryDrawer />
    </HistoryProvider>
  );
}
