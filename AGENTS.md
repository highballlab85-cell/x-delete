# Repository Guidelines

## Project Structure & Module Organization
Keep the CLI focused on `src/`, where `main.ts` wires options, browser startup, and the processing loop. Shared utilities live beside it: `selectors.ts` for resilient locator lists, `x-actions.ts` for tweet/repost handlers, `scroll.ts` for card discovery, and `logger.ts` for pino setup. Persist execution data in `state/checkpoint.json` and store run artefacts under `logs/`. Configuration stubs belong in `.env.sample`, while documentation and onboarding live in `README.md`.

## Build, Test, and Development Commands
Run `npm install` once, then `npx playwright install chromium` to fetch the browser bundle. Use `npm run wipe:dry` (`ts-node src/main.ts --mode=dry`) to estimate targets without touching posts, and `npm run wipe` for live execution. Append `--max=20 --resume` during manual verification. For type safety while iterating, execute `npx tsc --noEmit` before opening a PR.

## Coding Style & Naming Conventions
Follow TypeScript strict mode with 2-space indentation and single quotes. Name modules after the feature they encapsulate (e.g., `x-actions.ts`), and export typed helpers rather than loose objects. Prefer descriptive async function names such as `undoRepost` or `deleteOriginal`, and document public helpers with concise JSDoc. When selectors require fallbacks, store them as ordered arrays to make intent explicit.

## Testing Guidelines
Unit coverage is limited today; rely on deterministic helpers. Add Playwright component tests for any new DOM locators, and keep fixtures under `tests/` mirroring the `src/` layout. Always run `npm run wipe:dry` before `npm run wipe` in staging accounts to validate selector drift, and capture manual notes in `logs/x-wiper.log` if behaviour differs from expectations.

## Commit & Pull Request Guidelines
Write commits in present-tense imperative (e.g., `Implement checkpoint resume flag`). Group related changes—code, docs, and configs—in one commit when they share context. Pull requests should explain motivation, outline manual test commands, and link to relevant issues or tasks. Attach console excerpts for dry-run and auto modes, and note any outstanding risks such as selector fallbacks or rate-limit mitigation steps.

## Operational & Security Notes
Never target accounts other than the authenticated owner. Ensure `.env` defines `PLAYWRIGHT_USER_DATA_DIR` with an absolute path; avoid committing real credentials. The CLI must run headful, include random waits of 0.8–1.6s, and prompt for human intervention on 2FA/CAPTCHA screens. Record anomalies and mitigation steps in the PR description for future operators.
