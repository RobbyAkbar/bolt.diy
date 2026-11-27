import { createStaticHandler, RouterContextProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { action as chatAction } from './api.chat';
import { action as enhancerAction } from './api.enhancer';
import { action as llmcallAction } from './api.llmcall';

const { queryRoute } = createStaticHandler([
  { path: '/api/chat', action: chatAction },
  { path: '/api/enhancer', action: enhancerAction },
  { path: '/api/llmcall', action: llmcallAction },
]);

function post(path: string, env: Record<string, unknown>, headers: Record<string, string> = {}) {
  const request = new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{}',
  });

  const requestContext = Object.assign(new RouterContextProvider(), {
    clientAddress: '127.0.0.1',
    cloudflare: { env },
  });

  return queryRoute(request, { requestContext }) as Promise<Response>;
}

const ON = { AUTH_USER_HEADER: 'X-Auth-User' };

afterEach(() => vi.unstubAllEnvs());

describe('LLM routes require the proxy user when AUTH_USER_HEADER is set', () => {
  it.each(['/api/chat', '/api/enhancer', '/api/llmcall'])('POST %s without X-Auth-User → 401', async (path) => {
    const res = await post(path, ON);
    expect(res.status).toBe(401);
  });

  it('POST /api/llmcall with X-Auth-User and an invalid body → 400, not 401', async () => {
    const res = await post('/api/llmcall', ON, { 'X-Auth-User': 'alice' });
    expect(res.status).toBe(400);
  });

  it('feature off: POST /api/llmcall without header and with an invalid body → 400', async () => {
    vi.stubEnv('AUTH_USER_HEADER', '');

    const res = await post('/api/llmcall', {});
    expect(res.status).toBe(400);
  });
});
