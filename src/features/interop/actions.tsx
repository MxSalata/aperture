import { Button, Tooltip } from '@mantine/core';
import { IconFirstAidKit, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  controlRefusal,
  fetchProduction,
  fetchProductionStatus,
  hostStatus,
  interopKeys,
  productionState,
  setProductionState,
  type ProductionDefinition,
} from '@/api/interop';
import { confirmDanger } from '@/components/ConfirmDanger';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useSession } from '@/stores/session';
import { useInteropPrivileges } from './useInteropPrivileges';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Start, stop or recover, then read the state back until IRIS reports the one asked for (at most 20 s):
 * the route answers success whatever happened, so only the read-back says whether it did.
 */
async function changeAndReadBack(
  ns: string,
  production: string,
  state: 'start' | 'stop' | 'recover',
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
      // Recovering leaves the production suspended, whatever it had been doing.
      if (seen === wanted || (state === 'recover' && seen !== 'Troubled')) return seen;
    }
  }
  throw new Error(`IRIS accepted the request, but ${host ? host.name : production} still reads ${seen}.`);
}

/** Start or stop the production, by its page's header. Stopping on a LIVE instance asks for its name. */
export function ProductionStateButton({
  ns,
  production,
  running,
  readOnly,
  blocked,
}: {
  ns: string;
  production: string;
  running: boolean;
  readOnly: ProductionDefinition['ReadOnly'];
  /** Why IRIS would refuse to start it while another production holds the namespace (startRefusal). */
  blocked?: string;
}) {
  const refusal =
    controlRefusal(useInteropPrivileges()?.production, readOnly) ?? (running ? undefined : blocked);
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
      disabled={!!refusal}
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
  return refusal ? <Tooltip label={refusal}>{button}</Tooltip> : button;
}

/** Recover a troubled production (Ens.Director's RecoverProduction), by its page's header. */
export function ProductionRecoverButton({
  ns,
  production,
  readOnly,
}: {
  ns: string;
  production: string;
  readOnly: ProductionDefinition['ReadOnly'];
}) {
  const refusal = controlRefusal(useInteropPrivileges()?.production, readOnly);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const seen = await changeAndReadBack(ns, production, 'recover');
      notifySuccess(`${production} in ${ns}: IRIS now reports ${seen}.`, 'Production recovered');
    } catch (e) {
      notifyError(e, 'Recover production');
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: interopKeys.all });
    }
  };
  const button = (
    <Button
      size="xs"
      variant="light"
      color="yellow"
      leftSection={<IconFirstAidKit size={14} />}
      loading={busy}
      disabled={!!refusal}
      onClick={() =>
        confirmDanger({
          title: 'Recover production',
          message: `Recover ${production} in ${ns}? IRIS clears what is left of the run that did not shut down cleanly; the production then reads Suspended and can be started again.`,
          confirmLabel: 'Recover',
          color: 'yellow',
          onConfirm: run,
        })
      }
    >
      Recover production
    </Button>
  );
  return refusal ? <Tooltip label={refusal}>{button}</Tooltip> : button;
}

/** Start or stop one host of a running production, from its drawer. */
export function HostStateButton({
  ns,
  production,
  id,
  name,
  stopped,
  readOnly,
}: {
  ns: string;
  production: string;
  id: string;
  name: string;
  stopped: boolean;
  readOnly: ProductionDefinition['ReadOnly'];
}) {
  const refusal = controlRefusal(useInteropPrivileges()?.production, readOnly);
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
      disabled={!!refusal}
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
  return refusal ? <Tooltip label={refusal}>{button}</Tooltip> : button;
}
