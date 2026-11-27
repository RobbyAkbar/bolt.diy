import { useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { getAuthHeaderName, getRequestUser, isAdmin, type UsageContext } from '~/lib/.server/usage/identity';
import {
  getUsageSummary,
  getUserBreakdown,
  type UsageRange,
  type UsageSummaryRow,
  type UserBreakdown,
} from '~/lib/.server/usage/store';

export const meta: MetaFunction = () => [{ title: 'Token usage | Bolt' }];

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function validDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  // Rejects impossible dates such as 2026-02-31, which Date silently rolls over.
  return !Number.isNaN(parsed.getTime()) && isoDay(parsed) === value ? value : null;
}

export function parseRange(url: URL, now: Date): UsageRange {
  const defaultFrom = `${isoDay(now).slice(0, 7)}-01`;
  const from = validDay(url.searchParams.get('from')) ?? defaultFrom;
  const to = validDay(url.searchParams.get('to')) ?? isoDay(now);

  return from <= to ? { from, to } : { from: to, to: from };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const usageContext = context as unknown as UsageContext;

  if (!getAuthHeaderName(usageContext)) {
    throw new Response('Not Found', { status: 404 });
  }

  if (!isAdmin(getRequestUser(request, usageContext), usageContext)) {
    throw new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const range = parseRange(url, new Date());
  const selectedUser = url.searchParams.get('user')?.trim() || null;
  const db = usageContext.cloudflare?.env?.USAGE_DB;

  if (!db) {
    return { range, summary: [] as UsageSummaryRow[], selectedUser, breakdown: null, dbMissing: true };
  }

  const summary = await getUsageSummary(db, range);
  const breakdown: UserBreakdown | null = selectedUser ? await getUserBreakdown(db, selectedUser, range) : null;

  return { range, summary, selectedUser, breakdown, dbMissing: false };
}

const fmt = (value: number | null | undefined) => (value ?? 0).toLocaleString();

const cell = 'px-3 py-2 border-b border-bolt-elements-borderColor';
const numCell = `${cell} text-right tabular-nums`;

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor">
      <table className="w-full text-sm">
        <thead className="bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary">
          <tr>
            {head.map((label, index) => (
              <th key={label} className={`${cell} font-medium ${index === 0 ? 'text-left' : 'text-right'}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={cell} colSpan={head.length}>
                No usage in this range.
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((value, index) => (
                  <td key={index} className={index === 0 ? cell : numCell}>
                    {value}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminUsage() {
  const { range, summary, selectedUser, breakdown, dbMissing } = useLoaderData<typeof loader>();

  const userLink = (user: string) => `?${new URLSearchParams({ from: range.from, to: range.to, user }).toString()}`;

  return (
    <main className="min-h-full w-full overflow-y-auto bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Token usage per user</h1>

        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            From
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              className="rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            To
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              className="rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1"
            />
          </label>
          {selectedUser && <input type="hidden" name="user" value={selectedUser} />}
          <button
            type="submit"
            className="rounded bg-bolt-elements-button-primary-background px-3 py-1.5 text-bolt-elements-button-primary-text"
          >
            Apply
          </button>
        </form>

        {dbMissing && (
          <p className="text-sm text-bolt-elements-textSecondary">
            The USAGE_DB binding is not configured, so no usage is being recorded.
          </p>
        )}

        <Table
          head={['User', 'Requests', 'Input', 'Output', 'Total', 'On server key', 'On own key']}
          rows={summary.map((row) => [
            <a key={row.user} href={userLink(row.user)} className="underline">
              {row.user}
            </a>,
            fmt(row.requests),
            fmt(row.inputTokens),
            fmt(row.outputTokens),
            fmt(row.totalTokens),
            fmt(row.serverTokens),
            fmt(row.userTokens),
          ])}
        />

        {selectedUser && breakdown && (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{selectedUser}</h2>
            <Table
              head={['Provider / model', 'Key', 'Requests', 'Total']}
              rows={breakdown.byModel.map((row) => [
                `${row.provider} / ${row.model}`,
                row.keySource === 'user' ? 'own' : 'server',
                fmt(row.requests),
                fmt(row.totalTokens),
              ])}
            />
            <Table
              head={['Day', 'Requests', 'Total']}
              rows={breakdown.daily.map((row) => [row.day, fmt(row.requests), fmt(row.totalTokens)])}
            />
          </section>
        )}
      </div>
    </main>
  );
}
