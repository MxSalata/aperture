import { describe, expect, it } from 'vitest';
import { baseUrlProblem, normalizeBaseUrl } from '../connections';

describe('connection base URLs', () => {
  it('accepts an http(s) origin with an optional path', () => {
    expect(baseUrlProblem('http://iris.lan:52773')).toBeNull();
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
