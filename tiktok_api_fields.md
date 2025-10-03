# TikTok Display API (v2) — Data Reference (User Info / Video List / Video Query)

> 最終更新: 2025-10-03
> 本書は **Display API**（/v2/user/info, /v2/video/list, /v2/video/query）で取得できるデータ項目を開発者向けに整理したリファレンスです。  
> 認可や利用条件、項目名は将来変更される可能性があります。必ず公式ドキュメントも併読してください。

---

## 0. 概要（Display API）
- 目的: **TikTokクリエイターのプロフィール情報と動画メタデータ**を取得し、あなたのプロダクト上で表示・埋め込みを可能にする読み取り系API群。  
- 構成API: `/v2/user/info/`, `/v2/video/list/`, `/v2/video/query/`  
- 主な用途: プロフィール情報の表示、最近/任意の動画リストの取得、動画のサムネイルや埋め込みプレイヤーの表示など。
- 大前提: **ユニークリーチ、プロフィール訪問数、視聴維持率等の“内部インサイト”は返しません。**

---

## 1. 認可・スコープ
- OAuth2でユーザーから許可を得て**User Access Token**を取得して呼び出します。
- 必要スコープ（プロダクト審査が必要）
  - `user.info.basic`（基本プロフィール）
  - `user.info.profile`（プロフィール詳細: bio, deep link など）
  - `user.info.stats`（フォロワー/総いいね/動画本数）
  - `video.list`（動画の読み取り: list/query 両方で使用）

> 運用Tip: トークンの**自動更新（Refresh Token）**と**12時間程度の定期更新ジョブ**を設け、動画メタデータを同期します。

---

## 2. /v2/user/info — ユーザー情報
- **HTTP**: `GET https://open.tiktokapis.com/v2/user/info/?fields=...`
- **Query**: `fields`（カンマ区切りで必要項目のみ指定）
- **主なフィールド**
  - 識別: `open_id`, `union_id`
  - 表示: `display_name`, `username`, `avatar_url`, `avatar_url_100`, `avatar_large_url`, `is_verified`
  - プロフィール: `bio_description`, `profile_deep_link`
  - 統計: `follower_count`, `following_count`, `likes_count`, `video_count`
- **スコープ**: `user.info.basic`, `user.info.profile`, `user.info.stats`

**サンプル**
```bash
curl -L -X GET 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,follower_count,likes_count,video_count'   -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

---

## 3. /v2/video/list — 動画一覧（新しい順）
- **HTTP**: `POST https://open.tiktokapis.com/v2/video/list/?fields=...`
- **Body**:
  - `cursor` (int64, **ミリ秒のUNIX**。未指定で最新から)
  - `max_count` (int32, 既定10 **最大20**)
- **レスポンス**: `videos`（Video Object配列）, `cursor`, `has_more`
- **用途**: 最新のvideo_idを集める、ページングで遡る。

**サンプル**
```bash
curl -L -X POST 'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url'   -H 'Authorization: Bearer <ACCESS_TOKEN>'   -H 'Content-Type: application/json'   --data-raw '{"max_count":20}'
```

---

## 4. /v2/video/query — 動画詳細（ID指定・最大20件）
- **HTTP**: `POST https://open.tiktokapis.com/v2/video/query/?fields=...`
- **Body**:
  - `filters.video_ids`（最大20件）
- **取得できる代表フィールド（Video Object）**
  - 識別: `id`, `create_time`
  - 表示/埋め込み: `title`, `video_description`, `cover_image_url`, `embed_html`, `embed_link`, `share_url`
  - 仕様: `duration`, `height`, `width`
  - **指標**: `view_count`, `like_count`, `comment_count`, `share_count`
- **注意**: `cover_image_url` は**TTL約6時間**で失効（都度更新または自前キャッシュ）

**サンプル**
```bash
curl -L -X POST 'https://open.tiktokapis.com/v2/video/query/?fields=id,title,view_count,like_count,comment_count,share_count,cover_image_url,embed_link'   -H 'Authorization: Bearer <ACCESS_TOKEN>'   -H 'Content-Type: application/json'   --data-raw '{"filters":{"video_ids":["7077642457847991554","7080217258529737986"]}}'
```

---

## 5. 典型的なデータマッピング（レポート設計向け）
| 目的 | 推奨フィールド/算出 | 由来API |
|---|---|---|
| アカウントの規模感 | `follower_count`, `likes_count`, `video_count` | `/v2/user/info` |
| 投稿の基本情報 | `id`, `create_time`, `title`, `video_description`, `duration`, `cover_image_url`, `embed_link` | `/v2/video.list`→`/v2/video.query` |
| 投稿の反応 | `view_count`, `like_count`, `comment_count`, `share_count` | `/v2/video.query` |
| ER（自算） | `(like_count + comment_count + share_count) / view_count` | 自前計算 |
| 拡散率（自算） | `share_count / view_count` | 自前計算 |

---

## 6. できない/提供外（Display API）
- **ユニークリーチ、インプレッション、視聴維持率（2秒/6秒/完了）、プロフィール訪問/リンククリック**  
- **コメント本文の一覧**（※Research APIにはコメント系が別途あり）
- **プロフィール編集や投稿操作**（＝Content Posting API領域）

---

## 7. 実装のTips
- `fields` は**必要最小限**にして帯域・レイテンシを節約。
- **バッチ処理**: `video/query`は**20件/リクエスト**まで。`video/list`のIDをまとめて照会。
- **時系列化**: `view_count`等は**累積値**。日次差分を保存して「当日増分」を作るとトレンド分析が容易。
- **画像TTL**: `cover_image_url`は**6時間**で失効。PPTやレポート生成時に**直前で取得 or キャッシュ**。

---

## 付録：エラーハンドリングとレート制限
- エラーは `error.code` / `message` を確認。権限不足・スコープ未付与・トークン失効などに留意。
- レート制限は**サーバーAPIのポリシー**に準拠（公式の最新ガイドを参照）。
