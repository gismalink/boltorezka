import { api } from "../api";
import type { AudioQuality, Message, MessagesCursor, Room, RoomKind, RoomsTreeResponse, User } from "../domain";

type RoomAdminControllerOptions = {
  pushLog: (text: string) => void;
  pushToast?: (text: string) => void;
  setRoomSlug: (slug: string) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: (cursor: MessagesCursor | null) => void;
  sendRoomJoinEvent: (slug: string) => Promise<void>;
  setRooms: (rooms: Room[]) => void;
  setRoomsTree: (tree: RoomsTreeResponse | null) => void;
  setArchivedRooms: (rooms: Room[]) => void;
  setAdminUsers: (users: User[]) => void;
  getCurrentServerId?: () => string;
};

export class RoomAdminController {
  private readonly options: RoomAdminControllerOptions;

  constructor(options: RoomAdminControllerOptions) {
    this.options = options;
  }

  private getCurrentServerId(): string | undefined {
    const value = String(this.options.getCurrentServerId?.() || "").trim();
    return value || undefined;
  }

  async loadRoomTree(token: string) {
    try {
      const serverId = this.getCurrentServerId();
      if (!serverId) {
        this.options.setRoomsTree(null);
        this.options.setArchivedRooms([]);
        return;
      }

      const tree = await api.roomTree(token, serverId);
      this.options.setRoomsTree(tree);

      try {
        const archived = await api.archivedRooms(token, serverId);
        this.options.setArchivedRooms(archived.rooms);
      } catch (error) {
        this.options.pushLog(`archived rooms failed: ${(error as Error).message}`);
        this.options.setArchivedRooms([]);
      }
    } catch (error) {
      this.options.pushLog(`room tree failed: ${(error as Error).message}`);
      this.options.setArchivedRooms([]);
    }
  }

  async createCategory(token: string, titleInput: string) {
    try {
      const title = titleInput.trim();
      const response = await api.createCategory(token, {
        title,
        server_id: this.getCurrentServerId()
      });
      await this.loadRoomTree(token);
      this.options.pushLog(`category created: ${response.category.slug}`);
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
      const res = await api.rooms(token, this.getCurrentServerId());
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
    titleInput: string,
    options: { kind: RoomKind; categoryId: string | null; nsfw?: boolean; audioQualityOverride?: AudioQuality | null }
  ) {
    try {
      const title = titleInput.trim();
      const response = await api.createRoom(token, {
        title,
        is_public: true,
        kind: options.kind,
        server_id: this.getCurrentServerId(),
        category_id: options.categoryId,
        nsfw: Boolean(options.nsfw),
        audio_quality_override: options.audioQualityOverride
      });
      const res = await api.rooms(token, this.getCurrentServerId());
      this.options.setRooms(res.rooms);
      await this.loadRoomTree(token);
      this.options.pushLog(`room created: ${response.room.slug}`);
      return true;
    } catch (error) {
      const reason = (error as Error).message;
      this.options.pushLog(`create room failed: ${reason}`);
      this.options.pushToast?.(`create room failed: ${reason}`);
      return false;
    }
  }

  async updateRoom(
    token: string,
    roomId: string,
    options: {
      title: string;
      kind: RoomKind;
      categoryId: string | null;
      isHidden?: boolean;
      nsfw?: boolean;
      audioQualityOverride?: AudioQuality | null;
    }
  ) {
    try {
      await api.updateRoom(token, roomId, {
        title: options.title.trim(),
        kind: options.kind,
        category_id: options.categoryId,
        is_hidden: Boolean(options.isHidden),
        nsfw: Boolean(options.nsfw),
        audio_quality_override: options.audioQualityOverride
      });

      const res = await api.rooms(token, this.getCurrentServerId());
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
      const res = await api.rooms(token, this.getCurrentServerId());
      this.options.setRooms(res.rooms);
      await this.loadRoomTree(token);
      this.options.pushLog("channel archived");
      return true;
    } catch (error) {
      this.options.pushLog(`delete channel failed: ${(error as Error).message}`);
      return false;
    }
  }

  async restoreRoom(token: string, roomId: string) {
    try {
      await api.restoreRoom(token, roomId);
      const res = await api.rooms(token, this.getCurrentServerId());
      this.options.setRooms(res.rooms);
      await this.loadRoomTree(token);
      this.options.pushLog("channel restored");
      return true;
    } catch (error) {
      this.options.pushLog(`restore channel failed: ${(error as Error).message}`);
      return false;
    }
  }

  async deleteRoomPermanent(token: string, roomId: string) {
    try {
      await api.deleteRoomPermanent(token, roomId);
      await this.loadRoomTree(token);
      this.options.pushLog("channel deleted permanently");
      return true;
    } catch (error) {
      this.options.pushLog(`permanent delete failed: ${(error as Error).message}`);
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

  async joinRoom(slug: string) {
    await this.options.sendRoomJoinEvent(slug);
    this.options.setRoomSlug(slug);
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

  async demote(token: string, userId: string) {
    try {
      await api.demoteUser(token, userId);
      const res = await api.adminUsers(token);
      this.options.setAdminUsers(res.users);
      this.options.pushLog("admin demoted to user");
    } catch (error) {
      this.options.pushLog(`demote failed: ${(error as Error).message}`);
    }
  }

  async setBan(token: string, userId: string, banned: boolean) {
    try {
      if (banned) {
        await api.banUser(token, userId);
      } else {
        await api.unbanUser(token, userId);
      }
      const res = await api.adminUsers(token);
      this.options.setAdminUsers(res.users);
      this.options.pushLog(banned ? "user banned" : "user unbanned");
    } catch (error) {
      this.options.pushLog(`${banned ? "ban" : "unban"} failed: ${(error as Error).message}`);
    }
  }

  async setAccessState(token: string, userId: string, accessState: "pending" | "active" | "blocked") {
    try {
      await api.setUserAccessState(token, userId, accessState);
      const res = await api.adminUsers(token);
      this.options.setAdminUsers(res.users);
      this.options.pushLog(`user access state updated: ${accessState}`);
    } catch (error) {
      this.options.pushLog(`set access state failed: ${(error as Error).message}`);
    }
  }

  async deleteUser(token: string, userId: string) {
    try {
      await api.deleteUser(token, userId);
      const res = await api.adminUsers(token);
      this.options.setAdminUsers(res.users);
      this.options.pushLog("user scheduled for deletion");
      return true;
    } catch (error) {
      this.options.pushLog(`delete user failed: ${(error as Error).message}`);
      return false;
    }
  }

  async forceDeleteUserNow(token: string, userId: string) {
    try {
      await api.forceDeleteUserNow(token, userId);
      const res = await api.adminUsers(token);
      this.options.setAdminUsers(res.users);
      this.options.pushLog("user force deleted");
      return true;
    } catch (error) {
      this.options.pushLog(`force delete failed: ${(error as Error).message}`);
      return false;
    }
  }
}