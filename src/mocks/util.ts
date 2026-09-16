import { HttpResponse, type DefaultBodyType } from 'msw';

/** Standard SysAdmin API envelope. */
export function ok<T>(result: T, extra?: { console?: string[]; summary?: string; status?: number }) {
  return HttpResponse.json(
    { status: { Errors: [], summary: extra?.summary ?? '' }, console: extra?.console ?? [], result },
    { status: extra?.status ?? 200 },
  );
}

export function created<T>(result: T, console: string[] = []) {
  return ok(result, { status: 201, console });
}

export function fail(status: number, summary: string, errors: string[] = [summary]) {
  return HttpResponse.json({ status: { Errors: errors, summary }, console: [], result: {} }, { status });
}

export function notFound(what: string) {
  return fail(404, `${what} not found`);
}

export function badRequest(msg: string) {
  return fail(400, msg);
}

export function forbidden(resource: string) {
  return fail(403, `User does not hold the required privilege ${resource}`);
}

export function unauthorized() {
  return new HttpResponse(null, { status: 401 });
}

export function accepted(taskId: string, basePath: string) {
  return HttpResponse.json(
    { status: { Errors: [], summary: 'Task queued' }, console: [], result: { GUID: taskId } },
    { status: 202, headers: { Location: `${basePath}/v2/async-result?id=${taskId}` } },
  );
}

export function query(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export function requireParam(request: Request, name: string): string | null {
  const v = query(request).get(name);
  return v === null || v === '' ? null : v;
}

export async function jsonBody<T extends DefaultBodyType = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export function now(): string {
  return fmtDate(new Date());
}

export function fmtDate(d: Date, seconds = true): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return seconds ? `${base}:${p(d.getSeconds())}` : base;
}

export function minutesAgo(m: number): string {
  return fmtDate(new Date(Date.now() - m * 60_000));
}

export function hoursAgo(h: number): string {
  return minutesAgo(h * 60);
}

export function daysAgo(d: number): string {
  return hoursAgo(d * 24);
}

export function inMinutes(m: number): string {
  return fmtDate(new Date(Date.now() + m * 60_000), false);
}

/** Deterministic pseudo-random in [0,1) from a seed - keeps fixtures stable between reloads. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Slowly drifting value for "live" stats: base ± amplitude · sin(t) with a little jitter. */
export function drift(base: number, amplitude: number, periodSec = 60, phase = 0): number {
  const t = Date.now() / 1000;
  const wave = Math.sin((t / periodSec) * 2 * Math.PI + phase);
  const jitter = (Math.sin(t * 7.13 + phase) + Math.sin(t * 3.71 + phase * 2)) * 0.15;
  return Math.max(0, base + amplitude * (wave + jitter));
}

export function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)];
}

export function filterRows<T extends Record<string, unknown>>(rows: T[], request: Request): T[] {
  const q = query(request);
  const filter = q.get('filter')?.toLowerCase();
  const maxRows = Number(q.get('maxRows') ?? 1000) || 1000;
  let out = rows;
  if (filter) out = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(filter));
  return out.slice(0, maxRows);
}
