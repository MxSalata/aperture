export const secKeys = {
  users: ['security', 'users'] as const,
  user: (n: string) => ['security', 'users', n] as const,
  roles: ['security', 'roles'] as const,
  role: (n: string) => ['security', 'roles', n] as const,
  resources: ['security', 'resources'] as const,
  services: ['security', 'services'] as const,
  webApps: ['security', 'web-apps'] as const,
  webApp: (n: string) => ['security', 'web-apps', n] as const,
  auditEnabled: ['security', 'audit', 'enabled'] as const,
  auditEvents: ['security', 'audit', 'events'] as const,
  ssl: ['security', 'ssl'] as const,
  sslOne: (n: string) => ['security', 'ssl', n] as const,
  x509: ['security', 'x509'] as const,
  x509Cert: (alias: string) => ['security', 'x509', alias, 'certificate'] as const,
  sqlPrivs: (ns: string, grantee: string) => ['security', 'sql', ns, grantee] as const,
  walletCollections: ['security', 'wallet', 'collections'] as const,
  walletSecrets: (collection: string) => ['security', 'wallet', 'secrets', collection] as const,
  oauthServer: ['security', 'oauth2', 'server'] as const,
  oauthServerClients: ['security', 'oauth2', 'server', 'clients'] as const,
  oauthServerClient: (id: string) => ['security', 'oauth2', 'server', 'clients', id] as const,
  oauthDefinitions: ['security', 'oauth2', 'definitions'] as const,
  oauthDefinition: (id: string) => ['security', 'oauth2', 'definitions', id] as const,
  oauthClientConfigs: (serverId: string) =>
    ['security', 'oauth2', 'client-configurations', serverId] as const,
  oauthClientConfig: (name: string) => ['security', 'oauth2', 'client-configuration', name] as const,
  oauthResourceServers: ['security', 'oauth2', 'resource-servers'] as const,
  oauthResourceServer: (name: string) => ['security', 'oauth2', 'resource-servers', name] as const,
};

/**
 * AutheEnabled bit flags (Security.Applications / Security.Services), numbered as the
 * specification's `Service.AutheEnabled` documents them: bit 4 OS, 5 password,
 * 6 unauthenticated, 11 LDAP, 13 delegated, 14 login token. The field carries more bits
 * than these (Kerberos variants, two-factor 20/21, mutual TLS 25, …); `applyFlags` keeps them.
 */
export const AUTHE_FLAGS: { bit: number; label: string; hint: string }[] = [
  { bit: 32, label: 'Password', hint: 'IRIS username/password' },
  { bit: 64, label: 'Unauthenticated', hint: 'Anonymous access as UnknownUser' },
  { bit: 16, label: 'OS', hint: 'Operating-system authentication' },
  { bit: 1, label: 'Kerberos (K5 cache)', hint: 'Kerberos credentials cache' },
  { bit: 2048, label: 'LDAP', hint: 'LDAP directory' },
  { bit: 8192, label: 'Delegated', hint: 'ZAUTHENTICATE routine' },
  { bit: 16384, label: 'Login token', hint: 'Login token (2FA flows)' },
];

/** Every bit the checkboxes above can show; the rest of an AutheEnabled value is not the form's to change. */
const SHOWN_BITS = AUTHE_FLAGS.reduce((a, f) => a | f.bit, 0);

export function flagsToBits(flags: number[]): number {
  return flags.reduce((a, b) => a | b, 0);
}

export function bitsToFlags(bits: number | undefined): number[] {
  const v = bits ?? 0;
  return AUTHE_FLAGS.map((f) => f.bit).filter((b) => (v & b) === b);
}

/**
 * The AutheEnabled to send after an edit: the ticked flags, plus every bit of the original
 * value the form does not show. Rebuilding the value from the checkboxes alone would silently
 * switch off two-factor, Kerberos or mutual TLS on any save.
 */
export function applyFlags(original: number | undefined, flags: number[]): number {
  return ((original ?? 0) & ~SHOWN_BITS) | flagsToBits(flags);
}

/**
 * Whether a row of GET /v2/security/services is enabled. IRIS 2026.2 answers `Enabled` as a
 * boolean and sends no `EnabledBoolean`; the specification declares `Enabled` as a string
 * ("Yes" / "No") next to a boolean `EnabledBoolean`. Reading only `EnabledBoolean` showed every
 * service of a real instance as disabled.
 */
export function serviceEnabled(row: { Enabled?: unknown; EnabledBoolean?: unknown }): boolean {
  if (typeof row.Enabled === 'boolean') return row.Enabled;
  if (typeof row.EnabledBoolean === 'boolean') return row.EnabledBoolean;
  return /^(yes|true|1)$/i.test(String(row.Enabled ?? ''));
}

export type Exposure = 'open' | 'gated' | null;

/**
 * How a web application answers someone who has not signed in. `open`: it is enabled, accepts
 * unauthenticated requests and requires no resource, so anyone who reaches the web server gets
 * in (as UnknownUser). `gated`: unauthenticated requests are accepted but the application's
 * resource must be held (by UnknownUser). null: sign-in is required, or it is disabled.
 */
export function webAppExposure(app: {
  Enabled?: boolean;
  AuthenticationMethods?: string[];
  Resource?: string;
}): Exposure {
  if (!app.Enabled) return null;
  if (!(app.AuthenticationMethods ?? []).some((m) => /^unauthenticated$/i.test(m))) return null;
  return app.Resource ? 'gated' : 'open';
}
