import type { User } from "../../../domain";
import { useAppEntryGates } from "./useAppEntryGates";

type UseAppEntryGatesInput = Parameters<typeof useAppEntryGates>[0];

type UseAppEntryGatesStateInput = Omit<UseAppEntryGatesInput, "serversCount"> & {
  servers: Array<{ id: string }>;
  user: User | null;
};

export function useAppEntryGatesState({
  servers,
  ...rest
}: UseAppEntryGatesStateInput) {
  return useAppEntryGates({
    ...rest,
    serversCount: servers.length
  });
}