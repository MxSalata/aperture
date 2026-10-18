import { Button, Tooltip } from '@mantine/core';
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchInteropInfo,
  fetchProduction,
  fetchProductionStatus,
  hostStatus,
  interopKeys,
  productionState,
  setProductionState,
} from '@/api/interop';
import { confirmDanger } from '@/components/ConfirmDanger';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useSession } from '@/stores/session';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Start or stop, then read the state back until IRIS reports the one asked for (at most 20 s): the
 * route answers success whatever happened, so only the read-back says whether it did.
 */
async function changeAndReadBack(
  ns: string,
  production: string,
  state: 'start' | 'stop',
  host?: { id: string; name: string },
) {
  await setProductionState(ns, production, state, host?.id);
  const wanted = host ? (state === 'start' ? 'OK' : 'Stopped') : state === 'start' ? 'Running' : 'Stopped';
  let seen = '';
  for (let i = 0; i < 20; i++) {
    await sleep(i ? 1000 : 300);
    if (host) {
      const item = (await fetchProduction(ns, production)).Items.find((it) => it.itemId === host.id);
      seen = item ? hostStatus(item) : 'missing';
      // A started host that failed its next message reads Error: it runs.
      if (seen === wanted || (state === 'start' && seen === 'Error')) return seen;
    } else {
      seen = productionState(await fetchProductionStatus(ns), production);
      if (seen === wanted) return seen;
    }
  }
  throw new Error(`IRIS accepted the request, but ${host ? host.name : production} still reads ${seen}.`);
}

function useRights() {
  const info = useQuery({ queryKey: interopKeys.info, queryFn: fetchInteropInfo, staleTime: 60_000 });
  return info.data?.privileges.production;
}

/** Start or stop the production, by its page's header. Stopping on a LIVE instance asks for its name. */
export function ProductionStateButton({
  ns,
  production,
  running,
}: {
  ns: string;
  production: string;
  running: boolean;
}) {
  const rights = useRights();
  const live = useSession((s) => s.info?.systemMode === 'LIVE');
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const state = running ? 'stop' : 'start';
  const run = async () => {
    setBusy(true);
    try {
      const seen = await changeAndReadBack(ns, production, state);
      notifySuccess(
        `${production} in ${ns}: IRIS now reports ${seen}.`,
        running ? 'Production stopped' : 'Production started',
      );
    } catch (e) {
      notifyError(e, running ? 'Stop production' : 'Start production');
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: interopKeys.all });
    }
  };
  const button = (
    <Button
      size="xs"
      variant="light"
      color={running ? 'red' : 'teal'}
      leftSection={running ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
      loading={busy}
      disabled={rights?.run === false}
      onClick={() =>
        confirmDanger({
          title: running ? 'Stop production' : 'Start production',
          message: running
            ? `Stop ${production} in ${ns}? Its hosts stop taking and sending messages until it is started again; what is queued waits.`
            : `Start ${production} in ${ns}? A namespace runs one production at a time.`,
          confirmLabel: running ? 'Stop' : 'Start',
          color: running ? 'red' : 'teal',
          confirmText: running && live ? production : undefined,
          onConfirm: run,
        })
      }
    >
      {running ? 'Stop production' : 'Start production'}
    </Button>
  );
  return rights?.run === false ? (
    <Tooltip label="IRIS reports that this account may not start or stop productions">{button}</Tooltip>
  ) : (
    button
  );
}

/** Start or stop one host of a running production, from its drawer. */
export function HostStateButton({
  ns,
  production,
  id,
  name,
  stopped,
}: {
  ns: string;
  production: string;
  id: string;
  name: string;
  stopped: boolean;
}) {
  const rights = useRights();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const state = stopped ? 'start' : 'stop';
  const run = async () => {
    setBusy(true);
    try {
      const seen = await changeAndReadBack(ns, production, state, { id, name });
      notifySuccess(`${name}: IRIS now reports ${seen}.`, stopped ? 'Host started' : 'Host stopped');
    } catch (e) {
      notifyError(e, stopped ? 'Start host' : 'Stop host');
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: interopKeys.all });
    }
  };
  const button = (
    <Button
      size="xs"
      variant="light"
      color={stopped ? 'teal' : 'red'}
      leftSection={stopped ? <IconPlayerPlay size={14} /> : <IconPlayerStop size={14} />}
      loading={busy}
      disabled={rights?.runItem === false}
      onClick={() =>
        confirmDanger({
          title: stopped ? 'Start host' : 'Stop host',
          message: stopped
            ? `Start ${name} in ${production}?`
            : `Stop ${name} in ${production}? It stays enabled and its messages wait in its queue until it is started again.`,
          confirmLabel: stopped ? 'Start' : 'Stop',
          color: stopped ? 'teal' : 'red',
          onConfirm: run,
        })
      }
    >
      {stopped ? 'Start host' : 'Stop host'}
    </Button>
  );
  return rights?.runItem === false ? (
    <Tooltip label="IRIS reports that this account may not start or stop hosts">{button}</Tooltip>
  ) : (
    button
  );
}
