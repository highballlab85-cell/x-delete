# x-delete

X (旧 Twitter) の公式 API を用いて、本人アカウントのツイート削除とリポスト取り消しを最小限の呼び出し回数で実行する CLI **x-post-wiper** を提供します。タイムラインを最大件数で取得しながら一括処理し、日次・月次の API 予算を `state/usage.json` で追跡します。

## セットアップ
1. Node.js 18 以上を用意し、依存関係をインストールします。
   ```bash
   npm install
   ```
2. `.env` を作成し、OAuth 2.0 (User Context) で取得した Bearer トークンを設定します。
   ```dotenv
   X_API_BEARER_TOKEN=YOUR-OAUTH2-BEARER-TOKEN
   # 任意: 自身のユーザー ID。未指定の場合は GET /users/me で 1 回だけ解決します。
   # X_USER_ID=0000000000000000000
   # 任意: 日次・月次の API 上限。設定しない場合は無制限扱いです。
   # X_API_DAILY_LIMIT=1500
   # X_API_MONTHLY_LIMIT=45000
   ```
3. `logs/` と `state/` は実行時に自動生成されます。既存の `state/checkpoint.json` や `state/usage.json` がある場合はそのまま引き継がれます。

## 実行方法
- 対象件数の見積もり (API 呼び出しのみ)
  ```bash
  npm run wipe:dry -- --max=20
  ```
- 実行対象を削除/リポスト解除
  ```bash
  npm run wipe -- --resume --max=200
  ```

`--mode` (dry|auto), `--max=<number>`, `--resume` を組み合わせて利用します。Dry-run で対象を確認し、`--resume` を付けた `--mode=auto` で本番削除に移行する運用を推奨します。処理済み ID や次ページのカーソルは `state/checkpoint.json` に保存され、API 使用量は `state/usage.json` へ記録されます。

## 仕組み
- `GET /users/:id/tweets` を最大 100 件で取得し、`referenced_tweets` に基づきリポストかどうかを判断します。
- ツイート削除は `DELETE /2/tweets/:id`、リポスト解除は `DELETE /2/users/:id/retweets/:source_tweet_id` を使用します。
- 呼び出しごとに `UsageTracker` が日次・月次の残量を検証し、上限到達時は安全に停止します。
- 途中停止しても `--resume` で同じページを再取得し、処理済み ID をスキップするため余計な API 呼び出しを抑えます。

## 注意事項
- 対象は **自身の認証済みアカウントのみ**。第三者を対象にすることは絶対に避けてください。
- X API のレートリミットと開発者規約を順守し、上限 (`--max` や `.env` の制限値) を活用して無理のない運用を行ってください。
- 予期せぬエラーが発生した場合は `logs/x-wiper.log` を確認し、必要なら `state/checkpoint.json` のバックアップを取ったうえで再実行してください。
