"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface HistoryContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const HistoryContext = createContext<HistoryContextType>({
  isOpen: false,
  toggle: () => {},
  close: () => {},
});

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <HistoryContext.Provider value={{ isOpen, toggle, close }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  return useContext(HistoryContext);
}
