import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  FHIR_MISSING,
  JOB_GONE,
  fetchCapability,
  fetchEndpoint,
  fetchFhirInfo,
  fetchFhirNamespaces,
  fetchJob,
  fetchPackages,
  removeEndpoint,
  strategyName,
  notReachable,
  updateEndpoint,
  waitForJob,
} from '../fhir';
import { server } from '@/mocks/node';
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
    const cap = await fetchCapability('/csp/healthshare/clinical/fhir/r4');
    // The statement answers anyone, but a search without credentials is refused: not open.
    expect(cap).toMatchObject({ status: 200, open: false, fhirVersion: '4.0.1' });
    expect(cap.resources.map((r) => r.type)).toContain('Patient');
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
    const done = await waitForJob(job.job_key, { intervalMs: 200 });
    expect(done).toMatchObject({ kind: 'ended', job: { status: 'complete', method: 'ResetEndpoint' } });
    expect((await fetchEndpoint('CLINICAL', '1')).metrics?.rsrc_count).toBe(0);
  }, 20_000);

  it('refuses an account without %HSAdmin_InstallationManagement', async () => {
    await signIn('operator');
    await expect(fetchFhirNamespaces()).rejects.toMatchObject({ status: 403 });
  });

  it('lists the packages of the namespace asked for, and says when it is not FHIR-enabled', async () => {
    await signIn('_SYSTEM');
    expect((await fetchFhirNamespaces()).map((n) => n.name)).toEqual(['CLINICAL', 'FHIRSTAGE']);
    const clinical = await fetchPackages('CLINICAL');
    expect(clinical.find((p) => p.id === 'hl7.fhir.r4.core@4.0.1')?.inUse).toBe(true);
    const stage = await fetchPackages('FHIRSTAGE');
    expect(stage.some((p) => p.inUse)).toBe(false);
    await expect(fetchPackages('NOSUCH')).rejects.toMatchObject({
      status: 404,
      summary: 'NOSUCH is not a FHIR-enabled namespace.',
    });
  });

  it('says an unknown server is unknown, not that the instance lacks the API', async () => {
    await signIn('_SYSTEM');
    await expect(fetchEndpoint('CLINICAL', '9999')).rejects.toMatchObject({
      status: 404,
      summary: 'IRIS has no FHIR server 9999 in CLINICAL.',
    });
  });

  it('keeps the missing-API text for the discovery call, and refuses a page that is not the API', async () => {
    await signIn('_SYSTEM');
    server.use(http.get('*/csp/fhir-management/api/info', () => new HttpResponse(null, { status: 404 })));
    await expect(fetchFhirInfo()).rejects.toMatchObject({ status: 404, summary: FHIR_MISSING });
    server.use(
      http.get(
        '*/csp/fhir-management/api/info',
        () =>
          new HttpResponse('<!doctype html><title>Aperture</title>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    // The proxy's own page never reaches the API: sessionFetch refuses an answer that is not JSON.
    await expect(fetchFhirInfo()).rejects.toThrow(/did not reach IRIS/);
  });

  it('calls a server open only when a search without credentials answers', async () => {
    await signIn('_SYSTEM');
    server.use(http.get('*/csp/healthshare/clinical/fhir/r4/Patient', () => HttpResponse.json({ total: 0 })));
    expect(await fetchCapability('/csp/healthshare/clinical/fhir/r4')).toMatchObject({
      status: 200,
      open: true,
    });
  });

  it("refuses an answer that is not a CapabilityStatement (the app's own page behind a proxy)", async () => {
    await signIn('_SYSTEM');
    server.use(
      http.get(
        '*/csp/elsewhere/fhir/metadata',
        () =>
          new HttpResponse('<!doctype html><title>Aperture</title>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    await expect(fetchCapability('/csp/elsewhere/fhir')).rejects.toMatchObject({
      summary: notReachable('/csp/elsewhere/fhir'),
    });
  });

  it('follows a job IRIS has dropped, one still running when the wait runs out, and a stopped wait', async () => {
    await signIn('_SYSTEM');
    expect(await waitForJob('unknown-job', { intervalMs: 10 })).toEqual({ kind: 'gone' });
    await expect(fetchJobText('unknown-job')).resolves.toBe(JOB_GONE);
    const job = await removeEndpoint('CLINICAL', '1', 'reset');
    expect(await waitForJob(job.job_key, { budgetMs: 50, intervalMs: 10 })).toMatchObject({
      kind: 'running',
    });
    const ctl = new AbortController();
    ctl.abort();
    expect(await waitForJob(job.job_key, { signal: ctl.signal })).toEqual({ kind: 'aborted' });
  });

  it('tries a failed poll again before giving up', async () => {
    await signIn('_SYSTEM');
    let calls = 0;
    server.use(
      http.get('*/csp/fhir-management/api/jobs/:key', ({ params }) => {
        calls++;
        if (calls < 3) return HttpResponse.json({ summary: 'busy' }, { status: 500 });
        return HttpResponse.json({ job_key: String(params.key), status: 'complete' });
      }),
    );
    expect(await waitForJob('k', { intervalMs: 10 })).toMatchObject({
      kind: 'ended',
      job: { status: 'complete' },
    });
    calls = -10;
    await expect(waitForJob('k', { intervalMs: 10 })).rejects.toMatchObject({ status: 500 });
  });
});

const fetchJobText = (key: string) =>
  fetchJob(key).then(
    () => '',
    (e: Error) => e.message,
  );
