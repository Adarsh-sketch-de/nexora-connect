-- Connect Phase 5: persistent delivery/read receipts
-- Select your Connect database first if needed (for local testing you used nexora_connect).
CREATE TABLE IF NOT EXISTS message_receipts (
  message_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  delivered_at TIMESTAMP NULL DEFAULT NULL,
  read_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
