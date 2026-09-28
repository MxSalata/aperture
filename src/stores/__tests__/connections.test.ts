import { describe, expect, it } from 'vitest';
import { baseUrlProblem, crossOriginWarning, normalizeBaseUrl } from '../connections';

describe('connection base URLs', () => {
  it('accepts an http(s) origin with an optional path', () => {
    expect(baseUrlProblem('http://iris.lan:52773')).toBeNull();
    // Another instance behind the same reverse proxy: a path prefix on this origin.
    expect(baseUrlProblem('/iris-b')).toBeNull();
    expect(baseUrlProblem('/iris-b/')).toBeNull();
    expect(baseUrlProblem('//iris-b')).toMatch(/single slash/);
    expect(baseUrlProblem('/iris-b?x=1')).toMatch(/query/);
    expect(normalizeBaseUrl('/iris-b/api/admin/')).toBe('/iris-b');
    expect(baseUrlProblem('https://gw.example.org/iris/')).toBeNull();
    expect(normalizeBaseUrl('https://gw.example.org/iris/api/admin/')).toBe('https://gw.example.org/iris');
  });

  it('refuses credentials, queries, fragments and other schemes', () => {
    expect(baseUrlProblem('http://_SYSTEM:SYS@iris.lan:52773')).toMatch(/credentials/);
    expect(baseUrlProblem('http://iris.lan:52773/?x=1')).toMatch(/query/);
    expect(baseUrlProblem('http://iris.lan:52773/#a')).toMatch(/fragment/);
    expect(baseUrlProblem('ftp://iris.lan')).toMatch(/http/);
    expect(baseUrlProblem('iris.lan:52773')).not.toBeNull();
  });
});

describe('a base URL on another origin', () => {
  const page = { origin: 'http://iris.lan:52773', csp: null };
  const policy = "default-src 'self'; connect-src 'self'; worker-src 'self'";

  it('says nothing for this origin or a path prefix', () => {
    expect(crossOriginWarning('', page)).toBeNull();
    expect(crossOriginWarning('/iris-b', page)).toBeNull();
    expect(crossOriginWarning('http://iris.lan:52773/iris', page)).toBeNull();
  });

  it('names the missing CORS headers, and the build policy only when there is one that refuses it', () => {
    const plain = crossOriginWarning('https://gw.example.org/iris', page)!;
    expect(plain).toMatch(/^https:\/\/gw\.example\.org is another origin/);
    expect(plain).toMatch(/CORS/);
    expect(plain).not.toMatch(/Content-Security-Policy/);
    expect(crossOriginWarning('https://gw.example.org/iris', { ...page, csp: policy })).toMatch(
      /Content-Security-Policy also allows calls to its own origin only/,
    );
    // A build with VITE_CONNECT_SRC naming the origin.
    const allowed = crossOriginWarning('https://gw.example.org', {
      ...page,
      csp: "connect-src 'self' https://gw.example.org",
    })!;
    expect(allowed).not.toMatch(/Content-Security-Policy/);
  });
});
