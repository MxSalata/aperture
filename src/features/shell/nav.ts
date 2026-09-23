import {
  IconActivity,
  IconAddressBook,
  IconAppWindow,
  IconArrowsExchange,
  IconBook,
  IconCertificate,
  IconClipboardList,
  IconCpu,
  IconDatabase,
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
  IconWorld,
  IconPlug,
  type Icon,
} from '@tabler/icons-react';

export interface NavItem {
  label: string;
  to: string;
  icon: Icon;
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
        privileges: ['%Admin_Operate:U'],
        description: 'Live system health, performance and license usage',
        keywords: ['home', 'monitor', 'stats'],
      },
      {
        label: 'Job Center',
        to: '/jobs',
        icon: IconClipboardList,
        privileges: ['%Admin_Operate:U'],
        description: 'Long-running operations queued through the API',
        keywords: ['async', 'tasks', 'background'],
      },
      {
        label: 'Activity',
        to: '/activity',
        icon: IconHistory,
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
        // The spec says Manage or Operate; IRIS 2026.2 refuses the lists to %Operator (quirk
        // database-lists-need-manage).
        privileges: ['%Admin_Manage:U'],
        description: 'Database configuration, sizes, mount, compact, integrity check',
      },
      {
        label: 'Namespaces',
        to: '/namespaces',
        icon: IconLayoutGrid,
        privileges: ['%Admin_Manage:U'],
        description: 'Namespaces and their global, package and routine mappings',
      },
      {
        label: 'Processes',
        to: '/processes',
        icon: IconCpu,
        privileges: ['%Admin_Operate:U'],
        description: 'Running processes: examine, suspend, terminate, broadcast',
      },
      {
        label: 'Locks',
        to: '/locks',
        icon: IconLock,
        privileges: ['%Admin_Operate:U'],
        description: 'Lock table',
      },
      {
        label: 'Journals',
        to: '/journal',
        icon: IconBook,
        privileges: ['%Admin_Operate:U', '%Admin_Journal:U'],
        description: 'Journal files, records, settings and switching',
      },
      {
        label: 'Logs',
        to: '/logs',
        icon: IconLogs,
        privileges: [],
        description: 'Audit log, journal records, alerts.log and task history: every log the API exposes',
        keywords: ['messages', 'alerts', 'audit', 'journal', 'errors', 'history', 'events'],
      },
      {
        label: 'Tasks',
        to: '/tasks',
        icon: IconActivity,
        privileges: ['%Admin_Operate:U', '%Admin_Task:U'],
        description: 'Task manager schedules and history',
        keywords: ['schedule', 'cron'],
      },
      {
        label: 'Web sessions',
        to: '/web-sessions',
        icon: IconWorld,
        privileges: ['%Admin_Operate:U'],
        description: 'Active CSP/REST sessions',
      },
      {
        label: 'License',
        to: '/license',
        icon: IconLicense,
        privileges: ['%Admin_Manage:U', '%Admin_Operate:U'],
        description: 'License key, usage and license servers',
      },
      {
        label: 'Host monitor',
        to: '/monitor',
        icon: IconHeartRateMonitor,
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
        privileges: ['%Admin_Secure:U'],
        description: 'User accounts, roles, passwords',
      },
      {
        label: 'Roles',
        to: '/security/roles',
        icon: IconUserShield,
        privileges: ['%Admin_Secure:U'],
        description: 'Roles and the resources they grant',
      },
      {
        label: 'Resources',
        to: '/security/resources',
        icon: IconKey,
        privileges: ['%Admin_Secure:U'],
        description: 'Protected resources and public permissions',
      },
      {
        label: 'Services',
        to: '/security/services',
        icon: IconPlug,
        privileges: ['%Admin_Secure:U'],
        description: 'System services such as %Service_Bindings',
      },
      {
        label: 'Web applications',
        to: '/security/web-apps',
        icon: IconAppWindow,
        privileges: ['%Admin_Secure:U'],
        description: 'CSP and REST applications, JWT and CORS settings',
      },
      {
        label: 'Audit',
        to: '/security/audit',
        icon: IconListSearch,
        privileges: ['%Admin_Secure:U'],
        description: 'Audit events and the audit log',
      },
      {
        label: 'TLS & certificates',
        to: '/security/ssl',
        icon: IconCertificate,
        privileges: ['%Admin_Secure:U'],
        description: 'SSL/TLS configurations and X.509 credentials with certificate expiry',
        keywords: ['ssl', 'x509', 'certificate', 'expiry', 'expired'],
      },
      {
        label: 'SQL privileges',
        to: '/security/sql',
        icon: IconTable,
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
        privileges: [],
        description: 'Every operation in the SysAdmin API, generated from the OpenAPI spec',
        keywords: ['openapi', 'swagger', 'spec', 'ecp', 'wallet', 'oauth', 'ldap', 'device', 'docdb'],
      },
      {
        label: 'Connections',
        to: '/settings/connections',
        icon: IconServer,
        privileges: [],
        description: 'Saved IRIS instances',
      },
      { label: 'About', to: '/about', icon: IconFileText, privileges: [], description: 'About Aperture' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items);

export const NAV_ICON_FALLBACK = IconAddressBook;
export const SHIELD_ICON = IconShieldLock;
