import type { Role } from '@/api/types';

export type RoleResource = NonNullable<Role['Resources']>[number];

/**
 * A role's grants as `Resource:Permissions` tags for the editor. The API sends objects
 * (`{ Name, Permissions }`, the spec's shape, confirmed on IRIS 2026.2 by the iris-fieldwork
 * verification record); a `Resource:RW` string is accepted too, so an unexpected shape
 * shows up as data instead of breaking the form.
 */
export function resourcesToTags(resources: unknown): string[] {
  if (!Array.isArray(resources)) return [];
  return resources
    .map((r) => {
      if (typeof r === 'string') return r;
      const { Name, Permissions } = (r ?? {}) as RoleResource;
      return Name ? `${Name}:${Permissions ?? ''}` : '';
    })
    .filter(Boolean);
}

/** Tags back to the API's shape; permissions are upper-cased, a tag without `:` grants nothing. */
export function tagsToResources(tags: string[]): RoleResource[] {
  return tags.map((tag) => {
    const i = tag.lastIndexOf(':');
    return i > 0
      ? {
          Name: tag.slice(0, i).trim(),
          Permissions: tag
            .slice(i + 1)
            .trim()
            .toUpperCase(),
        }
      : { Name: tag.trim(), Permissions: '' };
  });
}
