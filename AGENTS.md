# Repository Guidelines

## Project Structure & Module Organization
Source lives under `src/`. `main.ts` は CLI オプションを解釈し、X API クライアントと使用量トラッカーを連携させて削除ループを制御します。`x-api.ts` には API 呼び出しラッパー、`usage-tracker.ts` には日次/月次カウンタ管理、`logger.ts` には Pino ログ設定を配置します。状態は `state/checkpoint.json` と `state/usage.json` に保存し、実行ログやメモは `logs/` にまとめます。`.env.sample` は認証トークンやレート上限のサンプル値を提供し、オンボーディング資料は `README.md` に集約します。

## Build, Test, and Development Commands
Run `npm install` once to install dependencies. Use `npm run wipe:dry` (alias for `ts-node src/main.ts --mode=dry`) to simulate API 対象を確認します。`npm run wipe` で実削除を行い、`--max=20 --resume` などのフラグで段階的に検証してください。型安全性を確認する際は `npx tsc --noEmit` を実行します。

## Coding Style & Naming Conventions
Stick to TypeScript strict mode with 2-space indentation and single quotes. Export typed helpers rather than loose objects, using descriptive async names such as `deleteTweet` や `undoRetweet`. 単一責務を徹底し、ファイル名は機能内容 (`x-api.ts`, `usage-tracker.ts` など) に合わせます。

## Testing Guidelines
Prefer deterministic helper coverage。API 呼び出しロジックを追加する場合はモックベースのテストを `tests/` に配置し、戻り値やレート制御の境界条件を確認してください。常に `npm run wipe:dry` で対象と使用量を可視化してから `npm run wipe` を実行します。挙動の差異は `logs/x-wiper.log` に記録します。

## Commit & Pull Request Guidelines
Write commits in present-tense imperative, grouping related code, docs, and configs together. PRs should explain motivation, list manual validation commands, attach dry-run and live console snippets, and link to issues. Call out residual risks—selector fallbacks, rate limits, or manual intervention steps—so operators can respond quickly.

## Security & Configuration Tips
Never target accounts other than the authenticated owner. `.env` には `X_API_BEARER_TOKEN` と任意の `X_USER_ID`、運用に合わせた API 制限値を設定し、実際の資格情報をリポジトリへコミットしないでください。`state/usage.json` で日次・月次の残量を監視し、レートリミットを検出した場合は手動対応手順と再開条件をログへ残します。

## Agent Communication Notes
チーム内のエージェントは常に日本語で回答し、オペレーターが状況を即座に理解できるよう簡潔かつ具体的に説明してください。
