import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type ElementHandle, type Page } from 'playwright';
import { logger } from './logger.js';
import { randomWait, sleep } from './utils.js';
import { SEL, selectorList } from './selectors.js';
import { autoScrollAndCollect } from './scroll.js';
import { deleteOriginal, undoRepost } from './x-actions.js';

interface CliOptions {
  mode: 'dry' | 'auto';
  max?: number;
  resume: boolean;
}

interface CheckpointData {
  processed: string[];
}

interface RunStats {
  processed: number;
  deleted: number;
  unreposted: number;
  skipped: number;
  errors: number;
  retries: number;
}

const CHECKPOINT_PATH = join(process.cwd(), 'state', 'checkpoint.json');

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { mode: 'dry', resume: false };

  for (const arg of argv) {
    if (arg.startsWith('--mode=')) {
      const mode = arg.split('=')[1];
      if (mode === 'dry' || mode === 'auto') {
        options.mode = mode;
      } else {
        throw new Error(`--mode は dry か auto を指定してください: ${mode}`);
      }
    } else if (arg.startsWith('--max=')) {
      const value = Number.parseInt(arg.split('=')[1], 10);
      if (Number.isNaN(value) || value <= 0) {
        throw new Error('--max には 1 以上の整数を指定してください');
      }
      options.max = value;
    } else if (arg === '--resume') {
      options.resume = true;
    }
  }

  return options;
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function loadCheckpoint(resume: boolean): Set<string> {
  if (!resume || !existsSync(CHECKPOINT_PATH)) {
    return new Set();
  }

  try {
    const data = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8')) as CheckpointData;
    return new Set(data.processed ?? []);
  } catch (error) {
    logger.warn({ error }, 'チェックポイントの読み込みに失敗しました。新規に作成します');
    return new Set();
  }
}

function saveCheckpoint(processed: Set<string>) {
  const payload: CheckpointData = { processed: Array.from(processed) };
  ensureDir(join(process.cwd(), 'state'));
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(payload, null, 2));
}

async function promptEnter(message: string) {
  const rl = createInterface({ input, output });
  await rl.question(`${message} Enter を押すと続行します。`);
  rl.close();
}

/**
 * プロフィールリンクが確認できるまでログイン状態を整える。
 */
async function ensureLogin(page: Page) {
  const selectors = selectorList(SEL.PROFILE_LINK);

  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      return;
    } catch (error) {
      logger.debug({ selector, error }, 'プロフィールリンク待機失敗');
    }
  }

  logger.info('ログインが必要です。ブラウザでログインしてください');
  await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded' });
  await promptEnter('X にログインし、2FA や CAPTCHA を完了してください。準備ができたら');

  for (const selector of selectors) {
    await page.waitForSelector(selector, { timeout: 0 });
  }
}

/**
 * 左ナビのプロフィールリンクをクリックして本人プロフィールへ遷移する。
 */
async function navigateToProfile(page: Page) {
  for (const selector of selectorList(SEL.PROFILE_LINK)) {
    const link = await page.$(selector);
    if (link) {
      await link.click();
      await page.waitForLoadState('domcontentloaded');
      return;
    }
  }
  throw new Error('プロフィールリンクにアクセスできません');
}

/**
 * 投稿カードから status ID を抽出する。
 * 戻り値が null の場合は後続処理でスキップする。
 */
async function extractStatusId(card: ElementHandle<HTMLElement>): Promise<string | null> {
  try {
    const result = await card.evaluate((node) => {
      const anchor = node.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
      const href = anchor?.getAttribute('href') ?? anchor?.href ?? '';
      const match = href.match(/status\/(\d+)/);
      if (match) {
        return match[1];
      }
      return href || null;
    });
    return result;
  } catch (error) {
    logger.warn({ error }, 'status ID の取得に失敗しました');
    return null;
  }
}

async function hasUndoButton(card: ElementHandle<HTMLElement>): Promise<boolean> {
  for (const selector of selectorList(SEL.UNRETWEET)) {
    const handle = await card.$(selector);
    if (handle) {
      await handle.dispose();
      return true;
    }
  }
  return false;
}

/**
 * 1 カード分の削除とリポスト取り消しのフローを実行する。
 * 結果に応じて統計とチェックポイントを更新する。
 */
async function processCard(
  card: ElementHandle<HTMLElement>,
  page: Page,
  options: CliOptions,
  processedSet: Set<string>,
  stats: RunStats
) {
  const statusId = await extractStatusId(card);
  if (!statusId) {
    logger.warn('ステータス ID を特定できなかったためスキップします');
    stats.skipped += 1;
    stats.processed += 1;
    return;
  }

  if (processedSet.has(statusId)) {
    logger.debug({ statusId }, 'チェックポイント済みのためスキップ');
    stats.skipped += 1;
    stats.processed += 1;
    return;
  }

  const isRepost = await hasUndoButton(card);

  if (options.mode === 'dry') {
    logger.info({ statusId, type: isRepost ? 'リポスト取消対象' : '削除対象' }, 'Dry-run: 対象を検出');
    stats.processed += 1;
    if (isRepost) {
      stats.unreposted += 1;
    } else {
      stats.deleted += 1;
    }
    return;
  }

  let outcome: 'deleted' | 'skipped' | 'error' | 'unreposted';
  if (isRepost) {
    outcome = await undoRepost(card, page);
  } else {
    const result = await deleteOriginal(card, page);
    outcome = result;
  }

  stats.processed += 1;

  if (outcome === 'deleted') {
    stats.deleted += 1;
    processedSet.add(statusId);
    saveCheckpoint(processedSet);
    logger.info({ statusId }, '投稿を削除しました');
  } else if (outcome === 'unreposted') {
    stats.unreposted += 1;
    processedSet.add(statusId);
    saveCheckpoint(processedSet);
    logger.info({ statusId }, 'リポストを取り消しました');
  } else if (outcome === 'skipped') {
    stats.skipped += 1;
    processedSet.add(statusId);
    saveCheckpoint(processedSet);
    logger.info({ statusId }, '対象をスキップしました');
  } else {
    stats.errors += 1;
    logger.error({ statusId }, '処理に失敗しました。後で再試行してください');
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const stats: RunStats = {
    processed: 0,
    deleted: 0,
    unreposted: 0,
    skipped: 0,
    errors: 0,
    retries: 0
  };
  const start = Date.now();

  const envProfileDir = process.env.PLAYWRIGHT_USER_DATA_DIR;
  const profileDir = envProfileDir ? resolve(envProfileDir) : resolve(process.cwd(), '.pw-user');
  ensureDir(profileDir);

  logger.info({ mode: options.mode, max: options.max, resume: options.resume }, 'x-post-wiper を開始します');
  logger.info({ profileDir }, 'Playwright プロファイルディレクトリを使用します');

  const processedSet = loadCheckpoint(options.resume);

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      slowMo: 80,
      viewport: { width: 1280, height: 900 }
    });

    let page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await ensureLogin(page);
    await navigateToProfile(page);

    let emptyRounds = 0;
    const emptyLimit = 4;

    outer: while (true) {
      if (options.max && stats.processed >= options.max) {
        logger.info('指定件数に到達したため終了します');
        break;
      }

      try {
        const cards = await autoScrollAndCollect(page);
        if (!cards.length) {
          emptyRounds += 1;
          if (emptyRounds >= emptyLimit) {
            logger.info('新規カードが見つからないため終了します');
            break;
          }
          await sleep(randomWait(1000, 1800));
          continue;
        }

        emptyRounds = 0;
        for (const card of cards) {
          if (options.max && stats.processed >= options.max) {
            break outer;
          }
          await processCard(card, page, options, processedSet, stats);
        }
      } catch (error) {
        stats.retries += 1;
        logger.error({ error, retry: stats.retries }, 'カード処理中にエラーが発生しました。ページを再読み込みします');
        if (stats.retries > 3) {
          throw new Error('最大リトライ回数を超えました');
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        await promptEnter('2FA や CAPTCHA を解決してください。準備ができたら');
      }
    }
  } catch (error) {
    logger.error({ error }, '致命的エラーで終了します');
    process.exitCode = 1;
  } finally {
    if (context) {
      await context.close();
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  logger.info({ stats, elapsed }, '処理が完了しました');
}

run().catch((error) => {
  logger.error({ error }, '予期しないエラー');
  process.exitCode = 1;
});
