# x-delete

Playwright を用いて X (旧 Twitter) の Web UI を人間に近い速度で自動操作し、本人アカウントの投稿削除とリポスト取り消しを行う CLI **x-post-wiper** を提供します。API を使わずブラウザ操作のみで進むため、`PLAYWRIGHT_USER_DATA_DIR` に設定したプロフィールを再利用しながら安全側に処理します。

## セットアップ
1. Node.js 18 以上を用意し、リポジトリ直下で依存パッケージと Chromium を導入します。
   ```bash
   npm install
   npx playwright install chromium
   ```
2. `.env` を用意し、Playwright のユーザープロファイル保存先を絶対パスで指定します。
   ```dotenv
   PLAYWRIGHT_USER_DATA_DIR=/Users/you/.cache/pw-x-profile
   ```
3. 初回実行時はブラウザが開いたら手動でログインし、2FA/CAPTCHA を完了させてから Enter を押して続行します。

## 実行方法
- 対象件数の見積もり (投稿は変更しません)
  ```bash
  npm run wipe:dry -- --max=20
  ```
- 実行対象を削除/リポスト解除 (デフォルトは無制限)
  ```bash
  npm run wipe -- --resume --max=200
  ```

`--mode` (dry|auto), `--max=<number>`, `--resume` を組み合わせて制御できます。Dry-run で内容を確認し、問題がなければ `--resume` を付けて本番削除に移る運用を推奨します。処理済みステータス ID は `state/checkpoint.json` に保存され、ログは `logs/x-wiper.log` に追記されます。

## 注意事項
- 対象は **自身の認証済みアカウントのみ**。第三者のアカウントには絶対に使用しないでください。
- X の利用規約・自動化ポリシーを順守し、長時間連続運転や高速連打を避けてください。必要に応じてテスト用アカウントや上限 (`--max`) を活用してください。
- セレクタの変更や CAPTCHA 発生時はログを確認し、ブラウザ上で手動対応後に Enter で再開してください。Dry-run からの段階移行と定期バックアップ取得を習慣化すると安心です。
