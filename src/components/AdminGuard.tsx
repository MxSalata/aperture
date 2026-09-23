import { Alert, Text, TextInput } from '@mantine/core';
import { IconShieldExclamation } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { queryClient } from '@/query';
import { describeError } from '@/lib/errors';
import { judge, loadAdminModel, type AdminChange } from '@/features/security/adminGuard';

/** What a guarded dialog knows about the security administrators after the change. */
export type GuardOutcome =
  | { status: 'ok'; after: string[] }
  | { status: 'locks-out'; before: string[] }
  | { status: 'unknown'; error: string };

/** Read the model (fresh: this runs right before a write) and judge the change. */
export async function checkAdminChange(change: AdminChange): Promise<GuardOutcome> {
  try {
    const model = await queryClient.fetchQuery({
      queryKey: ['security', 'admin-model'],
      queryFn: loadAdminModel,
      staleTime: 5_000,
    });
    const v = judge(model, change);
    return v.locksOut ? { status: 'locks-out', before: v.before } : { status: 'ok', after: v.after };
  } catch (e) {
    return { status: 'unknown', error: describeError(e) };
  }
}

/**
 * The guard's state inside a dialog: whether its action may run, and the notice to show. When the
 * check cannot be made, the action needs `confirmText` typed, as for an irreversible delete.
 */
export function useAdminGuard(guard: (() => Promise<GuardOutcome>) | undefined, confirmText: string) {
  const [outcome, setOutcome] = useState<GuardOutcome | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (!guard) return;
    let live = true;
    void guard().then((o) => live && setOutcome(o));
    return () => {
      live = false;
    };
    // The guard is judged once, for the change the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const allowed =
    !guard || outcome?.status === 'ok' || (outcome?.status === 'unknown' && typed.trim() === confirmText);
  const notice = !guard ? null : !outcome ? (
    <Text size="xs" c="dimmed" aria-live="polite">
      Checking who administers security after this change…
    </Text>
  ) : outcome.status === 'locks-out' ? (
    <Alert
      color="red"
      variant="light"
      icon={<IconShieldExclamation size={16} />}
      title="This would lock everyone out"
    >
      After this change no enabled account would hold <b>%All</b> or <b>%Admin_Secure:U</b>, so nobody could
      administer users, roles or resources any more, here or in the Management Portal. Today that is{' '}
      <b>{outcome.before.join(', ')}</b>. Give another enabled account one of these first.
    </Alert>
  ) : outcome.status === 'unknown' ? (
    <Alert
      color="orange"
      variant="light"
      icon={<IconShieldExclamation size={16} />}
      title="Cannot tell who administers security"
    >
      <Text size="sm" mb="xs">
        Reading roles and their owners failed ({outcome.error}). If this change removes the last account
        holding %All or %Admin_Secure:U, nobody can administer security any more.
      </Text>
      <TextInput
        label={
          <>
            Type <b>{confirmText}</b> to go on
          </>
        }
        value={typed}
        onChange={(e) => setTyped(e.currentTarget.value)}
        autoComplete="off"
      />
    </Alert>
  ) : (
    <Text size="xs" c="dimmed">
      Security stays administered by {outcome.after.slice(0, 5).join(', ')}
      {outcome.after.length > 5 ? ` and ${outcome.after.length - 5} more` : ''}.
    </Text>
  );
  return { allowed, notice, pending: !!guard && !outcome };
}
