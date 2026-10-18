import { beforeEach, describe, expect, it } from 'vitest';
import {
  fetchCapability,
  fetchEndpoint,
  fetchFhirInfo,
  fetchFhirNamespaces,
  fetchPackages,
  removeEndpoint,
  strategyName,
  updateEndpoint,
  waitForJob,
} from '../fhir';
import { resetClients } from '../client';
import { resetDb } from '@/mocks/db';
import { resetFhirMock } from '@/mocks/handlers/fhir';
import { useSession } from '@/stores/session';
import { useActivity } from '@/stores/activity';

const signIn = (username: string) =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username, password: 'SYS', auth: 'jwt' });

describe('FHIR servers on the demo instance', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    resetFhirMock();
    useActivity.getState().clear();
  });

  it('lists the servers with what they store, with the session token', async () => {
    await signIn('_SYSTEM');
    expect((await fetchFhirInfo()).instance_info?.system_mode).toBe('DEVELOPMENT');
    const [ns] = await fetchFhirNamespaces();
    expect(ns.name).toBe('CLINICAL');
    expect(ns.endpoints?.[0].metrics?.rsrc_count).toBe(161);
    const one = await fetchEndpoint('CLINICAL', '1');
    // Read alone, the id comes as a string, as on IRIS.
    expect(one.endpoint.serviceId).toBe('1');
    expect(one.metrics?.table_stats?.find((t) => t.resourceType === 'Observation')?.count).toBe(128);
    expect(strategyName(one.endpoint.service_config_data?.interactions_strategy_class)).toBe('JsonAdvSQL');
    expect((await fetchPackages('CLINICAL')).map((p) => p.id)).toContain('hl7.fhir.r4.core@4.0.1');
  });

  it('disables and enables a server, whose CapabilityStatement answers anyone, then 503', async () => {
    await signIn('_SYSTEM');
    const open = await fetchCapability('/csp/healthshare/clinical/fhir/r4');
    expect(open).toMatchObject({ status: 200, open: true, fhirVersion: '4.0.1' });
    expect(open.resources.map((r) => r.type)).toContain('Patient');
    await updateEndpoint('CLINICAL', '1', { enabled: false });
    expect((await fetchEndpoint('CLINICAL', '1')).endpoint.enabled).toBe(false);
    expect(await fetchCapability('/csp/healthshare/clinical/fhir/r4')).toMatchObject({
      status: 503,
      issue: 'The service is currently disabled',
    });
    await updateEndpoint('CLINICAL', '1', { enabled: true });
    expect(useActivity.getState().entries.map((e) => e.method)).toEqual(['PUT', 'PUT']);
  });

  it('resets a server through a job, followed to its end', async () => {
    await signIn('_SYSTEM');
    const job = await removeEndpoint('CLINICAL', '1', 'reset');
    expect(job.status).toBe('pending');
    const done = await waitForJob(job.job_key);
    expect(done).toMatchObject({ status: 'complete', method: 'ResetEndpoint' });
    expect((await fetchEndpoint('CLINICAL', '1')).metrics?.rsrc_count).toBe(0);
  }, 20_000);

  it('refuses an account without %HSAdmin_InstallationManagement', async () => {
    await signIn('operator');
    await expect(fetchFhirNamespaces()).rejects.toMatchObject({ status: 403 });
  });
});
