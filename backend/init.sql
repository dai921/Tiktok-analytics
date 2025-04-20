-- DBのテーブルを作成するSQL
-- データベース作成
CREATE DATABASE IF NOT EXISTS tiktok_data;
USE tiktok_data;

-- アカウントリストテーブル
CREATE TABLE account_list (
  id INT NOT NULL AUTO_INCREMENT,
  account_url VARCHAR(255) DEFAULT NULL,
  favorite_user_username VARCHAR(50) DEFAULT NULL,
  is_new_account TINYINT(1) DEFAULT NULL,
  last_crawled_at DATETIME DEFAULT NULL,
  favorite_user_is_alive BOOLEAN NOT NULL DEFAULT TRUE,
  crawl_priority INT NOT NULL DEFAULT 10,
  account_type VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT NULL,
  updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY account_url (account_url),
  KEY idx_account_url (account_url),
  KEY idx_is_new_account (is_new_account)
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
  ten_days_increase INT DEFAULT NULL,
  prevLikesCount INT UNSIGNED DEFAULT NULL,
  likesCountIncrease INT DEFAULT NULL,
  ten_days_likes_increase INT DEFAULT NULL,
  prevCommentCount INT UNSIGNED DEFAULT NULL,
  commentCountIncrease INT DEFAULT NULL,
  ten_days_comment_increase INT DEFAULT NULL,
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
  KEY idx_ten_days_likes_increase (ten_days_likes_increase),
  KEY idx_commentCountIncrease (commentCountIncrease),
  KEY idx_ten_days_comment_increase (ten_days_comment_increase),
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


INSERT INTO processing_cursors 
(processor_name, target_table, batch_size, reset_interval) 
VALUES 
('frontend_data_update', 'frontend_data', 17000, 172800); 


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
  id INT NOT NULL AUTO_INCREMENT,
  url VARCHAR(255) NOT NULL,
  thumbnail_url VARCHAR(255) DEFAULT NULL,
  created_at DATE DEFAULT NULL,
  play_count INT UNSIGNED DEFAULT NULL,
  play_count_increase INT UNSIGNED DEFAULT NULL,
  ten_days_increase INT DEFAULT NULL,
  account_name VARCHAR(50) DEFAULT NULL,
  display_name VARCHAR(255) DEFAULT NULL,
  content_type VARCHAR(50) DEFAULT NULL,
  likes_count INT UNSIGNED DEFAULT NULL,
  comment_count INT UNSIGNED DEFAULT NULL,
  likes_count_increase INT DEFAULT NULL,
  ten_days_likes_increase INT DEFAULT NULL,
  comment_count_increase INT DEFAULT NULL,
  ten_days_comment_increase INT DEFAULT NULL,
  account_type VARCHAR(50) DEFAULT NULL,
  hashtags TEXT,
  music_info TEXT,
  caption TEXT,
  category VARCHAR(255) DEFAULT NULL,
  product VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY url (url),
  KEY idx_play_count (play_count),
  KEY idx_play_count_increase (play_count_increase),
  KEY idx_ten_days_increase (ten_days_increase),
  KEY idx_account_name (account_name),
  KEY idx_content_type (content_type),
  KEY idx_likes_count (likes_count),
  KEY idx_comment_count (comment_count),
  KEY idx_likes_count_increase (likes_count_increase),
  KEY idx_ten_days_likes_increase (ten_days_likes_increase),
  KEY idx_comment_count_increase (comment_count_increase),
  KEY idx_ten_days_comment_increase (ten_days_comment_increase),
  KEY idx_account_type (account_type),
  KEY idx_category (category),
  KEY idx_product (product),
  KEY idx_created_at (created_at)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci;


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

CREATE TABLE trend_analysis (
  id SERIAL PRIMARY KEY,
  collection_date DATE NOT NULL,  -- 集計日
  genre VARCHAR(100) NOT NULL,    -- ジャンル
  view_increase BIGINT NOT NULL,  -- 再生増加数
  videos_10k_plus INT NOT NULL,   -- 再生増加数1万以上動画数
  videos_100k_plus INT NOT NULL,  -- 再生増加数10万以上動画数
  total_posts INT NOT NULL,       -- 投稿数
  ratio_10k_plus FLOAT NOT NULL,  -- 再生増加数1万以上割合
  ratio_100k_plus FLOAT NOT NULL, -- 再生増加数10万以上割合
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- インデックス
  INDEX idx_collection_date (collection_date),
  INDEX idx_genre (genre),
  UNIQUE INDEX unique_date_genre (collection_date, genre)
);

CREATE TABLE scheduler_job_info (
    job_name VARCHAR(255) PRIMARY KEY,
    last_run TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 再生増加数の過去データの追加
CREATE TABLE play_count_history (
    id BIGINT NOT NULL AUTO_INCREMENT,
    video_id VARCHAR(50) NOT NULL,
    video_url VARCHAR(255) NOT NULL,
    collection_date DATE NOT NULL,
    play_count_increase INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, collection_date),
    INDEX idx_video_date (video_id, collection_date),
    UNIQUE INDEX unique_video_date (video_id, collection_date)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_0900_ai_ci
PARTITION BY RANGE (TO_DAYS(collection_date)) (
    PARTITION p_current VALUES LESS THAN (TO_DAYS('2025-05-01')),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

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

-- 動画ブックマークテーブル
CREATE TABLE video_watchlists (
  watchlist_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  url VARCHAR(255) NOT NULL,
  watchlist_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (url) REFERENCES video_master(url) ON DELETE CASCADE,
  UNIQUE KEY unique_user_video (email, url),
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