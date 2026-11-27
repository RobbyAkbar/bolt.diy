import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsageContext } from './identity';
import { getUsageSummary, getUserBreakdown, recordUsage, trackUsage } from './store';
import { createTestD1 } from './test-d1';

const NOV = { from: '2026-11-01', to: '2026-11-30' };

let db: D1Database;

beforeEach(() => {
  db = createTestD1();
});

function row(user: string, keySource: 'server' | 'user', total: number, ts = '2026-11-10T10:00:00.000Z') {
  return recordUsage(db, {
    ts,
    user,
    endpoint: 'chat',
    provider: 'Anthropic',
    model: 'claude',
    keySource,
    tokens: { inputTokens: total - 1, outputTokens: 1, totalTokens: total },
  });
}

function ctx(env: Record<string, unknown>, waitUntil?: (p: Promise<unknown>) => void): UsageContext {
  return { cloudflare: { env, ctx: waitUntil ? ({ waitUntil } as unknown as ExecutionContext) : undefined } };
}

function req(user?: string) {
  return new Request('http://localhost/api/chat', { headers: user ? { 'X-Auth-User': user } : {} });
}

function track(
  context: UsageContext,
  request: Request,
  usage: Parameters<typeof trackUsage>[0]['usage'],
  apiKeys = {},
) {
  return trackUsage({ context, request, endpoint: 'enhancer', provider: 'OpenAI', model: 'gpt', apiKeys, usage });
}

const ALL_TIME = { from: '2000-01-01', to: '2100-01-01' };

describe('usage store', () => {
  it('recordUsage then getUsageSummary sums per user and splits server vs user tokens', async () => {
    await row('alice', 'server', 100);
    await row('alice', 'user', 50);
    await row('bob', 'server', 10);

    expect(await getUsageSummary(db, NOV)).toEqual([
      {
        user: 'alice',
        requests: 2,
        inputTokens: 148,
        outputTokens: 2,
        totalTokens: 150,
        serverTokens: 100,
        userTokens: 50,
      },
      { user: 'bob', requests: 1, inputTokens: 9, outputTokens: 1, totalTokens: 10, serverTokens: 10, userTokens: 0 },
    ]);
  });

  it('range is inclusive of the to-day and excludes the day after', async () => {
    await row('alice', 'server', 1, '2026-11-30T23:59:59.999Z');
    await row('alice', 'server', 2, '2026-12-01T00:00:00.000Z');
    await row('alice', 'server', 4, '2026-10-31T23:59:59.999Z');

    const [alice] = await getUsageSummary(db, NOV);
    expect(alice.totalTokens).toBe(1);
  });

  it('getUserBreakdown groups by provider/model/keySource and by day', async () => {
    await row('alice', 'server', 100, '2026-11-10T01:00:00.000Z');
    await row('alice', 'server', 20, '2026-11-10T02:00:00.000Z');
    await row('alice', 'user', 5, '2026-11-11T01:00:00.000Z');
    await row('bob', 'server', 999);

    const breakdown = await getUserBreakdown(db, 'alice', NOV);

    expect(breakdown.byModel).toEqual([
      { provider: 'Anthropic', model: 'claude', keySource: 'server', requests: 2, totalTokens: 120 },
      { provider: 'Anthropic', model: 'claude', keySource: 'user', requests: 1, totalTokens: 5 },
    ]);
    expect(breakdown.daily).toEqual([
      { day: '2026-11-10', requests: 2, totalTokens: 120 },
      { day: '2026-11-11', requests: 1, totalTokens: 5 },
    ]);
  });

  it('partial usage { inputTokens: 7, outputTokens: 3 } stores total 10; undefined usage stores zeros', async () => {
    const env = { AUTH_USER_HEADER: 'X-Auth-User', USAGE_DB: db };
    await track(ctx(env), req('alice'), { inputTokens: 7, outputTokens: 3 });
    await track(ctx(env), req('bob'), undefined);
    await track(ctx(env), req('carol'), { inputTokens: Number.NaN, outputTokens: 2 });

    const byUser = Object.fromEntries((await getUsageSummary(db, ALL_TIME)).map((s) => [s.user, s]));

    expect(byUser.alice).toMatchObject({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
    expect(byUser.bob).toMatchObject({ requests: 1, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(byUser.carol).toMatchObject({ inputTokens: 0, outputTokens: 2, totalTokens: 2 });
  });

  it('trackUsage with feature off records nothing', async () => {
    vi.stubEnv('AUTH_USER_HEADER', '');
    await track(ctx({ USAGE_DB: db }), req('alice'), { totalTokens: 5 });
    vi.unstubAllEnvs();

    expect(await getUsageSummary(db, ALL_TIME)).toEqual([]);
  });

  it('trackUsage resolves (does not reject) when USAGE_DB is missing or prepare throws', async () => {
    await expect(track(ctx({ AUTH_USER_HEADER: 'X-Auth-User' }), req('alice'), { totalTokens: 5 })).resolves.toBe(
      undefined,
    );

    const broken = {
      prepare: () => {
        throw new Error('disk full');
      },
    } as unknown as D1Database;
    await expect(
      track(ctx({ AUTH_USER_HEADER: 'X-Auth-User', USAGE_DB: broken }), req('alice'), { totalTokens: 5 }),
    ).resolves.toBe(undefined);

    await expect(
      track(
        ctx({ AUTH_USER_HEADER: 'X-Auth-User', USAGE_DB: db }),
        req('alice'),
        Promise.reject(new Error('stream died')),
      ),
    ).resolves.toBe(undefined);
  });

  it("trackUsage sets keySource 'user' when apiKeys[provider] is set", async () => {
    const env = { AUTH_USER_HEADER: 'X-Auth-User', USAGE_DB: db };
    await track(ctx(env), req('alice'), { totalTokens: 5 }, { OpenAI: 'sk-own' });
    await track(ctx(env), req('alice'), { totalTokens: 3 }, { Anthropic: 'sk-other' });

    const [alice] = await getUsageSummary(db, ALL_TIME);
    expect(alice).toMatchObject({ userTokens: 5, serverTokens: 3 });
  });

  it('trackUsage calls ctx.waitUntil with its promise when ctx is present', async () => {
    const waitUntil = vi.fn();

    const promise = track(ctx({ AUTH_USER_HEADER: 'X-Auth-User', USAGE_DB: db }, waitUntil), req('alice'), {
      totalTokens: 5,
    });

    expect(waitUntil).toHaveBeenCalledWith(promise);
    await promise;
  });
});
