import { useMemo, type ComponentProps } from "react";
import { AppTopChrome } from "../../../components/AppTopChrome";

type AppTopChromeProps = ComponentProps<typeof AppTopChrome>;

type UseAppTopChromePropsInput = Omit<
  AppTopChromeProps,
  "onToggleAppMenu" | "onToggleAuthMenu" | "onToggleProfileMenu"
> & {
  setAppMenuOpen: (value: boolean | ((value: boolean) => boolean)) => void;
  setAuthMenuOpen: (value: boolean | ((value: boolean) => boolean)) => void;
  setProfileMenuOpen: (value: boolean | ((value: boolean) => boolean)) => void;
};

export function useAppTopChromeProps({
  setAppMenuOpen,
  setAuthMenuOpen,
  setProfileMenuOpen,
  ...rest
}: UseAppTopChromePropsInput): AppTopChromeProps {
  return useMemo(() => ({
    ...rest,
    onToggleAppMenu: () => setAppMenuOpen((value) => !value),
    onToggleAuthMenu: () => setAuthMenuOpen((value) => !value),
    onToggleProfileMenu: () => setProfileMenuOpen((value) => !value)
  }), [rest, setAppMenuOpen, setAuthMenuOpen, setProfileMenuOpen]);
}