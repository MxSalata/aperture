import { parseLogLine } from './messagesLog';

/**
 * Wording vectors for messages.log entries: the twin of ipm/python/aperture_vectors.py, which
 * the package runs on the instance; this one serves the demo's mock. Both must give the same
 * vector for the same text, and ipm/python/tests/fixture.json holds the cases both test suites
 * check. An entry becomes a template (time, pid and severity dropped; lower-cased; file paths
 * <path>, hexadecimal ids <h>, numbers <n>); its words and neighbouring word pairs are hashed
 * (FNV-1a, 32 bits) into 256 buckets with a sign from the next bit, weighted 1 + ln(count), and
 * the vector is normalised to unit length, so cosine similarity is a dot product.
 */
export const VECTOR_DIMS = 256;
const DECIMALS = 6;

const WINDOWS_PATH = /[a-z]:\\[^\s]+/g;
const POSIX_PATH = /(?:\/[^\s/]+){2,}\/?/g;
const HEX_PREFIXED = /\b0x[0-9a-f]+\b/g;
const HEX_ID = /\b(?=[0-9a-f]{6,}\b)(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]+\b/g;
const NUMBER = /\d+(?:[.,]\d+)*/g;
const TOKEN = /[a-z0-9_<>#%.]+/g;

/** The template of an entry's text: what the vector is made of. */
export function normaliseLogText(text: string): string {
  const lines = text.split('\n');
  const parsed = lines.length ? parseLogLine(lines[0]) : null;
  let body: string;
  if (parsed) {
    body = `${parsed.category} ${parsed.message}`;
    if (lines.length > 1) body += `\n${lines.slice(1).join('\n')}`;
  } else body = text;
  const t = body
    .toLowerCase()
    .replace(WINDOWS_PATH, '<path>')
    .replace(POSIX_PATH, '<path>')
    .replace(HEX_PREFIXED, '<h>')
    .replace(HEX_ID, '<h>')
    .replace(NUMBER, '<n>');
  const tokens = (t.match(TOKEN) ?? []).map((tok) => tok.replace(/^\.+|\.+$/g, ''));
  return tokens.filter(Boolean).join(' ');
}

/** Counts of the words and neighbouring word pairs of a template. */
export function logFeatures(template: string): Map<string, number> {
  const tokens = template ? template.split(' ') : [];
  const counts = new Map<string, number>();
  for (const tok of tokens) counts.set(tok, (counts.get(tok) ?? 0) + 1);
  for (let i = 0; i + 1 < tokens.length; i++) {
    const pair = `${tokens[i]} ${tokens[i + 1]}`;
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

const encoder = new TextEncoder();

/** FNV-1a over the UTF-8 bytes, 32 bits. */
export function fnv1a32(text: string): number {
  let h = 2166136261;
  for (const byte of encoder.encode(text)) h = Math.imul(h ^ byte, 16777619) >>> 0;
  return h;
}

/** The unit vector of an entry's wording, all zeros for an empty template. */
export function vectoriseLogText(text: string): number[] {
  const v = new Array<number>(VECTOR_DIMS).fill(0);
  const counts = logFeatures(normaliseLogText(text));
  // Sorted, so the sums happen in the same order as in Python and the doubles come out equal.
  for (const feature of [...counts.keys()].sort()) {
    const h = fnv1a32(feature);
    const bucket = h & (VECTOR_DIMS - 1);
    const sign = (h >>> 8) & 1 ? -1 : 1;
    v[bucket] += sign * (1 + Math.log(counts.get(feature)!));
  }
  const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

/** The vector as TO_VECTOR takes it: comma-separated, six decimals, no negative zero. */
export function vectorLiteral(vector: number[]): string {
  const zero = (0).toFixed(DECIMALS);
  return vector.map((x) => (x.toFixed(DECIMALS) === `-${zero}` ? zero : x.toFixed(DECIMALS))).join(',');
}

/** Cosine similarity (the dot product for unit vectors). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
