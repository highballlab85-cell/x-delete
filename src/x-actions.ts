import type { ElementHandle, Page } from 'playwright';
import { logger } from './logger.js';
import { MENUS, SEL, selectorList, WAIT_RANGE_MS } from './selectors.js';
import { randomWait, sleep } from './utils.js';

async function findWithFallback(
  card: ElementHandle<HTMLElement>,
  selectors: string[]
): Promise<ElementHandle<HTMLElement> | null> {
  for (const selector of selectors) {
    try {
      const handle = await card.$(selector);
      if (handle) {
        return handle as ElementHandle<HTMLElement>;
      }
    } catch (error) {
      logger.debug({ selector, error }, 'カード内セレクタ探索失敗');
    }
  }
  return null;
}

async function textMatches(handle: ElementHandle<HTMLElement>, patterns: readonly RegExp[]): Promise<boolean> {
  const text = (await handle.textContent())?.trim() ?? '';
  return patterns.some((pattern) => pattern.test(text));
}

async function findDeleteMenuItem(page: Page): Promise<ElementHandle<HTMLElement> | null> {
  const menuItems = await page.locator('div[role="menu"] [role="menuitem"]').elementHandles();
  for (const item of menuItems) {
    if (await textMatches(item as ElementHandle<HTMLElement>, MENUS.DELETE_POST.fallbackTexts)) {
      return item as ElementHandle<HTMLElement>;
    }
  }
  return null;
}

async function excerpt(card: ElementHandle<HTMLElement>): Promise<string> {
  try {
    return await card.evaluate((node) => node.textContent?.trim().slice(0, 60) ?? '');
  } catch (error) {
    logger.debug({ error }, 'カード抜粋失敗');
    return '';
  }
}

async function pageLevelFind(page: Page, selectors: string[]): Promise<ElementHandle<HTMLElement> | null> {
  for (const selector of selectors) {
    try {
      const handle = await page.$(selector);
      if (handle) {
        return handle as ElementHandle<HTMLElement>;
      }
    } catch (error) {
      logger.debug({ selector, error }, 'ページ探索失敗');
    }
  }
  return null;
}

/**
 * カード内のリポスト取り消しボタンをクリックし確認ダイアログで確定する。
 */
export async function undoRepost(
  card: ElementHandle<HTMLElement>,
  page: Page
): Promise<'unreposted' | 'skipped' | 'error'> {
  const button = await findWithFallback(card, selectorList(SEL.UNRETWEET));
  if (!button) {
    return 'skipped';
  }

  try {
    await button.click({ delay: 60 });
    await sleep(randomWait(WAIT_RANGE_MS.MIN, WAIT_RANGE_MS.MAX));
    const confirm = await pageLevelFind(page, selectorList(SEL.UNRETWEET_OK));
    if (!confirm) {
      logger.warn({ excerpt: await excerpt(card) }, 'アンリポスト確認ボタンが見つかりません');
      return 'error';
    }
    await confirm.click({ delay: 60 });
    await sleep(randomWait(WAIT_RANGE_MS.MIN, WAIT_RANGE_MS.MAX));
    return 'unreposted';
  } catch (error) {
    logger.error({ error, excerpt: await excerpt(card) }, 'リポスト取り消しに失敗');
    return 'error';
  }
}

/**
 * カード内のオリジナル投稿を削除メニュー経由で削除する。
 */
export async function deleteOriginal(
  card: ElementHandle<HTMLElement>,
  page: Page
): Promise<'deleted' | 'skipped' | 'error'> {
  const caret = await findWithFallback(card, selectorList(SEL.CARET));
  if (!caret) {
    return 'skipped';
  }

  try {
    await caret.click({ delay: 50 });
    await sleep(randomWait(600, 900));

    const menuItem = await findDeleteMenuItem(page);
    if (!menuItem) {
      logger.warn({ excerpt: await excerpt(card) }, '削除メニューが見つかりません');
      return 'skipped';
    }
    await menuItem.click({ delay: 60 });
    await sleep(randomWait(WAIT_RANGE_MS.MIN, WAIT_RANGE_MS.MAX));

    const confirm = await pageLevelFind(page, selectorList(SEL.CONFIRM));
    if (!confirm) {
      logger.warn({ excerpt: await excerpt(card) }, '削除確認が見つかりません');
      return 'error';
    }
    await confirm.click({ delay: 60 });
    await sleep(randomWait(WAIT_RANGE_MS.MIN, WAIT_RANGE_MS.MAX));
    return 'deleted';
  } catch (error) {
    logger.error({ error, excerpt: await excerpt(card) }, '投稿削除に失敗');
    return 'error';
  }
}
