from video_collector import VideoCollector
import json
import os

def check_collector():
    # VideoCollectorのインスタンスを作成
    collector = VideoCollector(batch_size=10)  # テスト用に少ない件数で
    
    try:
        # データを取得
        videos = collector.get_videos_to_update()
        
        # 結果を表示
        print(f"\n取得した動画数: {len(videos)}\n")
        print("取得したデータ:")
        for video in videos:
            print("\n-----------------------------------")
            print(json.dumps(video, indent=2, ensure_ascii=False))
            
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}")
    finally:
        # 明示的にデータベース接続をクローズ
        if hasattr(collector, 'cursor') and collector.cursor:
            collector.cursor.close()
        if hasattr(collector, 'connection') and collector.connection:
            collector.connection.close()

if __name__ == "__main__":
    # 環境変数の設定
    os.environ['PUBSUB_EMULATOR_HOST'] = 'localhost:8681'
    check_collector() 