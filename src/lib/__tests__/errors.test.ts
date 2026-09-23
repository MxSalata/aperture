import { describe, expect, it } from 'vitest';
import { normalizeErrors, ApiError, unescapeHtml } from '../errors';

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

describe('errors as IRIS for Health 2026.2 answers them', () => {
  it('reads a 404 without repeating the code the text already names', () => {
    // GET /v2/namespace?name=APERTURE_DOES_NOT_EXIST, verbatim.
    const body = {
      status: {
        errors: [
          {
            error: 'ERROR #420: Namespace APERTURE_DOES_NOT_EXIST does not exist',
            code: 420,
            domain: '%ObjectErrors',
            id: 'CPFNameDoesNotExist',
            params: ['Namespace', 'APERTURE_DOES_NOT_EXIST'],
          },
        ],
        summary: 'ERROR #420: Namespace APERTURE_DOES_NOT_EXIST does not exist',
      },
      console: [],
      result: {},
    };
    const n = normalizeErrors(body);
    expect(n.errors).toEqual(['ERROR #420: Namespace APERTURE_DOES_NOT_EXIST does not exist']);
    expect(n.summary).toBe('ERROR #420: Namespace APERTURE_DOES_NOT_EXIST does not exist');
  });

  it('falls back to the status text for a 403, which carries none', () => {
    // GET /v2/databases as %Operator, verbatim.
    const n = normalizeErrors({ status: { errors: [], summary: '' }, console: [], result: {} });
    expect(n.errors).toEqual([]);
    expect(new ApiError({ status: 403, url: '', errors: n.errors, summary: n.summary }).summary).toMatch(
      /Forbidden/,
    );
  });
});

describe('error texts IRIS escaped for HTML', () => {
  it('shows <INVALID OREF> rather than &lt;INVALID OREF&gt;', () => {
    // GET /v2/security/ldap/configurations as %Operator on IRIS for Health 2026.2, verbatim.
    const text =
      'ERROR #5002: ObjectScript error: &lt;INVALID OREF&gt;AppendStatementResult+5^%Api.Admin.Util.ClassQuery.1';
    const n = normalizeErrors({
      status: {
        errors: [{ error: text, code: 5002, domain: '%ObjectErrors', id: 'ObjectScriptError', params: [] }],
        summary: text,
      },
      console: [],
      result: [],
    });
    const plain =
      'ERROR #5002: ObjectScript error: <INVALID OREF>AppendStatementResult+5^%Api.Admin.Util.ClassQuery.1';
    expect(n.errors).toEqual([plain]);
    expect(n.summary).toBe(plain);
  });

  it('decodes numeric entities and leaves unknown ones alone', () => {
    expect(unescapeHtml('a &amp; b &#60;x&#x3e; &unknown;')).toBe('a & b <x> &unknown;');
  });
});
