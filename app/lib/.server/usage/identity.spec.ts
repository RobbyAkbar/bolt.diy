import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRequestUser, isAdmin, requireLlmUser, type UsageContext } from './identity';

const on: UsageContext = { cloudflare: { env: { AUTH_USER_HEADER: 'X-Auth-User' } } };
const off: UsageContext = { cloudflare: { env: {} } };

function req(user?: string) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: user === undefined ? {} : { 'X-Auth-User': user },
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('usage identity', () => {
  it('feature off → getRequestUser returns null even with X-Auth-User: alice', () => {
    vi.stubEnv('AUTH_USER_HEADER', '');
    expect(getRequestUser(req('alice'), off)).toBeNull();
  });

  it("feature on → getRequestUser returns 'alice' for header ' alice '", () => {
    expect(getRequestUser(req(' alice '), on)).toBe('alice');
  });

  it('whitespace header → requireLlmUser returns status 401', async () => {
    const res = requireLlmUser(req('   '), on);
    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ error: 'Authentication required' });
    expect(requireLlmUser(req(), on)?.status).toBe(401);
  });

  it('feature off → requireLlmUser returns null', () => {
    vi.stubEnv('AUTH_USER_HEADER', '');
    expect(requireLlmUser(req(), off)).toBeNull();
  });

  it('feature on → requireLlmUser lets an authenticated request through', () => {
    expect(requireLlmUser(req('alice'), on)).toBeNull();
  });

  it('context env wins over process.env for AUTH_USER_HEADER', () => {
    vi.stubEnv('AUTH_USER_HEADER', 'X-Other');

    const request = new Request('http://localhost/', { headers: { 'X-Auth-User': 'alice', 'X-Other': 'mallory' } });
    expect(getRequestUser(request, on)).toBe('alice');
    expect(getRequestUser(request, off)).toBe('mallory');
  });

  it('isAdmin matches trimmed, comma-split ADMIN_USERS exactly', () => {
    const ctx: UsageContext = { cloudflare: { env: { AUTH_USER_HEADER: 'X-Auth-User', ADMIN_USERS: ' alice, bob ' } } };
    expect(isAdmin('bob', ctx)).toBe(true);
    expect(isAdmin('Bob', ctx)).toBe(false);
    expect(isAdmin(null, ctx)).toBe(false);
  });
});
