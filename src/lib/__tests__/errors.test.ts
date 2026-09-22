import { describe, expect, it } from 'vitest';
import { normalizeErrors, ApiError } from '../errors';

describe('normalizeErrors', () => {
  it('reads the documented status.Errors strings', () => {
    expect(
      normalizeErrors({ status: { Errors: ['Denied', 'Second'], summary: 'Forbidden' }, console: ['x'] }),
    ).toEqual({ errors: ['Denied', 'Second'], summary: 'Forbidden', console: ['x'] });
  });
  it('reads the observed status.errors objects with codes', () => {
    const n = normalizeErrors({ status: { errors: [{ code: 40300 }, { error: 'Bad thing', code: 5001 }] } });
    expect(n.errors).toEqual(['Error code 40300', 'Bad thing (5001)']);
    expect(n.summary).toBeUndefined();
  });
  it('reads classic %CSP.REST top-level errors', () => {
    expect(
      normalizeErrors({ errors: [{ error: 'ERROR #5001: nope', code: 5001 }], summary: 'nope' }).summary,
    ).toBe('nope');
  });
  it('tolerates strings, empty and malformed bodies', () => {
    expect(normalizeErrors('Not Found')).toEqual({ errors: ['Not Found'], console: [] });
    expect(normalizeErrors(null).errors).toEqual([]);
    expect(normalizeErrors({ status: 'weird' }).errors).toEqual([]);
  });
  it('ApiError prefers summary, then first error, then HTTP text', () => {
    expect(new ApiError({ status: 403, url: '' }).summary).toMatch(/Forbidden/);
    expect(new ApiError({ status: 500, url: '', errors: ['boom'] }).summary).toBe('boom');
  });
});

describe('non-JSON error bodies', () => {
  it('turn a proxy error page into its title', async () => {
    const { normalizeErrors, textFromBody } = await import('../errors');
    const page =
      '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>';
    expect(normalizeErrors(page).errors).toEqual(['502 Bad Gateway']);
    expect(textFromBody('<!DOCTYPE html><html><body><p>Service <b>unavailable</b></p></body></html>')).toBe(
      'Service unavailable',
    );
    expect(textFromBody('x'.repeat(1000))).toHaveLength(300);
    expect(textFromBody('plain text')).toBe('plain text');
  });
});
