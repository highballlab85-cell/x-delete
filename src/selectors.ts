export type SelectorEntry = {
  primary: string;
  fallbacks: string[];
};

export const SEL = {
  PROFILE_LINK: {
    primary: '[data-testid="AppTabBar_Profile_Link"]',
    fallbacks: [
      'a[aria-label="Profile"]',
      'a[role="link"][href*="/home"] nav + div a'
    ]
  },
  TWEET_CARD: {
    primary: '[data-testid="tweet"]',
    fallbacks: [
      'article[role="article"]',
      'div[data-testid*="post"]'
    ]
  },
  CARET: {
    primary: '[data-testid="caret"]',
    fallbacks: [
      'div[role="button"][aria-haspopup="menu"]',
      'button[aria-label*="More"]'
    ]
  },
  CONFIRM: {
    primary: '[data-testid="confirmationSheetConfirm"]',
    fallbacks: [
      'div[role="button"][data-testid="confirmationSheetConfirm"]',
      'div[role="button"] span:has-text("Delete")'
    ]
  },
  UNRETWEET: {
    primary: '[data-testid="unretweet"]',
    fallbacks: [
      'div[role="menuitem"] span:has-text("Undo Retweet")',
      'div[role="menuitem"] span:has-text("リポストを取り消す")'
    ]
  },
  UNRETWEET_OK: {
    primary: '[data-testid="unretweetConfirm"]',
    fallbacks: [
      'div[role="button"] span:has-text("Undo")',
      'div[role="button"] span:has-text("取り消し")'
    ]
  }
} as const satisfies Record<string, SelectorEntry>;

export const MENUS = {
  DELETE_POST: {
    fallbackTexts: [/^delete/i, /^削除$/]
  }
} as const;

export const WAIT_RANGE_MS = {
  MIN: 800,
  MAX: 1600
} as const;

export function selectorList(entry: SelectorEntry): string[] {
  return [entry.primary, ...entry.fallbacks];
}
