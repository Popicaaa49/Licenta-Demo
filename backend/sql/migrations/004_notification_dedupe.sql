ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_recipient_dedupe
    ON notifications (LOWER(recipient_address), dedupe_key)
    WHERE dedupe_key IS NOT NULL;
