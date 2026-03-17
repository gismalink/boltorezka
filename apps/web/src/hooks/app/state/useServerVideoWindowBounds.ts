import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";

type UseServerVideoWindowBoundsArgs = {
  minWidth: number;
  maxWidth: number;
  setMinWidth: Dispatch<SetStateAction<number>>;
  setMaxWidth: Dispatch<SetStateAction<number>>;
};

export function useServerVideoWindowBounds({
  minWidth,
  maxWidth,
  setMinWidth,
  setMaxWidth
}: UseServerVideoWindowBoundsArgs) {
  const normalizedMinWidth = useMemo(() => Math.min(minWidth, maxWidth), [minWidth, maxWidth]);
  const normalizedMaxWidth = useMemo(() => Math.max(minWidth, maxWidth), [minWidth, maxWidth]);

  const setBoundedMinWidth = useCallback((value: number) => {
    const nextMin = Math.max(80, Math.min(300, Math.round(value)));
    setMinWidth(nextMin);
    setMaxWidth((prev) => Math.max(Math.max(120, Math.min(480, Math.round(prev))), nextMin));
  }, [setMaxWidth, setMinWidth]);

  const setBoundedMaxWidth = useCallback((value: number) => {
    const nextMax = Math.max(120, Math.min(480, Math.round(value)));
    setMaxWidth(nextMax);
    setMinWidth((prev) => Math.min(Math.max(80, Math.min(300, Math.round(prev))), nextMax));
  }, [setMaxWidth, setMinWidth]);

  return {
    normalizedMinWidth,
    normalizedMaxWidth,
    setBoundedMinWidth,
    setBoundedMaxWidth
  };
}
