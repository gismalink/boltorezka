import { db } from "../db.js";

export type MessageSearchScope = "all" | "server" | "room" | "topic";

export type MessageSearchCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

export type SearchMessagesInput = {
  userId: string;
  q: string;
  scope: MessageSearchScope;
  serverId?: string;
  roomId?: string;
  topicId?: string;
  authorId?: string;
  hasAttachment?: boolean;
  attachmentType?: "image";
  hasLink?: boolean;
  hasMention?: boolean;
  from?: string;
  to?: string;
  limit: number;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
};

export type SearchMessageItem = {
  id: string;
  roomId: string;
  roomSlug: string;
  roomTitle: string;
  topicId: string | null;
  topicSlug: string | null;
  topicTitle: string | null;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  hasAttachments: boolean;
  attachmentCount: number;
};

export type SearchMessagesResult = {
  messages: SearchMessageItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: MessageSearchCursor | null;
  };
};

export async function searchMessages(input: SearchMessagesInput): Promise<SearchMessagesResult> {
  const where: string[] = [];
  const params: unknown[] = [];

  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  where.push(`m.body ILIKE ${bind(`%${input.q}%`)}`);

  if (input.scope === "server") {
    if (!input.serverId) {
      throw new Error("validation_error");
    }
    where.push(`r.server_id = ${bind(input.serverId)}`);
  }

  if (input.scope === "room") {
    if (!input.roomId) {
      throw new Error("validation_error");
    }
    where.push(`m.room_id = ${bind(input.roomId)}`);
  }

  if (input.scope === "topic") {
    if (!input.topicId) {
      throw new Error("validation_error");
    }
    where.push(`m.topic_id = ${bind(input.topicId)}`);
  }

  if (input.serverId && input.scope === "all") {
    where.push(`r.server_id = ${bind(input.serverId)}`);
  }

  if (input.roomId && input.scope === "all") {
    where.push(`m.room_id = ${bind(input.roomId)}`);
  }

  if (input.topicId && input.scope === "all") {
    where.push(`m.topic_id = ${bind(input.topicId)}`);
  }

  if (input.authorId) {
    where.push(`m.user_id = ${bind(input.authorId)}`);
  }

  if (typeof input.hasMention === "boolean") {
    where.push(input.hasMention ? `m.body LIKE '%@%'` : `m.body NOT LIKE '%@%'`);
  }

  if (typeof input.hasAttachment === "boolean") {
    where.push(
      input.hasAttachment
        ? `EXISTS (SELECT 1 FROM message_attachments ma WHERE ma.message_id = m.id)`
        : `NOT EXISTS (SELECT 1 FROM message_attachments ma WHERE ma.message_id = m.id)`
    );
  }

  if (input.attachmentType) {
    where.push(
      `EXISTS (
        SELECT 1 FROM message_attachments ma
        WHERE ma.message_id = m.id
          AND ma.type = ${bind(input.attachmentType)}
      )`
    );
  }

  if (typeof input.hasLink === "boolean") {
    where.push(input.hasLink ? `m.body ~* '(https?://|www\\.)'` : `m.body !~* '(https?://|www\\.)'`);
  }

  if (input.from) {
    where.push(`m.created_at >= ${bind(input.from)}`);
  }

  if (input.to) {
    where.push(`m.created_at <= ${bind(input.to)}`);
  }

  if (input.beforeCreatedAt && input.beforeId) {
    where.push(`(m.created_at, m.id) < (${bind(input.beforeCreatedAt)}::timestamptz, ${bind(input.beforeId)})`);
  }

  // Access policy (same base semantics as room/topic reads):
  // - hidden room requires visibility grant or membership
  // - private room requires membership
  // - server-scoped room requires active membership in that server
  where.push(
    `(
      r.is_hidden = FALSE
      OR EXISTS (
        SELECT 1 FROM room_visibility_grants rvg
        WHERE rvg.room_id = r.id AND rvg.user_id = ${bind(input.userId)}
      )
      OR EXISTS (
        SELECT 1 FROM room_members rm_hidden
        WHERE rm_hidden.room_id = r.id AND rm_hidden.user_id = ${bind(input.userId)}
      )
    )`
  );

  where.push(
    `(
      r.is_public = TRUE
      OR EXISTS (
        SELECT 1 FROM room_members rm_private
        WHERE rm_private.room_id = r.id AND rm_private.user_id = ${bind(input.userId)}
      )
    )`
  );

  where.push(
    `(
      r.server_id IS NULL
      OR EXISTS (
        SELECT 1 FROM server_members sm
        WHERE sm.server_id = r.server_id
          AND sm.user_id = ${bind(input.userId)}
          AND sm.status = 'active'
      )
    )`
  );

  type DbSearchRow = {
    id: string;
    room_id: string;
    room_slug: string;
    room_title: string;
    topic_id: string | null;
    topic_slug: string | null;
    topic_title: string | null;
    user_id: string;
    user_name: string;
    text: string;
    created_at: string;
    edited_at: string | null;
    attachment_count: string;
  };

  const query = `
    SELECT
      m.id,
      m.room_id,
      r.slug AS room_slug,
      r.title AS room_title,
      m.topic_id,
      rt.slug AS topic_slug,
      rt.title AS topic_title,
      m.user_id,
      u.name AS user_name,
      m.body AS text,
      m.created_at,
      m.updated_at AS edited_at,
      (
        SELECT COUNT(*)::text
        FROM message_attachments ma
        WHERE ma.message_id = m.id
      ) AS attachment_count
    FROM messages m
    JOIN rooms r ON r.id = m.room_id
    LEFT JOIN room_topics rt ON rt.id = m.topic_id
    JOIN users u ON u.id = m.user_id
    WHERE ${where.join(" AND ")}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${bind(input.limit + 1)}
  `;

  const result = await db.query<DbSearchRow>(query, params);
  const hasMore = result.rows.length > input.limit;
  const pageDesc = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  const oldest = pageDesc[pageDesc.length - 1] || null;

  return {
    messages: pageDesc.map((row) => {
      const attachmentCount = Number(row.attachment_count || "0");
      return {
        id: row.id,
        roomId: row.room_id,
        roomSlug: row.room_slug,
        roomTitle: row.room_title,
        topicId: row.topic_id,
        topicSlug: row.topic_slug,
        topicTitle: row.topic_title,
        userId: row.user_id,
        userName: row.user_name,
        text: row.text,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        hasAttachments: attachmentCount > 0,
        attachmentCount
      };
    }),
    pagination: {
      hasMore,
      nextCursor: hasMore && oldest
        ? {
            beforeCreatedAt: oldest.created_at,
            beforeId: oldest.id
          }
        : null
    }
  };
}
