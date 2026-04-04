export type ServerMemberProfileDetails = {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
  role: "owner" | "admin" | "member";
  customRoles: Array<{ id: string; name: string }>;
  hiddenRoomAccess: Array<{ roomId: string; roomSlug: string; roomTitle: string }>;
  hiddenRoomsAvailable: Array<{ roomId: string; roomSlug: string; roomTitle: string; hasAccess: boolean }>;
};
