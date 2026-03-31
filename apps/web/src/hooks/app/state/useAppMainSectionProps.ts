import { useMemo, type ComponentProps } from "react";
import { AppMainSection } from "../../../components/AppMainSection";

type AppMainSectionProps = ComponentProps<typeof AppMainSection>;

export function useAppMainSectionProps(input: AppMainSectionProps): AppMainSectionProps {
  return useMemo(() => input, [input]);
}