import type { LoaderFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loader, parseRange } from './admin.usage';
import { recordUsage } from '~/lib/.server/usage/store';
import { createTestD1 } from '~/lib/.server/usage/test-d1';

let db: D1Database;

beforeEach(async () => {
  db = createTestD1();

  for (const [user, total] of [
    ['alice', 100],
    ['bob', 10],
  ] as const) {
    await recordUsage(db, {
      ts: new Date().toISOString(),
      user,
      endpoint: 'chat',
      provider: 'Anthropic',
      model: 'claude',
      keySource: 'server',
      tokens: { totalTokens: total },
    });
  }
});

afterEach(() => vi.unstubAllEnvs());

const ADMIN_ENV = { AUTH_USER_HEADER: 'X-Auth-User', ADMIN_USERS: 'alice' };

async function load(query: string, env: Partial<Env>, user?: string) {
  const request = new Request(`http://localhost/admin/usage${query}`, {
    headers: user ? { 'X-Auth-User': user } : {},
  });

  try {
    return await loader({ request, context: { cloudflare: { env } }, params: {} } as unknown as LoaderFunctionArgs);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }
}

describe('/admin/usage loader', () => {
  it('feature off → 404', async () => {
    vi.stubEnv('AUTH_USER_HEADER', '');

    const res = await load('', { USAGE_DB: db }, 'alice');
    expect((res as Response).status).toBe(404);
  });

  it('non-admin user → 403', async () => {
    const res = await load('', { ...ADMIN_ENV, USAGE_DB: db }, 'bob');
    expect((res as Response).status).toBe(403);
  });

  it('admin → summary rows from seeded data', async () => {
    const data = (await load('', { ...ADMIN_ENV, USAGE_DB: db }, 'alice')) as Awaited<ReturnType<typeof loader>>;

    expect(data.summary.map((row) => [row.user, row.totalTokens])).toEqual([
      ['alice', 100],
      ['bob', 10],
    ]);
    expect(data.selectedUser).toBeNull();
    expect(data.breakdown).toBeNull();
  });

  it('?user=alice → breakdown present; unknown user → empty breakdown arrays', async () => {
    const env = { ...ADMIN_ENV, USAGE_DB: db };
    const alice = (await load('?user=alice', env, 'alice')) as Awaited<ReturnType<typeof loader>>;
    expect(alice.breakdown?.byModel).toHaveLength(1);
    expect(alice.breakdown?.daily).toHaveLength(1);

    const ghost = (await load('?user=ghost', env, 'alice')) as Awaited<ReturnType<typeof loader>>;
    expect(ghost.breakdown).toEqual({ byModel: [], daily: [] });
  });

  it('missing USAGE_DB → empty tables with a notice, not 500', async () => {
    const data = (await load('', ADMIN_ENV, 'alice')) as Awaited<ReturnType<typeof loader>>;
    expect(data.summary).toEqual([]);
    expect(data.dbMissing).toBe(true);
  });
});

describe('parseRange', () => {
  const now = new Date('2026-11-27T15:00:00.000Z');
  const url = (query: string) => new URL(`http://localhost/admin/usage${query}`);

  it("no params on 2026-11-27 → { from: '2026-11-01', to: '2026-11-27' }", () => {
    expect(parseRange(url(''), now)).toEqual({ from: '2026-11-01', to: '2026-11-27' });
  });

  it('from=garbage → default from; from > to → swapped', () => {
    expect(parseRange(url('?from=garbage&to=2026-11-20'), now)).toEqual({ from: '2026-11-01', to: '2026-11-20' });
    expect(parseRange(url('?from=2026-11-20&to=2026-11-10'), now)).toEqual({ from: '2026-11-10', to: '2026-11-20' });
    expect(parseRange(url('?from=2026-02-31'), now)).toEqual({ from: '2026-11-01', to: '2026-11-27' });
  });
});
