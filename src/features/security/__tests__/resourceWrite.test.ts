import { beforeEach, describe, expect, it } from 'vitest';
import { api, result } from '@/api/hooks';
import { resetClients } from '@/api/client';
import { resetDb } from '@/mocks/db';
import { useSession } from '@/stores/session';
import { NotKeptError, putResource, unkeptFields } from '../resourceWrite';

const signIn = () =>
  useSession.getState().login({
    connectionId: 't',
    baseUrl: 'http://iris.test',
    username: '_SYSTEM',
    password: 'SYS',
    auth: 'basic',
  });

const read = (name: string) =>
  result(api().GET('/v2/security/resource', { params: { query: { name } } })) as Promise<{
    Description?: string;
  }>;

describe('unkeptFields', () => {
  it('compares a permission as a set of letters and a description without outer spaces', () => {
    expect(unkeptFields({ PublicPermission: 'WR' }, { PublicPermission: 'RW' })).toEqual([]);
    expect(unkeptFields({ Description: ' Archive ' }, { Description: 'Archive' })).toEqual([]);
    expect(unkeptFields({ Description: 'New' }, { Description: 'Old', PublicPermission: 'R' })).toEqual([
      'Description',
    ]);
    // A field that was not sent is not checked.
    expect(unkeptFields({ Description: undefined }, { Description: 'Old' })).toEqual([]);
  });
});

describe('putResource', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    await signIn();
  });

  it('is done when the resource holds what was sent', async () => {
    await putResource('HL7.Archive', { Description: 'Archived HL7 messages' });
    expect((await read('HL7.Archive')).Description).toBe('Archived HL7 messages');
  });

  it('says what IRIS answered 200 to and did not keep', async () => {
    const before = (await read('HL7.Archive')).Description;
    await expect(putResource('HL7.Archive', { Description: 'x'.repeat(300) })).rejects.toSatisfy(
      (e: unknown) => e instanceof NotKeptError && e.fields.join() === 'Description',
    );
    expect((await read('HL7.Archive')).Description).toBe(before);
  });
});
