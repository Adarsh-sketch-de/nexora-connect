USE connect;

CREATE TABLE IF NOT EXISTS user_blocks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  blocker_id BIGINT NOT NULL,
  blocked_user_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_block(blocker_id, blocked_user_id),
  FOREIGN KEY(blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  reporter_id BIGINT NOT NULL,
  reported_user_id BIGINT NOT NULL,
  conversation_id BIGINT NULL,
  message_id BIGINT NULL,
  reason VARCHAR(60) NOT NULL,
  description VARCHAR(1000) DEFAULT '',
  status ENUM('open','reviewed','resolved','dismissed') DEFAULT 'open',
  reviewed_by VARCHAR(190) NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE SET NULL
);
