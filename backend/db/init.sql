-- データベース作成
CREATE DATABASE IF NOT EXISTS tiktok_data;
USE tiktok_data;

-- アカウントリストテーブル
CREATE TABLE account_list (
  id INT NOT NULL AUTO_INCREMENT,
  account_url VARCHAR(255) DEFAULT NULL,
  account_name VARCHAR(50) NOT NULL,
  is_new_account TINYINT(1) DEFAULT NULL,
  latest_video_date DATE DEFAULT NULL,
  needs_update TINYINT(1) DEFAULT NULL,
  under_100k_flag VARCHAR(1) DEFAULT NULL,
  last_crawl_date DATETIME DEFAULT NULL,
  last_video_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT NULL,
  content_type VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY account_url (account_url),
  KEY idx_account_url (account_url),
  KEY idx_is_new_account (is_new_account),
  KEY idx_needs_update (needs_update)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;


-- 動画URLデータテーブル
CREATE TABLE video_url_data (
  id INT NOT NULL AUTO_INCREMENT,
  video_url VARCHAR(255) NOT NULL,
  video_id BIGINT NOT NULL,
  username VARCHAR(50) NOT NULL,
  is_new_video TINYINT(1) DEFAULT '1',
  needs_update TINYINT(1) DEFAULT '1',
  content_type VARCHAR(10) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY video_url (video_url),
  UNIQUE KEY video_id (video_id),
  KEY idx_is_new_account (is_new_video),
  KEY idx_needs_update (needs_update)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_0900_ai_ci;


-- 動画マスターテーブル
CREATE TABLE video_master (
  id INT NOT NULL AUTO_INCREMENT,
  url VARCHAR(255) NOT NULL,
  video_id VARCHAR(50) DEFAULT NULL,
  username VARCHAR(50) NOT NULL,
  cover_image_url VARCHAR(255) DEFAULT NULL,
  display_name VARCHAR(50) DEFAULT NULL,
  description TEXT,
  likes_count INT UNSIGNED DEFAULT NULL,
  play_count INT UNSIGNED DEFAULT NULL,
  comment_count INT UNSIGNED DEFAULT NULL,
  share_count INT UNSIGNED DEFAULT NULL,
  save_count INT UNSIGNED DEFAULT NULL,
  created_at DATE DEFAULT NULL,
  hashtags TEXT,
  duration INT UNSIGNED DEFAULT NULL,
  isViral TINYINT(1) DEFAULT NULL,
  prevFetchDate DATE DEFAULT NULL,
  currentFetchDate DATE DEFAULT NULL,
  prevPlayCount INT UNSIGNED DEFAULT NULL,
  playCountIncrease INT UNSIGNED DEFAULT NULL,
  prevLikesCount INT UNSIGNED DEFAULT NULL,
  likesCountIncrease INT DEFAULT NULL,
  product VARCHAR(255) DEFAULT NULL,
  category VARCHAR(255) DEFAULT NULL,
  music_id VARCHAR(50) DEFAULT NULL,
  music_title VARCHAR(255) DEFAULT NULL,
  music_artist VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'unknown',
  content_type VARCHAR(20) DEFAULT 'video',
  file_path VARCHAR(255) DEFAULT NULL,
  folder_path VARCHAR(255) DEFAULT NULL,
  image_count INT DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY url (url),
  UNIQUE KEY video_id (video_id),
  KEY idx_url (url),
  KEY idx_play_count (play_count),
  KEY idx_created_at (created_at),
  KEY idx_playCountIncrease (playCountIncrease),
  KEY idx_currentFetchDate (currentFetchDate)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;


-- カーソル管理テーブル
CREATE TABLE processing_cursors (
  id INT NOT NULL AUTO_INCREMENT,
  processor_name VARCHAR(50) NOT NULL,
  target_table VARCHAR(50) NOT NULL,
  last_cursor_id INT NOT NULL DEFAULT 0,
  last_reset_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_size INT NOT NULL DEFAULT 4,
  reset_interval INT NOT NULL DEFAULT 86400,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  batch_number INT NOT NULL DEFAULT 100,
  PRIMARY KEY (id),
  UNIQUE KEY uk_processor (processor_name, target_table)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;


-- url_collector用のカーソル初期データ
INSERT INTO processing_cursors 
(processor_name, target_table, batch_size, reset_interval) 
VALUES 
('url_collector', 'account_list', 100, 86400);

-- video_collector用のカーソル初期データ
INSERT INTO processing_cursors 
(processor_name, target_table, batch_size, reset_interval) 
VALUES 
('video_collector', 'video_url_data', 10, 172800);  -- バッチサイズ10、リセット間隔48時間（172800秒）


-- カテゴリーマスターテーブル
CREATE TABLE category_master (
  category_id INT NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (category_id),
  UNIQUE KEY category_id (category_id),
  UNIQUE KEY category_name (category_name)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;


-- カテゴリーキーワードテーブル
CREATE TABLE category_keywords (
  keyword_id INT NOT NULL AUTO_INCREMENT,
  category_id INT DEFAULT NULL,
  keyword VARCHAR(255) NOT NULL,
  is_product TINYINT(1) DEFAULT 0,
  PRIMARY KEY (keyword_id),
  UNIQUE KEY keyword_id (keyword_id),
  KEY idx_keyword (keyword)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;


-- フロントエンドデータテーブル
CREATE TABLE frontend_data (
    id VARCHAR(10) PRIMARY KEY,
    url VARCHAR(255) UNIQUE,
    thumbnail_url VARCHAR(255),
    created_at DATE,
    play_count INT UNSIGNED,
    play_count_increase INT UNSIGNED,
    account_name VARCHAR(50),
    likes_count INT UNSIGNED,
    comment_count INT UNSIGNED,
    hashtags TEXT,
    music_info TEXT,
    caption TEXT
);

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    email_verified DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- セッションテーブル
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- パスワードリセット用トークンテーブル
CREATE TABLE IF NOT EXISTS verification_tokens (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires DATETIME NOT NULL,
    type ENUM('RESET_PASSWORD', 'VERIFY_EMAIL') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY token_unique (token)
); 