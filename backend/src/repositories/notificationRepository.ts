import { db } from "../db/pool";

export type NotificationRecord = {
  id: string;
  recipient_address: string;
  type: string;
  title: string;
  message: string;
  entity_type: string;
  entity_id: string | null;
  dedupe_key: string | null;
  metadata: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
};

export type Notification = {
  id: number;
  recipientAddress: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: number | null;
  dedupeKey: string | null;
  metadata: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
};

export type CreateNotificationInput = {
  recipientAddress: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId?: number | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
};

const mapNotification = (record: NotificationRecord): Notification => ({
  id: Number(record.id),
  recipientAddress: record.recipient_address,
  type: record.type,
  title: record.title,
  message: record.message,
  entityType: record.entity_type,
  entityId: record.entity_id === null ? null : Number(record.entity_id),
  dedupeKey: record.dedupe_key,
  metadata: record.metadata ?? {},
  readAt: record.read_at,
  createdAt: record.created_at,
});

export class NotificationRepository {
  async createMany(inputs: CreateNotificationInput[]) {
    const normalized = inputs
      .filter((input) => input.recipientAddress.trim().length > 0)
      .map((input) => ({
        ...input,
        recipientAddress: input.recipientAddress.toLowerCase(),
      }));

    if (normalized.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = normalized.map((input, index) => {
      const offset = index * 8;
      values.push(
        input.recipientAddress,
        input.type,
        input.title,
        input.message,
        input.entityType,
        input.entityId ?? null,
        input.dedupeKey ?? null,
        JSON.stringify(input.metadata ?? {})
      );

      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb)`;
    });

    const result = await db.query<NotificationRecord>(
      `INSERT INTO notifications (
          recipient_address,
          type,
          title,
          message,
          entity_type,
          entity_id,
          dedupe_key,
          metadata
       )
       VALUES ${placeholders.join(", ")}
       ON CONFLICT DO NOTHING
       RETURNING *`,
      values
    );

    return result.rows.map(mapNotification);
  }

  async listByRecipient(recipientAddress: string, limit = 25) {
    const result = await db.query<NotificationRecord>(
      `SELECT *
       FROM notifications
       WHERE LOWER(recipient_address) = LOWER($1)
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [recipientAddress, limit]
    );

    return result.rows.map(mapNotification);
  }

  async countUnread(recipientAddress: string) {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM notifications
       WHERE LOWER(recipient_address) = LOWER($1)
         AND read_at IS NULL`,
      [recipientAddress]
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async markRead(id: number, recipientAddress: string) {
    const result = await db.query<NotificationRecord>(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1
         AND LOWER(recipient_address) = LOWER($2)
       RETURNING *`,
      [id, recipientAddress]
    );

    return result.rows[0] ? mapNotification(result.rows[0]) : null;
  }

  async markAllRead(recipientAddress: string) {
    await db.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE LOWER(recipient_address) = LOWER($1)
         AND read_at IS NULL`,
      [recipientAddress]
    );
  }
}
