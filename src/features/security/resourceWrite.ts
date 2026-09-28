import { api, result, run } from '@/api/hooks';
import { queryClient } from '@/query';
import { secKeys } from './keys';

export type ResourceBody = { Description?: string; PublicPermission?: string };

/** A resource's description holds 256 characters at most (Security.Resources, MAXLEN = 256). */
export const DESCRIPTION_MAX = 256;

/** What IRIS answered 200 to and did not store. */
export class NotKeptError extends Error {
  constructor(
    readonly resource: string,
    readonly fields: string[],
  ) {
    super(
      `IRIS answered 200 but did not keep the ${fields.join(' and ')} of ${resource} as sent; the list shows what it holds now. A description longer than ${DESCRIPTION_MAX} characters is one value it does not store, without an error.`,
    );
    this.name = 'NotKeptError';
  }
}

/** A permission compares as a set of letters ("WR" is "RW"), a description without outer spaces. */
const normal = (key: string, value: unknown) =>
  key === 'PublicPermission' ? [...String(value ?? '')].sort().join('') : String(value ?? '').trim();

/** The fields of `sent` that `stored` does not hold. */
export function unkeptFields(sent: ResourceBody, stored: Record<string, unknown> | undefined): string[] {
  return (Object.keys(sent) as (keyof ResourceBody)[]).filter(
    (key) => sent[key] !== undefined && normal(key, stored?.[key]) !== normal(key, sent[key]),
  );
}

/**
 * PUT /v2/security/resource, then the resource read back. IRIS can answer 200 and keep nothing (a
 * description of 300 characters, reported by OcuPilot on IRIS for Health 2026.2), so a write is done
 * only when the resource holds what was sent; otherwise the error names what IRIS did not keep.
 */
export async function putResource(name: string, body: ResourceBody) {
  const answer = await run(api().PUT('/v2/security/resource', { params: { query: { name } }, body }), 'PUT');
  const stored = (await result(
    api().GET('/v2/security/resource', { params: { query: { name } } }),
  )) as Record<string, unknown>;
  const unkept = unkeptFields(body, stored);
  if (unkept.length) {
    void queryClient.invalidateQueries({ queryKey: secKeys.resources });
    throw new NotKeptError(name, unkept);
  }
  return answer;
}
