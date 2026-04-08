export type RoomUnreadSource = "cache" | "network";

export function reconcileRoomUnreadValue(
  currentValue: number,
  fetchedValue: number,
  source: RoomUnreadSource
): number {
  const normalizedCurrentValue = Math.max(0, Number(currentValue || 0));
  const normalizedFetchedValue = Math.max(0, Number(fetchedValue || 0));

  if (source === "cache") {
    return normalizedCurrentValue;
  }

  return normalizedFetchedValue;
}
