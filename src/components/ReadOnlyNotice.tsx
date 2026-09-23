import { Alert } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';

/** Why a dialog's action is disabled in a read-only tab, and how to leave it. */
export function ReadOnlyNotice() {
  return (
    <Alert color="orange" variant="light" icon={<IconLock size={16} />} title="This tab is read-only">
      It sends nothing that changes the instance. Turn read-only off in the account menu to go on.
    </Alert>
  );
}
