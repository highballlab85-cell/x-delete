import type { ElementHandle, Page } from 'playwright';
import { SEL, selectorList } from './selectors.js';
import { randomWait, sleep } from './utils.js';

const MAX_SCROLL_CYCLES = 12;
const STAGNANT_LIMIT = 3;
const MIN_BATCH_SIZE = 20;

async function deriveCardKey(handle: ElementHandle<HTMLElement>): Promise<string> {
  return handle.evaluate((node) => {
    const anchor = node.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
    if (anchor?.href) {
      return anchor.href;
    }
    const datasetId = (node as HTMLElement).dataset.tweetId ?? (node as HTMLElement).dataset.testid;
    if (datasetId) {
      return datasetId;
    }
    return node.textContent?.slice(0, 50) ?? `${Date.now()}-${Math.random()}`;
  });
}

async function findTweetCards(page: Page): Promise<ElementHandle<HTMLElement>[]> {
  const candidates = selectorList(SEL.TWEET_CARD);
  for (const selector of candidates) {
    const handles = await page.locator(selector).elementHandles();
    if (handles.length) {
      return handles as ElementHandle<HTMLElement>[];
    }
  }
  return [];
}

/**
 * Scroll the feed to surface a batch of tweet cards and return distinct handles.
 */
export async function autoScrollAndCollect(page: Page): Promise<ElementHandle<HTMLElement>[]> {
  const collected = new Map<string, ElementHandle<HTMLElement>>();
  let stagnantRounds = 0;

  for (let cycle = 0; cycle < MAX_SCROLL_CYCLES; cycle += 1) {
    const cards = await findTweetCards(page);
    let newCards = 0;

    for (const card of cards) {
      const key = await deriveCardKey(card);
      if (!collected.has(key)) {
        collected.set(key, card);
        newCards += 1;
      }
    }

    if (newCards === 0) {
      stagnantRounds += 1;
    } else {
      stagnantRounds = 0;
    }

    if (collected.size >= MIN_BATCH_SIZE || stagnantRounds >= STAGNANT_LIMIT) {
      break;
    }

    await page.evaluate(() => {
      window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
    });

    await sleep(randomWait(900, 1400));
  }

  return Array.from(collected.values());
}
