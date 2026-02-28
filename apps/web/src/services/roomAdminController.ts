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

  async updateCategory(token: string, categoryId: string, titleInput: string) {
    try {
      await api.updateCategory(token, categoryId, { title: titleInput.trim() });
      await this.loadRoomTree(token);
      this.options.pushLog("category updated");
      return true;
    } catch (error) {
      this.options.pushLog(`update category failed: ${(error as Error).message}`);
      return false;
    }
  }

  async moveCategory(token: string, categoryId: string, direction: "up" | "down") {
    try {
      await api.moveCategory(token, categoryId, direction);
      await this.loadRoomTree(token);
      this.options.pushLog(`category moved ${direction}`);
      return true;
    } catch (error) {
      this.options.pushLog(`move category failed: ${(error as Error).message}`);
      return false;
    }
  }

  async deleteCategory(token: string, categoryId: string) {
    try {
      await api.deleteCategory(token, categoryId);
      const res = await api.rooms(token);
      this.options.setRooms(res.rooms);
      await this.loadRoomTree(token);
      this.options.pushLog("category deleted");
      return true;
    } catch (error) {
      this.options.pushLog(`delete category failed: ${(error as Error).message}`);
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

  async updateRoom(
    token: string,
    roomId: string,
    options: { title: string; kind: RoomKind; categoryId: string | null }
  ) {
    try {
      await api.updateRoom(token, roomId, {
        title: options.title.trim(),
        kind: options.kind,
        category_id: options.categoryId
      });

      const res = await api.rooms(token);
      this.options.setRooms(res.rooms);
      await this.loadRoomTree(token);
      this.options.pushLog("channel updated");
      return true;
    } catch (error) {
      this.options.pushLog(`update channel failed: ${(error as Error).message}`);
      return false;
    }
  }

  async moveRoom(token: string, roomId: string, direction: "up" | "down") {
    try {
      await api.moveRoom(token, roomId, direction);
      await this.loadRoomTree(token);
      this.options.pushLog(`channel moved ${direction}`);
      return true;
    } catch (error) {
      this.options.pushLog(`move channel failed: ${(error as Error).message}`);
      return false;
    }
  }

  async deleteRoom(token: string, roomId: string) {
    try {
      await api.deleteRoom(token, roomId);
      const res = await api.rooms(token);
      this.options.setRooms(res.rooms);
      await this.loadRoomTree(token);
      this.options.pushLog("channel deleted");
      return true;
    } catch (error) {
      this.options.pushLog(`delete channel failed: ${(error as Error).message}`);
      return false;
    }
  }

  async clearRoomMessages(token: string, roomId: string) {
    try {
      const result = await api.clearRoomMessages(token, roomId);
      this.options.pushLog(`channel chat cleared (${result.deletedCount})`);
      return true;
    } catch (error) {
      this.options.pushLog(`clear channel chat failed: ${(error as Error).message}`);
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