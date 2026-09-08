USE connect;

CREATE TABLE IF NOT EXISTS meeting_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_id VARCHAR(80) UNIQUE NOT NULL,
  conversation_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(meeting_id,user_id),
  FOREIGN KEY(meeting_id) REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_transcripts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  meeting_id BIGINT NOT NULL,
  speaker_id BIGINT NOT NULL,
  speaker_name VARCHAR(80) NOT NULL,
  language VARCHAR(20),
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(meeting_id) REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(speaker_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_summaries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  meeting_id BIGINT NOT NULL,
  requested_by BIGINT NOT NULL,
  language VARCHAR(10) DEFAULT 'en',
  summary MEDIUMTEXT,
  key_points JSON,
  decisions JSON,
  action_items JSON,
  suggestions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(meeting_id) REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(requested_by) REFERENCES users(id) ON DELETE CASCADE
);
