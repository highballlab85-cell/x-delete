import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import pretty from 'pino-pretty';

const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'x-wiper.log');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL ?? 'info';

const streams = [
  { stream: pretty({ colorize: true, translateTime: 'SYS:standard' }) },
  { stream: pino.destination({ dest: LOG_FILE, sync: false }) }
];

export const logger = pino({ level: logLevel }, pino.multistream(streams));
