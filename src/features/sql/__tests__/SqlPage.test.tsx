import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import SqlPage from '../SqlPage';
import { basicCredentials } from '@/api/base';
import { resetClients } from '@/api/client';
import { mockDb, resetDb } from '@/mocks/db';
import { resetSql } from '@/mocks/sql';
import { useAtelierAuth } from '@/stores/atelierAuth';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useReadOnly } from '@/stores/readOnly';
import { useSession } from '@/stores/session';
import { useSqlHistory } from '@/stores/sqlHistory';
import { server } from '@/mocks/node';

const signIn = (username: string, auth: 'jwt' | 'basic') =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username, password: 'SYS', auth });

function open(path = '/sql') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider>
      <ModalsProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[path]}>
            <SqlPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe('the SQL screen', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    resetSql();
    useMgmntAuth.getState().clear();
    useAtelierAuth.getState().clear();
    useReadOnly.getState().setReadOnly(false);
    window.sessionStorage.clear();
    useSqlHistory.getState().clear();
    // Floating UI asks every popover's ancestors whether they match `:modal` or `:popover-open`, and
    // jsdom's selector engine answers those through itself until the stack overflows: minutes a page.
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':modal' || selector === ':popover-open' ? false : matches.call(this, selector);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('asks a JWT session for another password once Atelier refused it, and leaves the shared one', async () => {
    await signIn('operator', 'jwt');
    const shared = basicCredentials('operator', 'SYS');
    useMgmntAuth.getState().set(shared);
    open();
    expect(await screen.findByText(/a wrong password, or the account lacks %Development:USE/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open the SQL explorer' })).toBeInTheDocument();
    expect(useMgmntAuth.getState().basic).toBe(shared);
  });

  it('forgets everywhere a password given on its own gate that Atelier refused', async () => {
    await signIn('operator', 'jwt');
    open();
    const field = await screen.findByLabelText('Password for operator');
    fireEvent.change(field, { target: { value: 'SYS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open the SQL explorer' }));
    expect(await screen.findByText(/refused the password given here/)).toBeVisible();
    // The log reader, REST services and the Health check do not send it on.
    expect(useMgmntAuth.getState().basic).toBeNull();
    expect(useAtelierAuth.getState().refused).toBe(basicCredentials('operator', 'SYS'));
    expect(useAtelierAuth.getState().typed).toBeNull();
  });

  it('keeps a password given on its gate once Atelier takes it', async () => {
    await signIn('_SYSTEM', 'jwt');
    open();
    fireEvent.change(await screen.findByLabelText('Password for _SYSTEM'), { target: { value: 'SYS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open the SQL explorer' }));
    expect(await screen.findByRole('textbox', { name: 'Statement' }, { timeout: 10_000 })).toBeVisible();
    expect(useMgmntAuth.getState().basic).toBe(basicCredentials('_SYSTEM', 'SYS'));
    expect(useAtelierAuth.getState().typed).toBeNull();
  }, 30_000);

  it("shows the result set a CALL returns, as IRIS's catalogue procedures do", async () => {
    await signIn('_SYSTEM', 'basic');
    // The demo's SQL has no procedures: the answer IRIS gave for this CALL (two of its rows).
    server.use(
      http.post('*/api/atelier/:version/:ns/action/query', () =>
        HttpResponse.json({
          status: { errors: [], summary: '' },
          console: [],
          result: [
            {
              columns: [
                { name: 'RELATION_NAME', type: 'VARCHAR(50)' },
                { name: 'TYPE', type: 'VARCHAR(50)' },
              ],
              content: [
                ['Ens.AlarmRequest', 'TABLE'],
                ['Ens.AlarmResponse', 'TABLE'],
              ],
            },
          ],
        }),
      ),
    );
    open();
    const statement = await screen.findByRole('textbox', { name: 'Statement' }, { timeout: 10_000 });
    fireEvent.change(statement, { target: { value: 'CALL %Library.SQLCatalog_SQLTables()' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run CALL' }));
    const dialog = await screen.findByRole('dialog', { name: 'Run a statement that changes data' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Run CALL' }));
    expect(await screen.findByText('Ens.AlarmResponse', {}, { timeout: 10_000 })).toBeVisible();
    expect(screen.getByText(/CALL done: 2 rows in/)).toBeVisible();
  }, 30_000);

  it('shows the newest run when an older, slower one answers after it, and keeps both in Recent', async () => {
    await signIn('_SYSTEM', 'basic');
    server.use(
      http.post('*/api/atelier/:version/:ns/action/query', async ({ request }) => {
        const { query } = (await request.json()) as { query: string };
        const slow = query.includes('slow');
        if (slow) await delay(1500);
        return HttpResponse.json({
          status: { errors: [], summary: '' },
          console: [],
          result: [{ columns: [{ name: 'A', type: 'VARCHAR(10)' }], content: [[slow ? 'older' : 'newer']] }],
        });
      }),
    );
    open();
    const statement = await screen.findByRole('textbox', { name: 'Statement' }, { timeout: 10_000 });
    fireEvent.change(statement, { target: { value: "SELECT 'slow' AS A" } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.change(statement, { target: { value: "SELECT 'quick' AS A" } });
    fireEvent.keyDown(statement, { key: 'Enter', ctrlKey: true });
    expect(await screen.findAllByText('newer', {}, { timeout: 10_000 })).not.toHaveLength(0);
    await waitFor(() => expect(useSqlHistory.getState().statements).toHaveLength(2), { timeout: 10_000 });
    expect(screen.getAllByText('newer')).not.toHaveLength(0);
    expect(screen.queryAllByText('older')).toHaveLength(0);
  }, 30_000);

  it("drops the last result and the catalogue's choice when the namespace changes", async () => {
    await signIn('_SYSTEM', 'basic');
    open('/sql?ns=USER');
    const statement = await screen.findByRole('textbox', { name: 'Statement' }, { timeout: 10_000 });
    fireEvent.change(statement, { target: { value: 'SELECT Name FROM Sample.Person WHERE ID = 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText(/1 rows in/, {}, { timeout: 10_000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('textbox', { name: 'Namespace' }));
    fireEvent.click(await screen.findByRole('option', { name: 'CLINICAL', hidden: true }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Namespace' })).toHaveValue('CLINICAL'));
    expect(screen.queryByText(/1 rows in/)).toBeNull();
  }, 30_000);

  it('gives way to the default namespace when the link names one the instance does not list', async () => {
    await signIn('_SYSTEM', 'basic');
    open('/sql?ns=GONE');
    expect(
      await screen.findByText(/There is no namespace GONE on this instance/, {}, { timeout: 10_000 }),
    ).toHaveTextContent('showing USER');
    expect(screen.getByRole('textbox', { name: 'Namespace' })).toHaveValue('USER');
  }, 30_000);

  it('opens %SYS from a link, though the list leaves it out', async () => {
    await signIn('_SYSTEM', 'basic');
    open('/sql?ns=%25SYS');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Namespace' })).toHaveValue('%SYS'), {
      timeout: 10_000,
    });
    expect(screen.queryByText(/There is no namespace/)).toBeNull();
  }, 30_000);

  describe('the SQL audit notice', () => {
    const sqlEvent = (name: string) =>
      mockDb.auditEvents.find((e) => e.EventType === '%SQL' && e.EventName === name)!;

    it('says IRIS does not audit the statements, and audits changes once confirmed', async () => {
      await signIn('_SYSTEM', 'basic');
      open();
      const notice = await screen.findByRole(
        'alert',
        { name: 'IRIS SQL audit is disabled' },
        { timeout: 10_000 },
      );
      expect(notice).toHaveTextContent(/not written to the IRIS audit log, under any user/);
      expect(notice).toHaveTextContent(/DynamicStatementDML and DynamicStatementDDL are off/);
      fireEvent.click(within(notice).getByRole('button', { name: 'Audit SQL changes…' }));
      const dialog = await screen.findByRole('dialog', { name: 'Audit SQL changes on the whole instance' });
      expect(dialog).toHaveTextContent(/every SQL client and not only Aperture/);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Audit SQL changes' }));
      expect(await screen.findByText(/queries are not written to the audit log/)).toBeVisible();
      expect(sqlEvent('DynamicStatementDML').Enabled).toBe(true);
      expect(sqlEvent('DynamicStatementDDL').Enabled).toBe(true);
      expect(sqlEvent('DynamicStatementQuery').Enabled).toBe(false);
      expect(screen.queryByRole('alert', { name: 'IRIS SQL audit is disabled' })).toBeNull();
    }, 30_000);

    it('offers to switch auditing on when it is off for the whole instance', async () => {
      mockDb.auditEnabled = false;
      for (const n of ['DynamicStatementDML', 'DynamicStatementDDL']) sqlEvent(n).Enabled = true;
      await signIn('_SYSTEM', 'basic');
      open();
      const notice = await screen.findByRole(
        'alert',
        { name: 'IRIS SQL audit is disabled' },
        { timeout: 10_000 },
      );
      expect(notice).toHaveTextContent(/Auditing is off for the whole instance/);
      expect(within(notice).queryByRole('button', { name: 'Audit SQL changes…' })).toBeNull();
      fireEvent.click(within(notice).getByRole('button', { name: 'Switch auditing on…' }));
      const dialog = await screen.findByRole('dialog', { name: 'Switch auditing on' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }));
      expect(await screen.findByText(/queries are not written to the audit log/)).toBeVisible();
      expect(mockDb.auditEnabled).toBe(true);
    }, 30_000);

    it('shows what IRIS reports after a switch-on that fails part-way, and names what goes unrecorded', async () => {
      server.use(
        http.put('*/api/admin/v2/security/audit/event', ({ request }) => {
          if (new URL(request.url).searchParams.get('name') !== 'DynamicStatementDDL') return;
          return HttpResponse.json(
            { status: { errors: [{ error: 'ERROR #5001: refused' }], summary: '' }, console: [], result: {} },
            { status: 500 },
          );
        }),
      );
      await signIn('_SYSTEM', 'basic');
      open();
      const notice = await screen.findByRole(
        'alert',
        { name: 'IRIS SQL audit is disabled' },
        { timeout: 10_000 },
      );
      fireEvent.click(within(notice).getByRole('button', { name: 'Audit SQL changes…' }));
      const dialog = await screen.findByRole('dialog', { name: 'Audit SQL changes on the whole instance' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Audit SQL changes' }));
      // DML went through before DDL failed: the notice reads the settings again and says so.
      await waitFor(
        () =>
          expect(screen.getByRole('alert', { name: 'IRIS SQL audit is disabled' })).toHaveTextContent(
            /^IRIS SQL audit is disabledChanges to definitions \(DDL\) run here are not written to the IRIS audit log, under any user\. DynamicStatementDDL is off\./,
          ),
        { timeout: 10_000 },
      );
      expect(sqlEvent('DynamicStatementDML').Enabled).toBe(true);
      expect(sqlEvent('DynamicStatementDDL').Enabled).toBe(false);
    }, 30_000);

    it('says nothing is written until auditing is on when both it and the events are off', async () => {
      mockDb.auditEnabled = false;
      await signIn('_SYSTEM', 'basic');
      open();
      const notice = await screen.findByRole(
        'alert',
        { name: 'IRIS SQL audit is disabled' },
        { timeout: 10_000 },
      );
      fireEvent.click(within(notice).getByRole('button', { name: 'Audit SQL changes…' }));
      const dialog = await screen.findByRole('dialog', { name: 'Audit SQL changes on the whole instance' });
      expect(dialog).toHaveTextContent(/Nothing is written until auditing is switched on/);
    }, 30_000);

    it('says why query auditing cannot be switched on from a read-only tab', async () => {
      for (const n of ['DynamicStatementDML', 'DynamicStatementDDL']) sqlEvent(n).Enabled = true;
      useReadOnly.getState().setReadOnly(true);
      await signIn('_SYSTEM', 'basic');
      open();
      const button = await screen.findByRole(
        'button',
        { name: 'Audit every query too…' },
        { timeout: 10_000 },
      );
      expect(button).toBeDisabled();
      expect(screen.getByText(/This tab is read-only, so it changes no audit setting/)).toBeVisible();
    }, 30_000);

    it('changes nothing from a read-only tab', async () => {
      useReadOnly.getState().setReadOnly(true);
      await signIn('_SYSTEM', 'basic');
      open();
      const notice = await screen.findByRole(
        'alert',
        { name: 'IRIS SQL audit is disabled' },
        { timeout: 10_000 },
      );
      expect(within(notice).getByRole('button', { name: 'Audit SQL changes…' })).toBeDisabled();
      expect(notice).toHaveTextContent(/This tab is read-only/);
    }, 30_000);

    it('says only that changes and queries are audited when they are', async () => {
      for (const n of ['DynamicStatementDML', 'DynamicStatementDDL', 'DynamicStatementQuery'])
        sqlEvent(n).Enabled = true;
      await signIn('_SYSTEM', 'basic');
      open();
      expect(
        await screen.findByText(/IRIS audits the statements run here, changes and queries/, undefined, {
          timeout: 10_000,
        }),
      ).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
    }, 30_000);

    it('calls the state unknown when the account may not read the audit settings', async () => {
      server.use(
        http.get('*/api/admin/v2/security/audit/events', () =>
          HttpResponse.json(
            {
              status: { errors: [{ error: 'ERROR #5915: Forbidden' }], summary: '' },
              console: [],
              result: {},
            },
            { status: 403 },
          ),
        ),
      );
      await signIn('_SYSTEM', 'basic');
      open();
      expect(
        await screen.findByText(
          /IRIS SQL audit state unknown: reading the audit settings needs %Admin_Secure:U/,
          undefined,
          {
            timeout: 10_000,
          },
        ),
      ).toBeVisible();
      expect(screen.queryByRole('alert', { name: 'IRIS SQL audit is disabled' })).toBeNull();
    }, 30_000);
  });
});
