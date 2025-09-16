import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';
import { XApiClient, type TimelinePage, type TimelineTweet, XApiError } from './x-api.js';
import { UsageLimitError, UsageTracker } from './usage-tracker.js';

interface CliOptions {
  mode: 'dry' | 'auto';
  max?: number;
  resume: boolean;
}

interface CheckpointData {
  processed: string[];
  nextToken?: string | null;
}

interface CheckpointState {
  processed: Set<string>;
  nextToken: string | null;
}

interface RunStats {
  processed: number;
  deleted: number;
  unreposted: number;
  skipped: number;
  errors: number;
  timelinePages: number;
}

const CHECKPOINT_PATH = join(process.cwd(), 'state', 'checkpoint.json');

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { mode: 'dry', resume: false };

  for (const arg of argv) {
    if (arg.startsWith('--mode=')) {
      const value = arg.split('=')[1];
      if (value === 'dry' || value === 'auto') {
        options.mode = value;
      } else {
        throw new Error(`--mode には dry もしくは auto を指定してください: ${value}`);
      }
    } else if (arg.startsWith('--max=')) {
      const raw = Number.parseInt(arg.split('=')[1] ?? '', 10);
      if (Number.isNaN(raw) || raw <= 0) {
        throw new Error('--max には 1 以上の整数を指定してください');
      }
      options.max = raw;
    } else if (arg === '--resume') {
      options.resume = true;
    }
  }

  return options;
}

function ensureStateDir() {
  const stateDir = join(process.cwd(), 'state');
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function loadCheckpoint(resume: boolean): CheckpointState {
  if (!resume || !existsSync(CHECKPOINT_PATH)) {
    return { processed: new Set(), nextToken: null };
  }

  try {
    const raw = readFileSync(CHECKPOINT_PATH, 'utf-8');
    const data = JSON.parse(raw) as CheckpointData;
    return {
      processed: new Set(data.processed ?? []),
      nextToken: data.nextToken ?? null
    };
  } catch (error) {
    logger.warn({ error }, 'チェックポイントの読み込みに失敗したため新規ファイルを使用します');
    return { processed: new Set(), nextToken: null };
  }
}

function saveCheckpoint(processed: Set<string>, nextToken: string | null) {
  ensureStateDir();
  const payload: CheckpointData = {
    processed: Array.from(processed),
    nextToken: nextToken ?? null
  };
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(payload, null, 2));
}

function parseLimit(envKey: string): number | undefined {
  const raw = process.env[envKey];
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`${envKey} には 0 以上の整数を指定してください`);
  }
  return parsed;
}

function retweetTargetId(tweet: TimelineTweet): string | null {
  for (const ref of tweet.referenced_tweets ?? []) {
    if (ref.type === 'retweeted') {
      return ref.id;
    }
  }
  return null;
}

async function resolveUserId(client: XApiClient): Promise<string> {
  const { data } = await client.getOwnUser();
  return data.id;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const stats: RunStats = {
    processed: 0,
    deleted: 0,
    unreposted: 0,
    skipped: 0,
    errors: 0,
    timelinePages: 0
  };

  const token = process.env.X_API_BEARER_TOKEN;
  if (!token) {
    throw new Error('X_API_BEARER_TOKEN を .env に設定してください');
  }

  const dailyLimit = parseLimit('X_API_DAILY_LIMIT');
  const monthlyLimit = parseLimit('X_API_MONTHLY_LIMIT');
  const usageTracker = new UsageTracker({ dailyLimit, monthlyLimit });

  const client = new XApiClient(
    { token, baseUrl: process.env.X_API_BASE_URL },
    usageTracker
  );

  const checkpoint = loadCheckpoint(options.resume);
  const processedSet = checkpoint.processed;
  let paginationToken: string | undefined = options.resume ? checkpoint.nextToken ?? undefined : undefined;

  let userId = process.env.X_USER_ID;
  if (!userId) {
    logger.info('X_USER_ID が未設定のため API から本人のユーザー ID を取得します');
    try {
      userId = await resolveUserId(client);
    } catch (error) {
      if (error instanceof UsageLimitError) {
        logger.error('ユーザー ID 取得前に API 使用上限に達しました');
        return;
      }
      if (error instanceof XApiError) {
        logger.error({ status: error.status, payload: error.payload }, 'ユーザー ID 取得に失敗しました');
        throw error;
      }
      throw error;
    }
  }

  if (!userId) {
    throw new Error('対象ユーザー ID を決定できませんでした');
  }

  logger.info(
    {
      mode: options.mode,
      max: options.max,
      resume: options.resume,
      userId,
      dailyRemaining: usageTracker.remainingDaily(),
      monthlyRemaining: usageTracker.remainingMonthly()
    },
    'X API ベースの削除処理を開始します'
  );

  const start = Date.now();
  const shouldPersist = options.mode === 'auto';
  let limitReached = false;

  outer: while (true) {
    if (options.max && stats.processed >= options.max) {
      logger.info('指定された最大処理件数に達したため終了します');
      break;
    }

    const pageTokenUsed = paginationToken ?? null;
    let timeline: TimelinePage;
    try {
      timeline = await client.fetchTimeline(userId, paginationToken);
      stats.timelinePages += 1;
    } catch (error) {
      if (error instanceof UsageLimitError) {
        logger.warn(
          {
            remainingDaily: usageTracker.remainingDaily(),
            remainingMonthly: usageTracker.remainingMonthly()
          },
          'API 使用量が上限に達したため終了します'
        );
        limitReached = true;
        break;
      }
      if (error instanceof XApiError) {
        if (error.status === 429) {
          logger.warn({ status: error.status }, 'レートリミット応答が返されたため終了します');
          limitReached = true;
          break;
        }
        logger.error({ status: error.status, payload: error.payload }, 'タイムライン取得に失敗しました');
        throw error;
      }
      throw error;
    }

    if (timeline.tweets.length === 0) {
      logger.info('タイムラインから取得できる投稿が残っていません');
      if (shouldPersist) {
        saveCheckpoint(processedSet, paginationToken ?? null);
      }
      break;
    }

    for (const tweet of timeline.tweets) {
      if (options.max && stats.processed >= options.max) {
        break outer;
      }

      const statusId = tweet.id;
      if (processedSet.has(statusId)) {
        stats.skipped += 1;
        stats.processed += 1;
        continue;
      }

      const targetTweetId = retweetTargetId(tweet);

      if (options.mode === 'dry') {
        stats.processed += 1;
        if (targetTweetId) {
          stats.unreposted += 1;
          logger.info({ statusId, sourceTweetId: targetTweetId }, 'Dry-run: リポスト取消対象');
        } else {
          stats.deleted += 1;
          logger.info({ statusId }, 'Dry-run: 削除対象');
        }
        continue;
      }

      try {
        let success = false;
        if (targetTweetId) {
          success = await client.undoRetweet(userId, targetTweetId);
          if (success) {
            stats.unreposted += 1;
            logger.info({ statusId, sourceTweetId: targetTweetId }, 'リポストを取り消しました');
          } else {
            stats.skipped += 1;
            logger.warn({ statusId, sourceTweetId: targetTweetId }, 'リポスト取消 API から削除済みの応答を受け取りました');
          }
        } else {
          success = await client.deleteTweet(statusId);
          if (success) {
            stats.deleted += 1;
            logger.info({ statusId }, '投稿を削除しました');
          } else {
            stats.skipped += 1;
            logger.warn({ statusId }, '削除 API から削除済みの応答を受け取りました');
          }
        }

        stats.processed += 1;
        processedSet.add(statusId);
        if (shouldPersist) {
          saveCheckpoint(processedSet, pageTokenUsed);
        }
      } catch (error) {
        if (error instanceof UsageLimitError) {
          logger.warn({ statusId }, 'API 使用上限に達したため処理を終了します');
          limitReached = true;
          break outer;
        }

        if (error instanceof XApiError) {
          if (error.status === 404) {
            logger.info({ statusId }, '既に削除済みのためスキップしました');
            stats.skipped += 1;
            stats.processed += 1;
            processedSet.add(statusId);
            if (shouldPersist) {
              saveCheckpoint(processedSet, pageTokenUsed);
            }
            continue;
          }

          if (error.status === 429) {
            logger.warn({ statusId }, 'レートリミット応答が返されたため終了します');
            limitReached = true;
            break outer;
          }

          logger.error({ statusId, status: error.status, payload: error.payload }, 'X API 呼び出しでエラーが発生しました');
        } else {
          logger.error({ statusId, error }, '想定外のエラーが発生しました');
        }

        stats.errors += 1;
        stats.processed += 1;
      }
    }

    if (limitReached) {
      break;
    }

    if (!timeline.nextToken) {
      if (shouldPersist) {
        saveCheckpoint(processedSet, null);
      }
      logger.info('これ以上古い投稿が存在しないため終了します');
      break;
    }

    paginationToken = timeline.nextToken;
    if (shouldPersist) {
      saveCheckpoint(processedSet, timeline.nextToken);
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  logger.info(
    {
      stats,
      elapsed,
      usage: usageTracker.getSnapshot(),
      limitReached
    },
    '処理が完了しました'
  );
}

run().catch((error) => {
  logger.error({ error }, '予期しないエラーが発生しました');
  process.exitCode = 1;
});
