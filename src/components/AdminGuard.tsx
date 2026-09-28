import { Alert, Code, Stack, Text, TextInput } from '@mantine/core';
import { IconShieldExclamation } from '@tabler/icons-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { queryClient } from '@/query';
import { describeError } from '@/lib/errors';
import { judge, loadAdminModel, type AdminChange } from '@/features/security/adminGuard';
import { loadImpact, MAX_USERS, type ImpactReport } from '@/features/security/impact';

/** What a guarded dialog knows about the security administrators after the change. */
export type GuardOutcome =
  | { status: 'ok'; after: string[]; impact?: ImpactOutcome }
  | { status: 'locks-out'; before: string[] }
  | { status: 'unknown'; error: string };

/** The privileges each affected account loses or gains; null for a change with no preview. */
export type ImpactOutcome = { report: ImpactReport | null } | { error: string };

const SHOWN = 10;

function list(items: string[]) {
  return items.map((p, i) => (
    <span key={p}>
      {i ? ', ' : ''}
      <Code>{p}</Code>
    </span>
  ));
}

/** "alice loses %DB_USER:W; bob gains …": the accounts whose privileges the change moves. */
export function ImpactNotice({ impact }: { impact: ImpactOutcome | undefined }) {
  if (!impact) return null;
  if ('error' in impact)
    return (
      <Text size="xs" c="dimmed">
        Could not work out whose privileges change: {impact.error}
      </Text>
    );
  const report = impact.report;
  if (!report) return null;
  const partial =
    report.more > 0
      ? ` Only the first ${MAX_USERS} of ${report.checked + report.more} accounts holding it were checked.`
      : '';
  if (!report.changes.length)
    return (
      <Text size="xs" c="dimmed">
        No account's privileges change ({report.checked} checked).{partial}
      </Text>
    );
  return (
    <Alert variant="light" color="blue" title="Who loses what" p="xs">
      <Stack gap={4}>
        {report.changes.slice(0, SHOWN).map((c) => (
          <Text key={c.user} size="xs">
            <b>{c.user}</b>
            {c.lost.length ? <> loses {list(c.lost)}</> : null}
            {c.lost.length && c.gained.length ? ';' : null}
            {c.gained.length ? <> gains {list(c.gained)}</> : null}
          </Text>
        ))}
        {report.changes.length > SHOWN ? (
          <Text size="xs" c="dimmed">
            and {report.changes.length - SHOWN} more accounts.
          </Text>
        ) : null}
        <Text size="xs" c="dimmed">
          Counting every role each account holds, the roles those grant, and public permissions.{partial}
        </Text>
      </Stack>
    </Alert>
  );
}

/** Read the model (fresh: this runs right before a write) and judge the change. */
export async function checkAdminChange(change: AdminChange): Promise<GuardOutcome> {
  try {
    const model = await queryClient.fetchQuery({
      queryKey: ['security', 'admin-model'],
      queryFn: loadAdminModel,
      staleTime: 5_000,
    });
    const v = judge(model, change);
    // The model compares names without case; show them as IRIS spells them.
    const spelled = (names: string[]) => names.map((n) => model.userNames?.[n] ?? n);
    if (v.locksOut) return { status: 'locks-out', before: spelled(v.before) };
    // Who loses what is information, not a gate: when it cannot be read, the change may still go.
    const impact: ImpactOutcome = await loadImpact(model, change).then(
      (report) => ({ report }),
      (e: unknown) => ({ error: describeError(e) }),
    );
    return { status: 'ok', after: spelled(v.after), impact };
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
  // The guard is judged once, for the change the dialog was opened with: a new guard function on a
  // later render is not a reason to judge again.
  const judge = useEffectEvent(() => guard?.());
  useEffect(() => {
    const judged = judge();
    if (!judged) return;
    let live = true;
    void judged.then((o) => live && setOutcome(o));
    return () => {
      live = false;
    };
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
    <Stack gap="xs">
      <ImpactNotice impact={outcome.impact} />
      <Text size="xs" c="dimmed">
        Security stays administered by {outcome.after.slice(0, 5).join(', ')}
        {outcome.after.length > 5 ? ` and ${outcome.after.length - 5} more` : ''}.
      </Text>
    </Stack>
  );
  return { allowed, notice, pending: !!guard && !outcome };
}
