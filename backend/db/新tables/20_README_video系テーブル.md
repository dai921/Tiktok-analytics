# 09_11_videos系テーブルの大きな変更
!TODO この通りに実装を変更しよう
## 新システム
### 各テーブルの役割
1. `videos`
   - 動画のURLや説明文など、動画の情報のうち不変なものを保存するテーブル。
   - 旧`video_url_data`に近い。
   - `description`と`hashtags`と`cover_image_url`も投稿後に変更される可能性があるが`videos`テーブルに残す。
     - 1日1回制限があるし、その変化を見たい需要もないので。
     - 最新のものだけ保存するように。
2. `video_metrics`
   - 動画の時系列メトリクスを保存するテーブル。
   - 旧`play_count_history`に近い。
必ずこれらは正規テーブルであるように務める。
フロントエンドの検索用に非正規テーブルが必要になったら、別のテーブルを作成する。

### 統計処理プロセス
#### 論理
- `videos`は常に最新の情報。(したがって変化しうる属性`description`, `hashtags`, `cover_image_url`を毎回更新しなければならない)
- `video_metrics`の各レコードは、`fetch_date`の23:59時点のデータと考える。
  - 実際に`fetch_date`の23:59にクロールして取得したデータである必要はない。
  - 例えば、日本のコンテンツが最も静まる時間帯である23〜翌7時にクロールするアルゴリズムなら、`2025/05/22 23:13:20`にクロールしたものも`2025/05/23 04:53:17`にクロールしたものも `fetch_date = 2025/05/22`として記録する。
- 各動画に対し1つだけ、`video_metrics`に番兵レコードを保存する。
  - その番兵レコードは、`fetch_date`の40日分を保存する。

#### プロセス
クロールで取得した動画の生データ`raw_data`に対し以下の擬似コードのように行う。
```python
# official_idを取得
official_id = raw_data["official_id"]
v = (videosから(x["official_id"] == official_id)を満たすレコードxを取得)

# 新着動画かを確認
新着動画フラグ = v is None

# 新着動画ならvideosに新規レコードを挿入、そうでなければ更新
if 新着動画フラグ:
  v = {
    "official_id": official_id
    "tiktok_account_id": tiktok_account_id,
    "url": raw_data["url"],
    "description": raw_data["description"],
    ...
  }
  videos.append(v)
  v_id = v["id"]
else:
  v_id = v["id"]
  v["description"] = raw_data["description"]
  v["hashtags"] = raw_data["hashtags"]
  v["cover_image_url"] = raw_data["cover_image_url"]
  videos[v_id] = v

fetch_date = raw_data["fetch_date"]

# 新着動画ならvideo_metricsに番兵レコードを挿入
if 新着動画フラグ:
  昔から存在していたフラグ = raw_data["posted_at"] <= fetch_date - クロール頻度
  if 昔から存在していたフラグ:
    sentinel_m = {
      "video_id": v_id,
      "fetch_date": fetch_date - timedelta(days=40), # 40にすると、今後拡張するときincrease_40dまでは問題ない。
      "plays_count": raw_data["plays_count"],
      "likes_count": raw_data["likes_count"],
      "comments_count": raw_data["comments_count"],
      "shares_count": raw_data["shares_count"],
      "saves_count": raw_data["saves_count"],
      "plays_increase_2d": 0,
      "likes_increase_2d": 0,
      "comments_increase_2d": 0,
      "shares_increase_2d": 0,
      "saves_increase_2d": 0,
      "plays_increase_10d": 0,
      "likes_increase_10d": 0,
      "comments_increase_10d": 0,
      "shares_increase_10d": 0,
      "saves_increase_10d": 0,
    }
  else:
    sentinel_m = {
      "video_id": v_id,
      "fetch_date": fetch_date - timedelta(days=40), # 40にすると、今後拡張するときincrease_40dまでは問題ない。
      "plays_count": 0,
      "likes_count": 0,
      "comments_count": 0,
      "shares_count": 0,
      "saves_count": 0,
      "plays_increase_2d": 0,
      "likes_increase_2d": 0,
      "comments_increase_2d": 0,
      "shares_increase_2d": 0,
      "saves_increase_2d": 0,
      "plays_increase_10d": 0,
      "likes_increase_10d": 0,
      "comments_increase_10d": 0,
      "shares_increase_10d": 0,
      "saves_increase_10d": 0,
    }
  video_metrics.append(sentinel_m)

# video_metricsに挿入する新規レコードを準備
m = {
  "video_id": v_id,
  "fetch_date": fetch_date,
  "plays_count": raw_data["plays_count"],
  "likes_count": raw_data["likes_count"],
  "comments_count": raw_data["comments_count"],
  "shares_count": raw_data["shares_count"],
  "saves_count": raw_data["saves_count"],
}

m_2d_ago = (video_metricsから(x["video_id"] == v_id and x["fetch_date"] <= fetch_date - timedelta(days=2))を満たす最新の行xを取得) # 番兵のおかげでここがNoneにならない

m["plays_increase_2d"] = m["plays_count"] - m_2d_ago["plays_count"]
m["likes_increase_2d"] = m["likes_count"] - m_2d_ago["likes_count"]
m["comments_increase_2d"] = m["comments_count"] - m_2d_ago["comments_count"]
m["shares_increase_2d"] = m["shares_count"] - m_2d_ago["shares_count"]
m["saves_increase_2d"] = m["saves_count"] - m_2d_ago["saves_count"]

m_10d_ago = (video_metricsから(x["video_id"] == v_id and x["fetch_date"] <= fetch_date - timedelta(days=10))を満たす最新の行xを取得) # 番兵のおかげでここがNoneにならない

m["plays_increase_10d"] = m["plays_count"] - m_10d_ago["plays_count"]
m["likes_increase_10d"] = m["likes_count"] - m_10d_ago["likes_count"]
m["comments_increase_10d"] = m["comments_count"] - m_10d_ago["comments_count"]
m["shares_increase_10d"] = m["shares_count"] - m_10d_ago["shares_count"]
m["saves_increase_10d"] = m["saves_count"] - m_10d_ago["saves_count"]

# video_metricsに新規レコードを挿入
video_metrics.append(m)

```


## 新旧比較
### テーブル名
意図した役割としてはこう。
- 旧 `video_url_data` -> 新 `videos`
- 旧 `play_count_history` -> 新 `video_metrics`
だが旧システムは正規化すらされておらず、役割を全うした実装になっていないので、移動するカラムが非常に多い。マイグレーションにおいて非常に気を配る必要がある。

### カラム名
- `prevFetchDate`や`prevCountIncrease`など、クロール頻度と統計的意味の分離ができていない汚らしい列を削除もしくは改名
- 改名後は`plays_increase_2d`など、クロール頻度に依存しない明確な意味を持ったカラム名。
- たぶん`is_new`列も新ロジックを使えば不要になる。その場合消してね

### 注意
- このテーブルで十分間に合う役割を、非正規テーブルにやらせているプログラムがいくつかあるように見える。