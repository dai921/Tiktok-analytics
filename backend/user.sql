-- ユーザーテーブル
CREATE TABLE users (
  id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) DEFAULT 0,
  name VARCHAR(255) DEFAULT NULL,
  email_verified DATETIME DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY email (email)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;


-- セッションテーブル
CREATE TABLE sessions (
  id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  session_token VARCHAR(255) NOT NULL,
  expires DATETIME NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY session_token (session_token),
  KEY user_id (user_id),
  CONSTRAINT sessions_ibfk_1
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;


-- パスワードリセット用トークンテーブル
CREATE TABLE verification_tokens (
  id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires DATETIME NOT NULL,
  type ENUM('RESET_PASSWORD','VERIFY_EMAIL') NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY token_unique (token)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE user_display_settings (
  setting_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  setting_name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE,
  INDEX idx_email (email)
);

CREATE TABLE column_settings (
  column_setting_id INT AUTO_INCREMENT PRIMARY KEY,
  setting_id INT NOT NULL,
  column_name VARCHAR(50) NOT NULL,
  is_visible BOOLEAN DEFAULT TRUE,
  display_order INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (setting_id) REFERENCES user_display_settings(setting_id) ON DELETE CASCADE,
  INDEX idx_setting_id (setting_id)
);

-- フィルター設定テーブル
CREATE TABLE filter_settings (
  filter_id INT AUTO_INCREMENT PRIMARY KEY,
  setting_id INT NOT NULL,
  filter_type VARCHAR(50) NOT NULL,
  operator VARCHAR(30) NOT NULL,
  value VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (setting_id) REFERENCES user_display_settings(setting_id) ON DELETE CASCADE,
  INDEX idx_setting_id (setting_id)
);

-- ソート設定テーブル
CREATE TABLE sort_settings (
  sort_id INT AUTO_INCREMENT PRIMARY KEY,
  setting_id INT NOT NULL,
  sort_field VARCHAR(50) NOT NULL,
  sort_order ENUM('ASC', 'DESC') DEFAULT 'DESC',
  priority INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (setting_id) REFERENCES user_display_settings(setting_id) ON DELETE CASCADE,
  INDEX idx_setting_id (setting_id)
);

-- 動画ウォッチリストテーブル
CREATE TABLE video_watchlists (
  watchlist_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  video_id VARCHAR(255) NOT NULL,
  watchlist_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES frontend_data(video_id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_video (email, video_id),
  INDEX idx_email (email)
);

-- アカウントブックマークテーブル
CREATE TABLE account_bookmarks (
  bookmark_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  bookmark_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE,
  UNIQUE KEY unique_user_account (email, account_name),
  INDEX idx_email (email)
);

-- TikTokトークン保存用テーブル
CREATE TABLE tiktok_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_in INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
);

-- OAuth stateパラメータ保存テーブル
CREATE TABLE user_oauth_states (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  oauth_state VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_oauth_state (oauth_state)
);