import {
  IconActivity,
  IconAddressBook,
  IconAppWindow,
  IconApi,
  IconArrowsExchange,
  IconBook,
  IconCertificate,
  IconClipboardList,
  IconCpu,
  IconDatabase,
  IconDevices,
  IconFileText,
  IconGauge,
  IconHistory,
  IconHeartRateMonitor,
  IconKey,
  IconLayoutGrid,
  IconLicense,
  IconListSearch,
  IconLock,
  IconLogs,
  IconServer,
  IconShieldLock,
  IconTable,
  IconUsers,
  IconUserShield,
  IconWallet,
  IconWorld,
  IconPlug,
  type Icon,
} from '@tabler/icons-react';

/** The colours an entry's icon may take: Mantine colour names with a contrast-tuned `-text` token in styles.css. */
export const NAV_COLORS = [
  'teal',
  'indigo',
  'grape',
  'green',
  'violet',
  'blue',
  'cyan',
  'red',
  'orange',
  'yellow',
  'lime',
  'pink',
  'gray',
] as const;
export type NavColor = (typeof NAV_COLORS)[number];

export interface NavItem {
  label: string;
  to: string;
  icon: Icon;
  /**
   * The icon's colour, drawn through `--mantine-color-<name>-text` (4.5:1 on every surface of
   * every scheme, so 3:1 for the icon holds; high contrast draws it in the text colour). Meaning
   * where it helps (security cool, logs and alerts warm, storage green), neighbours different.
   */
  color: NavColor;
  /** Any of these resources grants access. */
  privileges: string[];
  description?: string;
  keywords?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        to: '/',
        icon: IconGauge,
        color: 'teal',
        privileges: ['%Admin_Operate:U'],
        description: 'Live system health, performance and license usage',
        keywords: ['home', 'monitor', 'stats'],
      },
      {
        label: 'Job Center',
        to: '/jobs',
        icon: IconClipboardList,
        color: 'indigo',
        privileges: ['%Admin_Operate:U'],
        description: 'Long-running operations queued through the API',
        keywords: ['async', 'tasks', 'background'],
      },
      {
        label: 'Activity',
        to: '/activity',
        icon: IconHistory,
        color: 'grape',
        privileges: [],
        description: 'Changes sent from this tab and what the server answered',
        keywords: ['history', 'log', 'changes'],
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Databases',
        to: '/databases',
        icon: IconDatabase,
        color: 'green',
        // The spec says Manage or Operate; IRIS 2026.2 refuses the lists to %Operator (quirk
        // database-lists-need-manage).
        privileges: ['%Admin_Manage:U'],
        description: 'Database configuration, sizes, mount, compact, integrity check',
      },
      {
        label: 'Namespaces',
        to: '/namespaces',
        icon: IconLayoutGrid,
        color: 'violet',
        privileges: ['%Admin_Manage:U'],
        description: 'Namespaces and their global, package and routine mappings',
      },
      {
        label: 'Processes',
        to: '/processes',
        icon: IconCpu,
        color: 'blue',
        privileges: ['%Admin_Operate:U'],
        description: 'Running processes: examine, suspend, terminate, broadcast',
      },
      {
        label: 'Devices',
        to: '/devices',
        icon: IconDevices,
        color: 'cyan',
        privileges: ['%Admin_Manage:U'],
        description: 'Terminal, printer, spool and tape devices and their settings',
        keywords: ['terminal', 'printer', 'spool', 'tape', 'telnet'],
      },
      {
        label: 'Locks',
        to: '/locks',
        icon: IconLock,
        color: 'red',
        privileges: ['%Admin_Operate:U'],
        description: 'Lock table',
      },
      {
        label: 'Journals',
        to: '/journal',
        icon: IconBook,
        color: 'orange',
        privileges: ['%Admin_Operate:U', '%Admin_Journal:U'],
        description: 'Journal files, records, settings and switching',
      },
      {
        label: 'Logs',
        to: '/logs',
        icon: IconLogs,
        color: 'yellow',
        privileges: [],
        description: 'messages.log, alerts.log, the audit log, journal records and task history in one place',
        keywords: [
          'messages',
          'messages.log',
          'alerts',
          'audit',
          'journal',
          'errors',
          'history',
          'events',
          'console',
        ],
      },
      {
        label: 'Tasks',
        to: '/tasks',
        icon: IconActivity,
        color: 'indigo',
        privileges: ['%Admin_Operate:U', '%Admin_Task:U'],
        description: 'Task manager schedules and history',
        keywords: ['schedule', 'cron'],
      },
      {
        label: 'Web sessions',
        to: '/web-sessions',
        icon: IconWorld,
        color: 'cyan',
        privileges: ['%Admin_Operate:U'],
        description: 'Active CSP/REST sessions',
      },
      {
        label: 'License',
        to: '/license',
        icon: IconLicense,
        color: 'lime',
        privileges: ['%Admin_Manage:U', '%Admin_Operate:U'],
        description: 'License key, usage and license servers',
      },
      {
        label: 'Host monitor',
        to: '/monitor',
        icon: IconHeartRateMonitor,
        color: 'pink',
        privileges: [],
        description: 'CPU, memory, disk and alerts from /api/monitor',
        keywords: ['metrics', 'prometheus', 'cpu', 'memory', 'disk', 'alerts'],
      },
    ],
  },
  {
    label: 'Security',
    items: [
      {
        label: 'Users',
        to: '/security/users',
        icon: IconUsers,
        color: 'indigo',
        privileges: ['%Admin_Secure:U'],
        description: 'User accounts, roles, passwords',
      },
      {
        label: 'Roles',
        to: '/security/roles',
        icon: IconUserShield,
        color: 'violet',
        privileges: ['%Admin_Secure:U'],
        description: 'Roles and the resources they grant',
      },
      {
        label: 'Resources',
        to: '/security/resources',
        icon: IconKey,
        color: 'grape',
        privileges: ['%Admin_Secure:U'],
        description: 'Protected resources and public permissions',
      },
      {
        label: 'Services',
        to: '/security/services',
        icon: IconPlug,
        color: 'blue',
        privileges: ['%Admin_Secure:U'],
        description: 'System services such as %Service_Bindings',
      },
      {
        label: 'Web applications',
        to: '/security/web-apps',
        icon: IconAppWindow,
        color: 'cyan',
        privileges: ['%Admin_Secure:U'],
        description: 'CSP and REST applications, JWT and CORS settings',
      },
      {
        label: 'Audit',
        to: '/security/audit',
        icon: IconListSearch,
        color: 'orange',
        privileges: ['%Admin_Secure:U'],
        description: 'Audit events and the audit log',
      },
      {
        label: 'TLS & certificates',
        to: '/security/ssl',
        icon: IconCertificate,
        color: 'teal',
        privileges: ['%Admin_Secure:U'],
        description: 'SSL/TLS configurations and X.509 credentials with certificate expiry',
        keywords: ['ssl', 'x509', 'certificate', 'expiry', 'expired'],
      },
      {
        label: 'Wallet & OAuth',
        to: '/security/secrets',
        icon: IconWallet,
        color: 'yellow',
        privileges: [
          '%Admin_Wallet:U',
          '%Admin_OAuth2_Client:U',
          '%Admin_OAuth2_Server:U',
          '%Admin_OAuth2_Registration:U',
          '%Admin_Secure:U',
        ],
        description:
          'Wallet collections and write-only secrets; OAuth 2.0 server, client and resource server configurations',
        keywords: ['wallet', 'secret', 'oauth', 'oauth2', 'oidc', 'client', 'resource server', 'issuer'],
      },
      {
        label: 'SQL privileges',
        to: '/security/sql',
        icon: IconTable,
        color: 'pink',
        privileges: ['%Admin_Secure:U'],
        description: 'Table, view and admin privileges per user or role',
      },
    ],
  },
  {
    label: 'Everything else',
    items: [
      {
        label: 'API Explorer',
        to: '/explorer',
        icon: IconArrowsExchange,
        color: 'teal',
        privileges: [],
        description:
          'Every operation in the SysAdmin API, generated from the OpenAPI spec; export as Postman or .http',
        keywords: [
          'openapi',
          'swagger',
          'spec',
          'ecp',
          'wallet',
          'oauth',
          'ldap',
          'device',
          'docdb',
          'postman',
          'curl',
          'http file',
          'export',
        ],
      },
      {
        label: 'REST services',
        to: '/rest-services',
        icon: IconApi,
        color: 'blue',
        privileges: [],
        description:
          'The REST applications of the instance and their routes, from /api/mgmnt; export as Postman or .http',
        keywords: [
          'rest',
          'openapi',
          'swagger',
          'mgmnt',
          'routes',
          'endpoints',
          'dispatch',
          'postman',
          'curl',
          'export',
        ],
      },
      {
        label: 'Connections',
        to: '/settings/connections',
        icon: IconServer,
        color: 'gray',
        privileges: [],
        description: 'Saved IRIS instances',
      },
      {
        label: 'About',
        to: '/about',
        icon: IconFileText,
        color: 'grape',
        privileges: [],
        description: 'About Aperture',
      },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items);

export const NAV_ICON_FALLBACK = IconAddressBook;
export const SHIELD_ICON = IconShieldLock;
