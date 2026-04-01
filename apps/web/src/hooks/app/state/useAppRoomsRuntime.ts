import { useRoomSelectionGuard } from "../../rooms/useRoomSelectionGuard";
import { useRoomsDerived } from "../../rooms/useRoomsDerived";
import { useAppRoomsAndServerDerived } from "./useAppRoomsAndServerDerived";

type RoomsDerivedInput = Parameters<typeof useRoomsDerived>[0];
type RoomsAndServerDerivedInput = Omit<Parameters<typeof useAppRoomsAndServerDerived>[0], "allRooms">;
type RoomSelectionGuardInput = Omit<Parameters<typeof useRoomSelectionGuard>[0], "allRooms">;

type UseAppRoomsRuntimeInput = {
  roomsDerived: RoomsDerivedInput;
  roomsAndServerDerived: RoomsAndServerDerivedInput;
  roomSelectionGuard: RoomSelectionGuardInput;
};

export function useAppRoomsRuntime({
  roomsDerived,
  roomsAndServerDerived,
  roomSelectionGuard
}: UseAppRoomsRuntimeInput) {
  const derived = useRoomsDerived(roomsDerived);
  const serverDerived = useAppRoomsAndServerDerived({
    ...roomsAndServerDerived,
    allRooms: derived.allRooms
  });

  useRoomSelectionGuard({
    ...roomSelectionGuard,
    allRooms: derived.allRooms
  });

  return {
    ...derived,
    ...serverDerived
  };
}
