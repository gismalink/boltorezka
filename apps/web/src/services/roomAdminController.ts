import { api } from "../api";
import type { Message, MessagesCursor, Room, RoomKind, RoomsTreeResponse, User } from "../types";

type RoomAdminControllerOptions = {
  pushLog: (text: string) => void;
  setRoomSlug: (slug: string) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: (cursor: MessagesCursor | null) => void;
  sendRoomJoinEvent: (slug: string) => void;
  setRooms: (rooms: Room[]) => void;
  setRoomsTree: (tree: RoomsTreeResponse | null) => void;
  setAdminUsers: (users: User[]) => void;
};

export class RoomAdminController {
  private readonly options: RoomAdminControllerOptions;

  constructor(options: RoomAdminControllerOptions) {
    this.options = options;
  }

  async loadRoomTree(token: string) {
    try {
      const tree = await api.roomTree(token);
      this.options.setRoomsTree(tree);
    } catch (error) {
      this.options.pushLog(`room tree failed: ${(error as Error).message}`);
    }
  }

  async createCategory(token: string, slugInput: string, titleInput: string) {
    try {
      const slug = slugInput.trim();
      const title = titleInput.trim();
      await api.createCategory(token, { slug, title });
      await this.loadRoomTree(token);
      this.options.pushLog(`category created: ${slug}`);
      return true;
    } catch (error) {
      this.options.pushLog(`create category failed: ${(error as Error).message}`);
      return false;
    }
  }

  async createRoom(
    token: string,
    slugInput: string,
    titleInput: string,
    options: { kind: RoomKind; categoryId: string | null }
  ) {
    try {
      const slug = slugInput.trim();
      const title = titleInput.trim();
      await api.createRoom(token, {
        slug,
        title,
        is_public: true,
        kind: options.kind,
        category_id: options.categoryId
      });
      const res = await api.rooms(token);
      this.options.setRooms(res.rooms);
      await this.loadRoomTree(token);
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