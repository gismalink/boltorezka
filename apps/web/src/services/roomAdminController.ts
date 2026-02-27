import { api } from "../api";
import type { Message, MessagesCursor, Room, User } from "../types";

type RoomAdminControllerOptions = {
  pushLog: (text: string) => void;
  setRoomSlug: (slug: string) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: (cursor: MessagesCursor | null) => void;
  sendRoomJoinEvent: (slug: string) => void;
  setRooms: (rooms: Room[]) => void;
  setAdminUsers: (users: User[]) => void;
};

export class RoomAdminController {
  private readonly options: RoomAdminControllerOptions;

  constructor(options: RoomAdminControllerOptions) {
    this.options = options;
  }

  async createRoom(token: string, slugInput: string, titleInput: string) {
    try {
      const slug = slugInput.trim();
      const title = titleInput.trim();
      await api.createRoom(token, { slug, title, is_public: true });
      const res = await api.rooms(token);
      this.options.setRooms(res.rooms);
      this.options.pushLog(`room created: ${slug}`);
      return true;
    } catch (error) {
      this.options.pushLog(`create room failed: ${(error as Error).message}`);
      return false;
    }
  }

  joinRoom(slug: string) {
    this.options.setRoomSlug(slug);
    this.options.setMessages(() => []);
    this.options.setMessagesHasMore(false);
    this.options.setMessagesNextCursor(null);
    this.options.sendRoomJoinEvent(slug);
  }

  async promote(token: string, userId: string) {
    try {
      await api.promoteUser(token, userId);
      const res = await api.adminUsers(token);
      this.options.setAdminUsers(res.users);
      this.options.pushLog("user promoted to admin");
    } catch (error) {
      this.options.pushLog(`promote failed: ${(error as Error).message}`);
    }
  }
}