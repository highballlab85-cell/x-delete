import { UsageTracker } from './usage-tracker.js';

export interface ReferencedTweet {
  type: 'retweeted' | 'quoted' | 'replied_to';
  id: string;
}

export interface TimelineTweet {
  id: string;
  text: string;
  created_at: string;
  referenced_tweets?: ReferencedTweet[];
}

export interface TimelinePage {
  tweets: TimelineTweet[];
  nextToken: string | null;
}

interface RequestParams {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  label?: string;
}

export class XApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown
  ) {
    super(message);
    this.name = 'XApiError';
  }
}

interface UserResponse {
  data: {
    id: string;
    name: string;
    username: string;
  };
}

interface TimelineResponse {
  data?: TimelineTweet[];
  meta: {
    next_token?: string;
    result_count: number;
  };
}

interface DeleteTweetResponse {
  data: {
    deleted: boolean;
  };
}

interface UndoRetweetResponse {
  data: {
    retweeted: boolean;
  };
}

interface ClientOptions {
  token: string;
  baseUrl?: string;
}

export class XApiClient {
  private readonly baseUrl: string;

  constructor(private readonly options: ClientOptions, private readonly usage: UsageTracker) {
    const normalized = options.baseUrl?.replace(/\/+$/, '') ?? 'https://api.twitter.com/2';
    this.baseUrl = `${normalized}/`;
  }

  private async request<T>(params: RequestParams): Promise<T> {
    const { method, path, query, body, label } = params;
    const url = new URL(path.replace(/^\//, ''), this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    this.usage.consume(1, label ?? `${method} ${url.pathname}`);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.token}`,
      Accept: 'application/json'
    };

    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: payload
    });

    if (!response.ok) {
      let errorBody: unknown;
      const text = await response.text();
      if (text) {
        try {
          errorBody = JSON.parse(text) as unknown;
        } catch {
          errorBody = text;
        }
      }
      throw new XApiError(`API request failed: ${method} ${url.pathname}`, response.status, errorBody);
    }

    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  async getOwnUser(): Promise<UserResponse> {
    return this.request<UserResponse>({
      method: 'GET',
      path: '/users/me',
      label: 'GET /users/me'
    });
  }

  async fetchTimeline(userId: string, paginationToken?: string): Promise<TimelinePage> {
    const response = await this.request<TimelineResponse>({
      method: 'GET',
      path: `/users/${userId}/tweets`,
      query: {
        max_results: 100,
        pagination_token: paginationToken,
        'tweet.fields': 'created_at,referenced_tweets'
      },
      label: 'GET /users/:id/tweets'
    });

    const tweets = response.data ?? [];
    const nextToken = response.meta?.next_token ?? null;
    return { tweets, nextToken };
  }

  async deleteTweet(tweetId: string): Promise<boolean> {
    const response = await this.request<DeleteTweetResponse>({
      method: 'DELETE',
      path: `/tweets/${tweetId}`,
      label: 'DELETE /tweets/:id'
    });
    return Boolean(response.data?.deleted);
  }

  async undoRetweet(userId: string, sourceTweetId: string): Promise<boolean> {
    const response = await this.request<UndoRetweetResponse>({
      method: 'DELETE',
      path: `/users/${userId}/retweets/${sourceTweetId}`,
      label: 'DELETE /users/:id/retweets/:tweet_id'
    });
    return response.data?.retweeted === false;
  }
}
