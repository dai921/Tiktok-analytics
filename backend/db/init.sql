-- データベース作成
CREATE DATABASE IF NOT EXISTS tiktok_data;
USE tiktok_data;

-- アカウントリストテーブル
CREATE TABLE account_list (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_url VARCHAR(255) UNIQUE,
    account_name VARCHAR(50) NOT NULL,
    is_new_account BOOLEAN,
    latest_video_date DATE,
    needs_update BOOLEAN,
    under_100k_flag VARCHAR(1),
    INDEX idx_account_url (account_url),
    INDEX idx_is_new_account (is_new_account),
    INDEX idx_needs_update (needs_update)
);

-- 動画URLデータテーブル
CREATE TABLE video_url_data (
    id INT AUTO_INCREMENT,
    video_url VARCHAR(255)　SERIAL PRIMARY KEY,
    video_id INT UNSIGNED   ,
    username VARCHAR(50) NOT NULL,
    created_at DATE,
    play_count INT UNSIGNED,
    playCountIncrease INT UNSIGNED,
    is_new_video BOOLEAN DEFAULT TRUE,
    needs_update BOOLEAN DEFAULT TRUE,
    INDEX idx_is_new_video (is_new_video),
    INDEX idx_needs_update (needs_update)
);

-- 動画マスターテーブル
CREATE TABLE video_master (
    id VARCHAR(10) UNIQUE,
    url VARCHAR(255) PRIMARY KEY,
    video_id VARCHAR(50) UNIQUE,
    username VARCHAR(50) NOT NULL,
    cover_image_url VARCHAR(255),
    display_name VARCHAR(50),
    description TEXT,
    likes_count INT UNSIGNED,
    play_count INT UNSIGNED,
    comment_count INT UNSIGNED,
    share_count INT UNSIGNED,
    save_count INT UNSIGNED,
    created_at DATE,
    hashtags TEXT,
    duration INT UNSIGNED,
    isViral BOOLEAN,
    prevFetchDate DATE,
    currentFetchDate DATE,
    prevPlayCount INT UNSIGNED,
    playCountIncrease INT UNSIGNED,
    prevLikesCount INT UNSIGNED,
    likesCountIncrease INT UNSIGNED,
    product VARCHAR(255),
    category VARCHAR(255),
    music_id VARCHAR(50),
    music_title VARCHAR(255),
    music_artist VARCHAR(255),
    INDEX idx_url (url),
    INDEX idx_play_count (play_count),
    INDEX idx_created_at (created_at),
    INDEX idx_playCountIncrease (playCountIncrease),
    INDEX idx_currentFetchDate (currentFetchDate)
);

-- カテゴリーマスターテーブル
CREATE TABLE category_master (
    category_id INT AUTO_INCREMENT,
    category_name VARCHAR(255) NOT NULL UNIQUE
);

-- カテゴリーキーワードテーブル
CREATE TABLE category_keywords (
    keyword_id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES category_master(category_id),
    keyword VARCHAR(255) NOT NULL,
    is_product BOOLEAN DEFAULT,
    INDEX idx_keyword (keyword)
);

-- フロントエンドデータテーブル
CREATE TABLE frontend_data (
    id VARCHAR(10) UNIQUE,
    url VARCHAR(255) PRIMARY KEY,
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

-- ユーザーデータテーブル
CREATE TABLE user_data (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255)
);

-- テストデータの挿入
INSERT INTO account_list 
(account_url, account_name, is_new_account, needs_update, under_100k_flag) 
VALUES 
('https://www.tiktok.com/@test1', 'テストユーザー1', TRUE, TRUE, 'Y'),
('https://www.tiktok.com/@test2', 'テストユーザー2', TRUE, TRUE, 'N');