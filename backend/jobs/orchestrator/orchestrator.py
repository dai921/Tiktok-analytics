import os, json, base64, argparse
from datetime import datetime, timedelta, timezone

# jobs/steps の非Pub/Subステップ群を参照
from backend.jobs.steps.frontend_data_trigger import check_execution_time
from backend.jobs.steps.frontend_data_pipeline import run_frontend_data_pipeline

from backend.jobs.steps.video_history_sync import sync_video_history
from backend.jobs.steps.ten_days_metrics_update import update_ten_days_metrics
from backend.jobs.steps.play_count_correction import correct_play_count_increase
from backend.jobs.steps.summary_table_sync import update_product_daily_summary
from backend.jobs.steps.data_integrity_check import check_data_integrity

# 中間ステップ
from backend.jobs.steps.top100_videos_sync import update_product_top100_videos
from backend.jobs.steps.summary_all_trends import update_all_trends_summary
from backend.jobs.steps.sync_corporate_data import sync_corporate_data
from backend.jobs.steps.followers_update import update_followers
from backend.jobs.steps.update_needs_flags import update_needs_flags
from backend.jobs.steps.sync_second_third_account_type import sync_second_third_account_type

def make_event(payload: dict) -> dict:
    return {"data": base64.b64encode(json.dumps(payload).encode()).decode("utf-8")}

def calc_collection_date() -> str:
    # 既存ロジックに合わせてJST基準-2日
    jst = timezone(timedelta(hours=9))
    return (datetime.now(jst) - timedelta(days=2)).strftime("%Y-%m-%d")

def main(argv=None):
    parser = argparse.ArgumentParser(
        description="frontend_data_update Cloud Run Job オーケストレーター"
    )
    parser.add_argument(
        "--collection-date",
        help="JST基準で処理対象とするcollection_date（YYYY-MM-DD）。未指定時は環境変数COLLECTION_DATEまたは自動計算値を使用。",
    )
    parser.add_argument(
        "--show-collection-date",
        action="store_true",
        help="計算されたcollection_dateを表示するだけで処理を実行しないテストモード。",
    )
    args = parser.parse_args(argv)

    collection_date = (
        args.collection_date
        or os.getenv("COLLECTION_DATE")
        or calc_collection_date()
    )

    if args.show_collection_date:
        print(f"collection_date={collection_date}")
        return

    # 0. 実行間隔チェック（二日/時間制御）
    if not check_execution_time():
        print("実行間隔未到達のためスキップします")
        return

    # 1. frontend系同期処理（単一フローに統合）
    run_frontend_data_pipeline(collection_date)

    # 2. update_needs_flags（各種フラグリセット）
    update_needs_flags()

    # 3. sync_second_third_account_type（second/third 同期）
    sync_second_third_account_type()

    # 5. video_history_sync
    sync_video_history(collection_date)

    # 6. ten_days_metrics_update
    update_ten_days_metrics(collection_date)

    # 7. play_count_correction
    correct_play_count_increase(collection_date)

    # 8. summary_table_sync
    update_product_daily_summary(collection_date)

    # 9. top100_videos_sync（商品/ジャンルTOP100）
    update_product_top100_videos(collection_date)

    # 10. summary_all_trends（ハッシュタグ/BGMサマリとTOP動画）
    update_all_trends_summary(collection_date)

    # 11. sync_corporate_data（企業系TOP100）
    sync_corporate_data(collection_date)

    # 12. followers_update（per-follower指標）
    update_followers(collection_date)

    # 13. data_integrity_check（followers_update後の整合性確認）
    check_data_integrity(collection_date)

if __name__ == "__main__":
    main()
