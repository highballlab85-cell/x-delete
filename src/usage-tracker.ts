import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const USAGE_FILE = join(process.cwd(), 'state', 'usage.json');

interface UsageState {
  dayStamp: string;
  monthStamp: string;
  dailyCount: number;
  monthlyCount: number;
}

function ensureStateDir() {
  const stateDir = join(process.cwd(), 'state');
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function todayStamp(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function monthStamp(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function loadState(): UsageState {
  if (!existsSync(USAGE_FILE)) {
    return {
      dayStamp: todayStamp(),
      monthStamp: monthStamp(),
      dailyCount: 0,
      monthlyCount: 0
    };
  }

  try {
    const raw = readFileSync(USAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UsageState>;
    return {
      dayStamp: parsed.dayStamp ?? todayStamp(),
      monthStamp: parsed.monthStamp ?? monthStamp(),
      dailyCount: parsed.dailyCount ?? 0,
      monthlyCount: parsed.monthlyCount ?? 0
    };
  } catch {
    return {
      dayStamp: todayStamp(),
      monthStamp: monthStamp(),
      dailyCount: 0,
      monthlyCount: 0
    };
  }
}

export class UsageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageLimitError';
  }
}

interface UsageOptions {
  dailyLimit?: number;
  monthlyLimit?: number;
}

export class UsageTracker {
  private state: UsageState;

  constructor(private readonly options: UsageOptions) {
    this.state = loadState();
    this.refreshWindows();
  }

  private refreshWindows() {
    const today = todayStamp();
    if (this.state.dayStamp !== today) {
      this.state.dayStamp = today;
      this.state.dailyCount = 0;
    }

    const currentMonth = monthStamp();
    if (this.state.monthStamp !== currentMonth) {
      this.state.monthStamp = currentMonth;
      this.state.monthlyCount = 0;
    }
  }

  private persist() {
    ensureStateDir();
    writeFileSync(USAGE_FILE, JSON.stringify(this.state, null, 2));
  }

  private hasDailyBudget(cost: number): boolean {
    if (this.options.dailyLimit === undefined) {
      return true;
    }
    return this.state.dailyCount + cost <= this.options.dailyLimit;
  }

  private hasMonthlyBudget(cost: number): boolean {
    if (this.options.monthlyLimit === undefined) {
      return true;
    }
    return this.state.monthlyCount + cost <= this.options.monthlyLimit;
  }

  consume(cost: number, label?: string) {
    this.refreshWindows();
    if (!this.hasDailyBudget(cost)) {
      throw new UsageLimitError(`日次 API 上限に達しました: ${label ?? 'API call'}`);
    }
    if (!this.hasMonthlyBudget(cost)) {
      throw new UsageLimitError(`月次 API 上限に達しました: ${label ?? 'API call'}`);
    }

    this.state.dailyCount += cost;
    this.state.monthlyCount += cost;
    this.persist();
  }

  remainingDaily(): number {
    if (this.options.dailyLimit === undefined) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(this.options.dailyLimit - this.state.dailyCount, 0);
  }

  remainingMonthly(): number {
    if (this.options.monthlyLimit === undefined) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(this.options.monthlyLimit - this.state.monthlyCount, 0);
  }

  getSnapshot() {
    return {
      dayStamp: this.state.dayStamp,
      monthStamp: this.state.monthStamp,
      dailyCount: this.state.dailyCount,
      monthlyCount: this.state.monthlyCount,
      dailyLimit: this.options.dailyLimit,
      monthlyLimit: this.options.monthlyLimit
    };
  }
}
