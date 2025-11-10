# このファイルは当ブランチでどのようなタスクを行うか明示的にしたものであり、主にcodexが参照することを目的とする。

## プロジェクト概要
- フロントエンド向けデータ更新処理（frontend_data_update）をCloud FunctionsからCloud Run Jobへ移行し、データ同期パイプラインを統合・効率化する。

## ゴール
- backend/functions/service/frontend_data_updateディレクトリ配下の一連の処理（frontend_data_update.py ~ data_integrity_check.py）をCloud Run Jobとして再実装し、Pub/Sub非依存の単一オーケストレーター形式で実行できるようにする。

## 現状
- コードの移行はbackend/jobsディレクトリ配下で進行中。
- Pub/Sub処理を削除し、orchestrator.pyで各ステップを順次実行する形式に統合済み。
- frontend_data_trigger.pyで実行時刻制御、各ステップはorchestrator.pyから順次呼び出される構造となった。

## 完了タスク
1. ✅ backend/functions/service/frontend_data_updateからbackend/jobsへのコード移行。
2. ✅ Pub/Sub処理を削除し、orchestrator.pyでステップを順次実行する形式に統一。
3. ✅ orchestrator.py内でcalc_collection_date()を定義し、環境変数またはデフォルト日付計算でcollection_dateを決定する仕組みを実装。

## 残タスク（優先度順）
1. **frontend系4ステップの統合**  
   現在、`jobs/steps`配下に以下の4ファイルが存在し、orchestrator.pyから順次呼び出している：
   - frontend_data_update.py
   - frontend_affiliate_data_update.py
   - frontend_corporate_data_update.py
   - frontend_influencer_data_update.py
   
   これらを統合し、単一の関数または処理フローで完結させる（バッチ分割の必要性を再評価し、可能であれば1ファイルに集約）。

2. **collection_dateの明示的な引数渡し**  
   orchestrator.pyでは`sync_video_history(collection_date)`以降はcollection_dateを引数で渡しているが、frontend系4ステップには渡していない。  
   各ステップがorchestrator.pyから明示的にcollection_dateを受け取るよう統一し、内部でのデフォルト日付計算依存を排除する。

3. **旧Cloud Functions処理の削除**  
   Cloud Run Job移行後、backend/functions/service/frontend_data_update配下の旧コードは不要となるため削除する。

4. **エラーハンドリングとロギングの強化**  
   Cloud Run Job環境でのリトライ戦略、ログ出力、失敗時のアラート設定を整備する。

## 次アクション
- frontend_data_update.py, frontend_affiliate_data_update.py, frontend_corporate_data_update.py, frontend_influencer_data_update.pyのロジックを精査し、統合可能な部分を抽出して単一処理に集約する。
- orchestrator.py内で全ステップ関数にcollection_dateを明示的に渡すよう修正する。

## データ同期フロー（Cloud Run Job移行後）
1. Cloud SchedulerからCloud Run Jobをトリガーし、orchestrator.pyのmain()が実行される。
2. orchestrator.pyは環境変数COLLECTION_DATEまたはデフォルト計算（JST-2日）でcollection_dateを決定。
3. frontend_data_trigger.pyで実行間隔チェックを行い、条件を満たした場合のみ後続ステップを実行。
4. frontend系データ更新（統合後の単一処理）を実行し、master → frontendテーブルへのデータ同期を完了。
5. video_history_sync → ten_days_metrics_update → play_count_correction → summary_table_sync → top100_videos_sync → summary_all_trends → sync_corporate_data → followers_update → data_integrity_checkを順次実行し、各ステップにcollection_dateを明示的に渡す。
6. 全ステップ完了後、orchestrator.pyが正常終了し、Cloud Run Jobが完了する。