DELETE FROM messages
WHERE telegram_message_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM messages
    WHERE telegram_message_id IS NOT NULL
    GROUP BY user_id, direction, telegram_message_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_telegram_identity
  ON messages(user_id, direction, telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;
