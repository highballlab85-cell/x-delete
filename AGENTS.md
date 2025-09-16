# Repository Guidelines

## Project Structure & Module Organization
Source lives under `src/`. `main.ts` wires CLI options, launches the Chromium session, and controls the processing loop. Shared helpers sit beside it: `selectors.ts` holds ordered locator arrays, `x-actions.ts` implements tweet/repost handlers, `scroll.ts` manages card discovery, and `logger.ts` configures Pino logging. State persistence belongs in `state/checkpoint.json`; runtime logs and manual notes go under `logs/`. Keep configuration scaffolding in `.env.sample` and onboarding docs in `README.md`.

## Build, Test, and Development Commands
Run `npm install` once, then `npx playwright install chromium` to fetch the browser binary. Use `npm run wipe:dry` (alias for `ts-node src/main.ts --mode=dry`) to simulate deletions safely. Execute `npm run wipe` for live runs; add flags like `--max=20 --resume` during manual verification. For type-safety regressions, run `npx tsc --noEmit` before opening a PR.

## Coding Style & Naming Conventions
Stick to TypeScript strict mode with 2-space indentation and single quotes. Export typed helpers rather than loose objects, using descriptive async names such as `undoRepost` or `deleteOriginal`. When selectors need fallbacks, express them as ordered arrays that show priority explicitly. Keep modules focused on a single responsibility and name files after the feature they wrap (e.g., `x-actions.ts`).

## Testing Guidelines
Prefer deterministic helper coverage; add Playwright component tests for any new selectors under `tests/` mirroring `src/`. Always run `npm run wipe:dry` in staging before `npm run wipe` to catch locator drift. Record manual observations in `logs/x-wiper.log` whenever behaviour diverges from expectations.

## Commit & Pull Request Guidelines
Write commits in present-tense imperative, grouping related code, docs, and configs together. PRs should explain motivation, list manual validation commands, attach dry-run and live console snippets, and link to issues. Call out residual risks—selector fallbacks, rate limits, or manual intervention steps—so operators can respond quickly.

## Security & Configuration Tips
Never target accounts other than the authenticated owner. Ensure `.env` defines `PLAYWRIGHT_USER_DATA_DIR` as an absolute path and avoid storing real credentials in the repo. The CLI must run headful, introduce random waits between 0.8–1.6s, and pause for 2FA or CAPTCHA challenges; document mitigations for any anomalies.

## Agent Communication Notes
チーム内のエージェントは常に日本語で回答し、オペレーターが状況を即座に理解できるよう簡潔かつ具体的に説明してください。
