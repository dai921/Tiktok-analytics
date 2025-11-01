import os
import json
import time
from typing import List

import pymysql
from google.cloud import pubsub_v1


PROJECT_ID = os.environ.get("PROJECT_ID", "")
TOPIC = os.environ.get("TOPIC", "product-determination")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "1000"))
MAX_SEND = int(os.environ.get("MAX_SEND", "10000"))
SLEEP_SEC = float(os.environ.get("SLEEP_SEC", "0"))


def normalize_hashtags(v: str) -> List[str]:
    if not v:
        return []
    parts = str(v).replace(",", " ").split()
    return [p.lstrip("#").lower() for p in parts if p.strip()]


def get_db_connection():
    return pymysql.connect(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ.get("MYSQL_USER", "tiktok_user"),
        password=os.environ.get("MYSQL_PASSWORD", "tiktok_pass"),
        database=os.environ.get("MYSQL_DATABASE", "tiktok_data"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def main():
    assert PROJECT_ID, "PROJECT_ID environment variable is required"

    batch_settings = pubsub_v1.types.BatchSettings(
        max_bytes=5 * 1024 * 1024,
        max_messages=1000,
        max_latency=0.5,
    )
    publisher = pubsub_v1.PublisherClient(batch_settings=batch_settings)
    topic_path = publisher.topic_path(PROJECT_ID, TOPIC)

    sent = 0
    last_id = 0
    futures: List[pubsub_v1.publisher.futures.Future] = []

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            while sent < MAX_SEND:
                cur.execute(
                    
                    """
                    SELECT id, video_id, url, hashtags
                    FROM video_master
                    WHERE id > %s
                      AND url IS NOT NULL AND video_id IS NOT NULL
                      AND (content_type = 'video' OR content_type IS NULL)
                      AND url LIKE 'https://www.tiktok.com/%'
                    ORDER BY id ASC
                    LIMIT %s
                    """,
                    (last_id, BATCH_SIZE),
                )
                rows = cur.fetchall()
                if not rows:
                    break

                for r in rows:
                    if sent >= MAX_SEND:
                        break
                    url = r.get("url") or ""
                    # 念のためphoto投稿は除外
                    if "photo" in url:
                        last_id = r["id"]
                        continue

                    msg = {
                        "url": url,
                        "video_id": r.get("video_id"),
                        "hashtags": normalize_hashtags(r.get("hashtags")),
                        "user_number": 0,
                    }
                    future = publisher.publish(topic_path, json.dumps(msg).encode("utf-8"))
                    futures.append(future)
                    sent += 1
                    last_id = r["id"]

                    if SLEEP_SEC > 0:
                        time.sleep(SLEEP_SEC)

        # 送信完了待ち
        for f in futures:
            _ = f.result(timeout=30)

        print(f"Published messages: {sent}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()


