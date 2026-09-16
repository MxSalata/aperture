import { describe, expect, it } from 'vitest';
import { jobIdFromLocation, isTerminal } from '../jobs';

describe('jobs store helpers', () => {
  it('extracts the task id from relative and absolute Location headers', () => {
    expect(jobIdFromLocation('/iris/api/admin/v1/async-result?id=123456789')).toBe('123456789');
    expect(jobIdFromLocation('http://iris:52773/api/admin/v2/async-result?id=42&x=1')).toBe('42');
    expect(jobIdFromLocation(null)).toBeNull();
    expect(jobIdFromLocation('/no-id')).toBeNull();
  });
  it('knows terminal states', () => {
    expect(isTerminal('Finished')).toBe(true);
    expect(isTerminal('Canceled')).toBe(true);
    expect(isTerminal('Running')).toBe(false);
    expect(isTerminal(undefined)).toBe(false);
  });
});
