"use client";

import { createContext, useContext, type ReactNode } from "react";

const ScreenActiveContext = createContext(true);

export function ScreenActiveProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <ScreenActiveContext.Provider value={active}>{children}</ScreenActiveContext.Provider>
  );
}

export function useScreenActive() {
  return useContext(ScreenActiveContext);
}
