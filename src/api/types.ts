import type { components, paths } from './schema';

export type Schemas = components['schemas'];
export type Paths = paths;

export type Info = Schemas['Info'];
export type Privileges = NonNullable<Info['privileges']>;
export type PrivilegeKey = keyof Privileges;

export type AsyncTask = Schemas['AsyncTask'];
export type AsyncTaskState = NonNullable<Schemas['AsyncTaskBase']['State']>;
export type AsyncTaskList = Schemas['AsyncTaskList'];

export type MainDashboardStats = Schemas['MainDashboardStats'];
export type SystemUsageStats = Schemas['SystemUsageStats'];
export type SharedMemoryUsage = Schemas['SharedMemoryUsage'];
export type LicenseUsage = Schemas['LicenseUsage'];

export type ConfigDatabase = Schemas['ConfigDatabase'];
export type ConfigDatabaseList = Schemas['ConfigDatabaseList'];
export type LocalDatabase = Schemas['LocalDatabase'];
export type LocalDatabaseList = Schemas['LocalDatabaseList'];
export type VolumeFiles = Schemas['VolumeFiles'];

export type Namespace = Schemas['Namespace'];
export type NamespaceList = Schemas['NamespaceList'];
export type GlobalMappingList = Schemas['GlobalMappingList'];
export type PackageMappingList = Schemas['PackageMappingList'];
export type RoutineMappingList = Schemas['RoutineMappingList'];

export type Process = Schemas['Process'];
export type ProcessList = Schemas['ProcessList'];
export type LockList = Schemas['LockList'];
export type WebSessionList = Schemas['WebSessionList'];

export type JournalFile = Schemas['JournalFile'];
export type JournalFileList = Schemas['JournalFileList'];
export type JournalSettings = Schemas['JournalSettings'];
export type JournalRecord = Schemas['JournalRecord'];

export type Task = Schemas['Task'];
export type TaskList = Schemas['TaskList'];
export type TaskHistory = Schemas['TaskHistory'];
export type TaskExtraInfo = Schemas['TaskExtraInfo'];
export type UpcomingTasks = Schemas['UpcomingTasks'];

export type User = Schemas['User'];
export type UserList = Schemas['UserList'];
export type Role = Schemas['Role'];
export type RoleList = Schemas['RoleList'];
export type Resource = Schemas['Resource'];
export type ResourceList = Schemas['ResourceList'];
export type Service = Schemas['Service'];
export type ServiceList = Schemas['ServiceList'];
export type Application = Schemas['Application'];
export type WebApplicationList = Schemas['WebApplicationList'];
export type AuditEventList = Schemas['AuditEventList'];
export type AuditRecord = Schemas['AuditRecord'];
export type SSLConfig = Schemas['SSLConfig'];
export type SSLConfigurationList = Schemas['SSLConfigurationList'];
export type X509Credential = Schemas['X509Credential'];
export type X509CredentialsList = Schemas['X509CredentialsList'];
export type X509CredentialCertificate = Schemas['X509CredentialCertificate'];
export type SQLPrivilegeList = Schemas['SQLPrivilegeList'];
export type Licensing = Schemas['Licensing'];
