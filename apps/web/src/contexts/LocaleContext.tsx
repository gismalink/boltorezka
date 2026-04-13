import { createContext, useContext, type ReactNode } from "react";

type LocaleContextValue = {
  t: (key: string) => string;
  locale: string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocaleCtx(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocaleCtx must be used inside LocaleProvider");
  return ctx;
}

export function LocaleProvider({ value, children }: { value: LocaleContextValue; children: ReactNode }) {
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
