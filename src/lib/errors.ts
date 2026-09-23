/**
 * Error model for the SysAdmin API.
 *
 * The documented envelope is `{ status: { Errors: string[], summary }, console: string[] }`.
 * Real instances have also been observed to answer with `status.errors` as an array of
 * objects (`{ code, error, domain, id, params }`), and classic %CSP.REST errors use a
 * top-level `errors` array. `normalizeErrors` accepts all three.
 */
export interface ApiErrorInit {
  status: number;
  url: string;
  method?: string;
  errors?: string[];
  summary?: string;
  console?: string[];
  message?: string;
}

/** A request the client refused to send (a read-only tab); it never reached the network. */
export class NotSentError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(message);
    this.name = 'NotSentError';
    this.path = path;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly method: string;
  readonly errors: string[];
  readonly summary: string;
  readonly console: string[];

  constructor(init: ApiErrorInit) {
    const summary = init.summary?.trim() || init.errors?.[0] || init.message || httpStatusText(init.status);
    super(summary);
    this.name = 'ApiError';
    this.status = init.status;
    this.url = init.url;
    this.method = init.method ?? 'GET';
    this.errors = init.errors ?? [];
    this.summary = summary;
    this.console = init.console ?? [];
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

export function httpStatusText(status: number): string {
  switch (status) {
    case 0:
      return 'Network error';
    case 400:
      return 'Bad request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden - you do not hold the required privilege';
    case 404:
      return 'Not found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable';
    case 500:
      return 'Internal server error';
    default:
      return `HTTP ${status}`;
  }
}

interface RawEnvelope {
  status?: { Errors?: unknown; errors?: unknown; summary?: string } | string;
  errors?: unknown;
  summary?: string;
  console?: unknown;
}

function errorText(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const msg = [o.error, o.message, o.summary, o.text].find((v) => typeof v === 'string' && v) as
      string | undefined;
    const code = o.code;
    // IRIS texts carry their number ("ERROR #420: …", "FEHLER #420: …"): do not repeat it.
    if (msg) return code !== undefined && code !== '' && !msg.includes(`#${code}`) ? `${msg} (${code})` : msg;
    if (code !== undefined) return `Error code ${code}`;
    return JSON.stringify(e);
  }
  return e === undefined || e === null ? '' : String(e);
}

const MAX_TEXT = 300;

/**
 * A non-JSON error body as one readable line. Proxies and the Web Gateway answer with an
 * HTML page (nginx: `<title>502 Bad Gateway</title>…`); its title, or its text without the
 * markup, is what a person needs, not the page source.
 */
export function textFromBody(body: string): string {
  let text = body.trim();
  if (/^<(!doctype|html|head|body|\?xml)/i.test(text)) {
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1]?.trim();
    text =
      title ||
      text
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
  }
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/**
 * IRIS escapes its error texts for HTML inside the JSON ("<INVALID OREF>" arrives as
 * "&lt;INVALID OREF&gt;"). The texts are rendered as text, never as markup, so they are
 * unescaped here rather than shown with their entities.
 */
export function unescapeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Extract messages, summary and console lines from any of the observed envelope shapes. */
export function normalizeErrors(body: unknown): { errors: string[]; summary?: string; console: string[] } {
  if (typeof body === 'string') {
    const text = textFromBody(body);
    return { errors: text ? [text] : [], console: [] };
  }
  const b = (body && typeof body === 'object' ? body : {}) as RawEnvelope;
  const status = typeof b.status === 'object' && b.status ? b.status : undefined;
  const raw = status?.Errors ?? status?.errors ?? b.errors ?? [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return {
    errors: list.map(errorText).filter(Boolean).map(unescapeHtml),
    summary: status?.summary || b.summary ? unescapeHtml(String(status?.summary || b.summary)) : undefined,
    console: Array.isArray(b.console) ? b.console.map(String) : [],
  };
}

/** Human readable one-liner for any thrown value. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.summary;
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Unknown error';
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
