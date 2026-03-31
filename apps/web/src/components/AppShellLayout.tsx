import type { ComponentProps } from "react";
import { AppMainSection } from "./AppMainSection";
import { AppShellOverlays } from "./AppShellOverlays";
import { AppTopChrome } from "./AppTopChrome";

type AppShellLayoutProps = {
  topChromeProps: ComponentProps<typeof AppTopChrome>;
  mainSectionProps: ComponentProps<typeof AppMainSection>;
  shellOverlaysProps: ComponentProps<typeof AppShellOverlays>;
};

export function AppShellLayout({
  topChromeProps,
  mainSectionProps,
  shellOverlaysProps
}: AppShellLayoutProps) {
  return (
    <main className="app legacy-layout mx-auto grid h-[100dvh] max-h-[100dvh] w-full max-w-[1400px] grid-rows-[auto_1fr] gap-4 overflow-hidden p-4 desktop:gap-6 desktop:p-8">
      <AppTopChrome {...topChromeProps} />
      <AppMainSection {...mainSectionProps} />
      <AppShellOverlays {...shellOverlaysProps} />
    </main>
  );
}