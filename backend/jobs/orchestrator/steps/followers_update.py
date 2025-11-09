import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from backend.jobs.core.db_utils import execute_write_query
from backend.jobs.core.config import initialize_config

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

def update_followers(collection_date: Optional[str] = None) -> Dict[str, Any]:
    """
    frontend系テーブルのfollower / per-follower指標を更新（非Pub/Sub）
    """
    logger.info("==== frontend_per_follower_update 開始 ====")
    try:
        if collection_date is None:
            # デフォルト: JSTで昨日
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

        return {
            "status": "success",
            "updated": total_updated,
            "collection_date": collection_date,
            "time": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.exception(f"frontend_per_follower_update エラー: {e}")
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
