import { useAppUserDockSharedProps } from "./useAppUserDockSharedProps";

type AppUserDockSharedPropsInput = Parameters<typeof useAppUserDockSharedProps>[0];

export function useAppUserDockSharedPropsInput(params: Record<string, unknown>): AppUserDockSharedPropsInput {
  return params as AppUserDockSharedPropsInput;
}
