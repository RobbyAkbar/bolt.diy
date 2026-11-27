import { getRequestUser, type UsageContext } from './identity';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Usage');

export type UsageEndpoint = 'chat' | 'enhancer' | 'llmcall';
export type UsageTokens = { inputTokens?: number; outputTokens?: number; totalTokens?: number };

/** ISO dates `YYYY-MM-DD`, both inclusive. */
export type UsageRange = { from: string; to: string };

type KeySource = 'server' | 'user';

const schemaReady = new WeakMap<D1Database, Promise<void>>();

let warnedMissingDb = false;

export function ensureSchema(db: D1Database): Promise<void> {
  let ready = schemaReady.get(db);

  if (!ready) {
    ready = (async () => {
      await db
        .prepare(
          'CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, user TEXT NOT NULL, endpoint TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, total_tokens INTEGER NOT NULL, key_source TEXT NOT NULL)',
        )
        .run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage(user, ts)').run();
    })();

    // A failed attempt is forgotten so the next request retries.
    ready.catch(() => schemaReady.delete(db));
    schemaReady.set(db, ready);
  }

  return ready;
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

export async function recordUsage(
  db: D1Database,
  row: {
    ts: string;
    user: string;
    endpoint: UsageEndpoint;
    provider: string;
    model: string;
    keySource: KeySource;
    tokens: UsageTokens;
  },
): Promise<void> {
  await ensureSchema(db);

  const input = count(row.tokens.inputTokens);
  const output = count(row.tokens.outputTokens);
  const total = count(row.tokens.totalTokens) || input + output;

  await db
    .prepare(
      'INSERT INTO usage (ts, user, endpoint, provider, model, input_tokens, output_tokens, total_tokens, key_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(row.ts, row.user, row.endpoint, row.provider, row.model, input, output, total, row.keySource)
    .run();
}

export function trackUsage(args: {
  context: UsageContext;
  request: Request;
  endpoint: UsageEndpoint;
  provider: string;
  model: string;
  apiKeys: Record<string, string>;
  usage: UsageTokens | undefined | PromiseLike<UsageTokens | undefined>;
}): Promise<void> {
  const { context, request, endpoint, provider, model, apiKeys } = args;
  const user = getRequestUser(request, context);
  const db = context.cloudflare?.env?.USAGE_DB as D1Database | undefined;

  if (!user) {
    return Promise.resolve();
  }

  if (!db) {
    if (!warnedMissingDb) {
      warnedMissingDb = true;
      logger.warn('USAGE_DB binding is missing; token usage is not recorded');
    }

    return Promise.resolve();
  }

  const work = (async () => {
    try {
      const tokens = (await args.usage) ?? {};
      await recordUsage(db, {
        ts: new Date().toISOString(),
        user,
        endpoint,
        provider,
        model,
        keySource: apiKeys[provider] ? 'user' : 'server',
        tokens,
      });
    } catch (error) {
      logger.error('Failed to record token usage', error);
    }
  })();

  context.cloudflare?.ctx?.waitUntil(work);

  return work;
}

function rangeBounds({ from, to }: UsageRange): [string, string] {
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  return [`${from}T00:00:00.000Z`, end.toISOString()];
}

export type UsageSummaryRow = {
  user: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  serverTokens: number;
  userTokens: number;
};

export type UserBreakdown = {
  byModel: Array<{ provider: string; model: string; keySource: KeySource; requests: number; totalTokens: number }>;
  daily: Array<{ day: string; requests: number; totalTokens: number }>;
};

export async function getUsageSummary(db: D1Database, range: UsageRange): Promise<UsageSummaryRow[]> {
  await ensureSchema(db);

  const { results } = await db
    .prepare(
      `SELECT user, COUNT(*) AS requests, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
        SUM(total_tokens) AS totalTokens,
        SUM(CASE WHEN key_source = 'server' THEN total_tokens ELSE 0 END) AS serverTokens,
        SUM(CASE WHEN key_source = 'user' THEN total_tokens ELSE 0 END) AS userTokens
      FROM usage WHERE ts >= ? AND ts < ? GROUP BY user ORDER BY totalTokens DESC, user ASC`,
    )
    .bind(...rangeBounds(range))
    .all<UsageSummaryRow>();

  return results;
}

export async function getUserBreakdown(db: D1Database, user: string, range: UsageRange): Promise<UserBreakdown> {
  await ensureSchema(db);

  const [start, end] = rangeBounds(range);

  const byModel = await db
    .prepare(
      `SELECT provider, model, key_source AS keySource, COUNT(*) AS requests, SUM(total_tokens) AS totalTokens
      FROM usage WHERE user = ? AND ts >= ? AND ts < ?
      GROUP BY provider, model, key_source ORDER BY totalTokens DESC, provider, model, key_source`,
    )
    .bind(user, start, end)
    .all<UserBreakdown['byModel'][number]>();

  const daily = await db
    .prepare(
      `SELECT substr(ts, 1, 10) AS day, COUNT(*) AS requests, SUM(total_tokens) AS totalTokens
      FROM usage WHERE user = ? AND ts >= ? AND ts < ? GROUP BY day ORDER BY day`,
    )
    .bind(user, start, end)
    .all<UserBreakdown['daily'][number]>();

  return { byModel: byModel.results, daily: daily.results };
}
