/*
 * Identity comes from the reverse proxy (Caddy basic_auth → X-Auth-User). The
 * header is only trusted when AUTH_USER_HEADER is configured, which must only
 * be done when the app is reachable solely through that proxy.
 */
export type UsageContext = {
  cloudflare?: { env?: Partial<Env> & Record<string, unknown>; ctx?: ExecutionContext };
};

export function readEnv(context: UsageContext, key: string): string | undefined {
  const value = context.cloudflare?.env?.[key] ?? (typeof process !== 'undefined' ? process.env?.[key] : undefined);
  return typeof value === 'string' ? value : undefined;
}

export function getAuthHeaderName(context: UsageContext): string | null {
  return readEnv(context, 'AUTH_USER_HEADER')?.trim() || null;
}

export function getRequestUser(request: Request, context: UsageContext): string | null {
  const header = getAuthHeaderName(context);
  return header ? request.headers.get(header)?.trim() || null : null;
}

export function requireLlmUser(request: Request, context: UsageContext): Response | null {
  if (!getAuthHeaderName(context) || getRequestUser(request, context)) {
    return null;
  }

  return Response.json({ error: 'Authentication required' }, { status: 401 });
}

export function isAdmin(user: string | null, context: UsageContext): boolean {
  if (!user) {
    return false;
  }

  const admins = (readEnv(context, 'ADMIN_USERS') ?? '').split(',').map((name) => name.trim());

  return admins.includes(user);
}
