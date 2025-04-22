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

CREATE TABLE product_master (
  product_id   INT          NOT NULL AUTO_INCREMENT,
  product_name VARCHAR(255) NOT NULL,
  product_category VARCHAR(255) NOT NULL,
  PRIMARY KEY (product_id),
  UNIQUE KEY product_name (product_name)  -- 同名商品の重複を防止
  KEY idx_product_category (product_category)
) ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE      = utf8mb4_0900_ai_ci;

/* ------------ 2. 商品キーワード（動画タイトル中の別名・略称など） ------------ */
CREATE TABLE product_keywords (
  keyword_id INT          NOT NULL AUTO_INCREMENT,
  product_id INT          NOT NULL,
  keyword    VARCHAR(255) NOT NULL,
  PRIMARY KEY (keyword_id),
  UNIQUE KEY keyword_id (keyword_id),
  KEY        idx_keyword (keyword),
  CONSTRAINT fk_pk_product
            FOREIGN KEY (product_id)
            REFERENCES product_master(product_id)
            ON UPDATE CASCADE
            ON DELETE CASCADE
) ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE      = utf8mb4_0900_ai_ci;

CREATE TABLE product_alias (
  alias_id            INT          NOT NULL AUTO_INCREMENT,
  alias_name          VARCHAR(255) NOT NULL, 
  alias_priority      TINYINT DEFAULT NULL,
  product_name        VARCHAR(255) NOT NULL,     -- 正規名の product_id
  PRIMARY KEY (alias_id),
  UNIQUE KEY alias_name_uq (alias_name),          -- 同じ別名は 1 回だけ
  CONSTRAINT fk_alias_product
    FOREIGN KEY (product_name)
    REFERENCES product_master(product_name)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

/* ---------- 2. 別名キーワード ---------- */
CREATE TABLE product_alias_keywords (
  keyword_id INT          NOT NULL AUTO_INCREMENT,
  alias_id   INT          NOT NULL,
  keyword    VARCHAR(255) NOT NULL,
  PRIMARY KEY (keyword_id),
  UNIQUE KEY keyword_id (keyword_id),
  KEY idx_keyword (keyword),
  CONSTRAINT fk_alias_kw
    FOREIGN KEY (alias_id)
    REFERENCES product_alias(alias_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;