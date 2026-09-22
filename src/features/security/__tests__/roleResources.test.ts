import { describe, expect, it } from 'vitest';
import { resourcesToTags, tagsToResources } from '../roleResources';

describe('role resource grants', () => {
  it('shows the API objects as Resource:Permissions tags and writes them back', () => {
    const api = [
      { Name: '%DB_USER', Permissions: 'RW' },
      { Name: '%Admin_Operate', Permissions: 'U' },
    ];
    expect(resourcesToTags(api)).toEqual(['%DB_USER:RW', '%Admin_Operate:U']);
    expect(tagsToResources(resourcesToTags(api))).toEqual(api);
  });

  it('tolerates string grants and bad input, and normalises what is typed', () => {
    expect(resourcesToTags(['%DB_USER:RW', { Name: '' }, null])).toEqual(['%DB_USER:RW']);
    expect(resourcesToTags(undefined)).toEqual([]);
    expect(tagsToResources(['%DB_X: rw ', 'NoPerm'])).toEqual([
      { Name: '%DB_X', Permissions: 'RW' },
      { Name: 'NoPerm', Permissions: '' },
    ]);
  });
});
