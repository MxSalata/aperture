import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useState } from 'react';
import { useAdminGuard, type GuardOutcome } from './AdminGuard';
import { ReadOnlyNotice } from './ReadOnlyNotice';
import { useReadOnly } from '@/stores/readOnly';

interface Options {
  title: string;
  message: React.ReactNode;
  /** The user must type this exact text to enable the button (e.g. the database name). */
  confirmText?: string;
  confirmLabel?: string;
  color?: string;
  onConfirm: () => unknown | Promise<unknown>;
  /** A check that may forbid the action (last-admin protection); judged when the dialog opens. */
  guard?: () => Promise<GuardOutcome>;
  /** False for an action that stays in the browser (forget a saved connection): a read-only tab allows it. */
  changesInstance?: boolean;
}

function Body({
  message,
  confirmText,
  confirmLabel,
  color,
  onConfirm,
  guard,
  changesInstance = true,
  id,
}: Options & { id: string }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const admin = useAdminGuard(guard, confirmText ?? 'confirm');
  const readOnly = useReadOnly((s) => s.readOnly) && changesInstance;
  const ready = (!confirmText || typed.trim() === confirmText) && admin.allowed && !readOnly;
  return (
    <Stack gap="sm">
      <Text size="sm">{message}</Text>
      {confirmText ? (
        <TextInput
          data-autofocus
          label={
            <>
              Type <b>{confirmText}</b> to confirm
            </>
          }
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
          autoComplete="off"
        />
      ) : null}
      {admin.notice}
      {readOnly ? <ReadOnlyNotice /> : null}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={() => modals.close(id)}>
          Cancel
        </Button>
        <Button
          color={color ?? 'red'}
          disabled={!ready}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              modals.close(id);
            } catch {
              /* the action reported its own error (useApiMutation toasts it); the dialog stays open to retry */
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel ?? 'Confirm'}
        </Button>
      </Group>
    </Stack>
  );
}

/** Destructive-action confirmation. Requires typing the target name for irreversible operations. */
export function confirmDanger(opts: Options) {
  const id = `confirm-${Math.random().toString(36).slice(2)}`;
  modals.open({
    modalId: id,
    title: opts.title,
    centered: true,
    zIndex: 1100,
    children: <Body {...opts} id={id} />,
  });
}
