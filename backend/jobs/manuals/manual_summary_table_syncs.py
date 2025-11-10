import os
import sys
import json
import logging
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional


def _ensure_import_paths() -> None:
    """
    モジュール解決のために sys.path にリポジトリルートと backend/jobs を追加
    - summary_table_sync は 'backend.jobs...' で import
    - db_utils は 'core.config' を参照（backend/jobs をパスに追加する必要あり）
    """
    current = Path(__file__).resolve()
    repo_root = current.parents[3]  # .../Tiktok-analytics
    jobs_dir = current.parents[2]   # .../backend/jobs
    for p in (str(repo_root), str(jobs_dir)):
        if p not in sys.path:
            sys.path.insert(0, p)


def _validate_date(value: str) -> str:
    """YYYY-MM-DD 形式を検証"""
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return value
    except ValueError as e:
        raise argparse.ArgumentTypeError("collection_date は YYYY-MM-DD 形式で指定してください") from e


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="summary_table_sync を手動実行するスクリプト（商品・ジャンル日次集計）"
    )
    parser.add_argument(
        "-d",
        "--collection-date",
        dest="collection_date",
        type=_validate_date,
        required=False,
        help="収集日 (YYYY-MM-DD)。未指定時はバッチのデフォルト計算に従う",
    )
    parser.add_argument(
        "-e",
        "--environment",
        dest="environment",
        choices=["development", "production"],
        required=False,
        help="ENVIRONMENT を明示設定（未指定時は既存環境変数、無ければ 'development'）",
    )
    return parser.parse_args()


def run(collection_date: Optional[str]) -> int:
    """summary_table_sync の実行をラップ"""
    logging.basicConfig(level=logging.INFO)
    from backend.jobs.steps.summary_table_sync import update_product_daily_summary

    try:
        result = update_product_daily_summary(collection_date)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("status") == "success" else 1
    except Exception as e:
        logging.exception("manual_summary_table_sync 実行エラー: %s", e)
        return 1


if __name__ == "__main__":
    args = _parse_args()

    # ENVIRONMENT の初期化（summary_table_sync import 前に設定必須）
    env = args.environment or os.getenv("ENVIRONMENT") or "development"
    os.environ["ENVIRONMENT"] = env

    _ensure_import_paths()

    sys.exit(run(args.collection_date))

