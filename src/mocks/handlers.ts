import { generalHandlers } from './handlers/general';
import { monitorHandlers } from './handlers/monitor';
import { asyncHandlers } from './handlers/asyncResult';
import { databaseHandlers } from './handlers/databases';
import { namespaceHandlers } from './handlers/namespaces';
import { processHandlers } from './handlers/processes';
import { journalHandlers } from './handlers/journal';
import { taskHandlers } from './handlers/tasks';
import { securityHandlers } from './handlers/security';
import { webAppHandlers } from './handlers/webapps';
import { licenseHandlers } from './handlers/license';
import { genericHandler } from './handlers/generic';

/** Order matters: specific handlers first, the spec-driven fallback last. */
export const handlers = [
  ...generalHandlers,
  ...monitorHandlers,
  ...asyncHandlers,
  ...databaseHandlers,
  ...namespaceHandlers,
  ...processHandlers,
  ...journalHandlers,
  ...taskHandlers,
  ...securityHandlers,
  ...webAppHandlers,
  ...licenseHandlers,
  genericHandler,
];
