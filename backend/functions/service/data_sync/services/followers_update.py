import os
import json
import logging
import base64
from datetime import datetime, timedelta

from core.db_utils import execute_write_query
from core.config import initialize_config
from core.pubsub_utils import publish_message

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

initialize_config()

def _update_table(table_name: str, collection_date: str, parent_account_type: str | None = None) -> int:
    """
    frontend系テーブルに対し、followerとper-follower指標を更新する
    - followerはaccount_follower_historyのfollower_count
    - play_count_per_follower = play_count / max(follower, 1000)
    - play_increase_per_follower = play_count_increase / max(follower, 1000)
    """
    where_parent = " AND f.parent_account_type = %s" if parent_account_type else ""
    params: list = [collection_date] + ([parent_account_type] if parent_account_type else [])

    # 注意: 旧docsでは列名がfollower/ play_count_per_follower / play_increase_per_follower と記載
    # 実DBに合わせて必要なら列名を調整してください
    query = f"""
    UPDATE {table_name} f
    INNER JOIN account_list al
        ON al.favorite_user_username = f.account_name
    INNER JOIN account_follower_history afh
        ON afh.account_id = al.id
       AND afh.collection_date = %s
    SET
        f.followers = afh.follower_count,
        f.play_count_per_follower =
            ROUND(
                CASE
                    WHEN GREATEST(afh.follower_count, 1000) > 0
                        THEN f.play_count / GREATEST(afh.follower_count, 1000)
                    ELSE NULL
                END, 3
            ),
        f.play_increase_per_follower =
            ROUND(
                CASE
                    WHEN GREATEST(afh.follower_count, 1000) > 0
                        THEN COALESCE(f.play_count_increase, 0) / GREATEST(afh.follower_count, 1000)
                    ELSE NULL
                END, 3
            )
    WHERE 1=1
    {where_parent}
    """
    return execute_write_query(query, params)

def update_followers(event, context):
    """
    sync_corporate_dataの後に実行され、frontend_data系テーブルへ
    follower/ per-follower指標を更新し、完了後にdata_integrity_checkへPublishする
    """
    logger.info("==== frontend_per_follower_update 開始 ====")
    try:
        if "data" not in event:
            raise ValueError("No data in Pub/Sub message")

        message = json.loads(base64.b64decode(event["data"]).decode("utf-8"))
        logger.info(f"受信メッセージ: {message}")

        if message.get("status") != "success" or message.get("previous_step") != "sync_corporate_data":
            logger.info("前段の成功が確認できないためスキップ")
            return {"status": "skipped", "reason": "Previous step not successful"}

        collection_date: str | None = message.get("collection_date")
        if not collection_date:
            # フォールバック: JSTで昨日
            collection_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            logger.info(f"collection_date未指定のためフォールバック: {collection_date}")


        total_updated = 0
        # 全体テーブル
        try:
            total_updated += _update_table("frontend_data", collection_date)
            logger.info(f"frontend_data 更新件数: {total_updated}")
        except Exception as e:
            logger.warning(f"frontend_data更新で例外: {e}")

        # 親タイプ別テーブル
        for table_name, pat in [
            ("frontend_affiliate_data", "アフィ"),
            ("frontend_corporate_data", "企業アカウント"),
            ("frontend_influencer_data", "インフルエンサー"),
        ]:
            try:
                affected = _update_table(table_name, collection_date, pat)
                total_updated += affected
                logger.info(f"{table_name} 更新件数: {affected}")
            except Exception as e:
                logger.warning(f"{table_name}更新で例外: {e}")

        # 次の処理にPublish（整合性チェック）
        publish_message("data-integrity-check", {
            "status": "success",
            "collection_date": collection_date,
            "execution_time": datetime.now().isoformat(),
            "previous_step": "frontend_per_follower_update",
            "message": "per-follower指標の更新が完了しました。整合性チェックへ進みます。"
        })

        return {
            "status": "success",
            "updated": total_updated,
            "collection_date": collection_date,
            "time": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.exception(f"frontend_per_follower_update エラー: {e}")
        # 失敗も後段に通知（ステータス: error）
        try:
            publish_message("data-integrity-check", {
                "status": "error",
                "collection_date": message.get("collection_date") if 'message' in locals() else None,
                "execution_time": datetime.now().isoformat(),
                "previous_step": "frontend_per_follower_update",
                "error": str(e)
            })
        except Exception:
            pass
        return {"status": "error", "error": str(e)}

if __name__ == "__main__":
    import sys
    from datetime import datetime, timedelta
    
    # 引数から日付を取得（デフォルトは2025-08-25）
    collection_date = sys.argv[1] if len(sys.argv) > 1 else "2025-08-25"
    
    print(f"=== followers_update ローカル実行（直接実行） ===")
    print(f"対象日付: {collection_date}")
    print(f"実行時刻: {datetime.now()}")
    print()
    
    try:
        total_updated = 0
        
        # 全体テーブル
        try:
            affected = _update_table("frontend_data", collection_date)
            total_updated += affected
            print(f"frontend_data 更新件数: {affected}")
        except Exception as e:
            print(f"⚠️  frontend_data更新で例外: {e}")

        # 親タイプ別テーブル
        for table_name, pat in [
            ("frontend_affiliate_data", "アフィ"),
            ("frontend_corporate_data", "企業アカウント"),
            ("frontend_influencer_data", "インフルエンサー"),
        ]:
            try:
                affected = _update_table(table_name, collection_date, pat)
                total_updated += affected
                print(f"{table_name} 更新件数: {affected}")
            except Exception as e:
                print(f"⚠️  {table_name}更新で例外: {e}")

        print()
        print(f"✅ 完了: 合計 {total_updated} 件更新")
        print("📤 次段階への送信はスキップ（ローカル実行のため）")
        
    except Exception as e:
        print(f"❌ エラーが発生しました: {e}")
        import traceback
        traceback.print_exc()
