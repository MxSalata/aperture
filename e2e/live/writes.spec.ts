import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { account, type Account } from './live';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Writes against a real instance, with read-back: partial PUT per object type, role grants,
 * resource creation with no public permission, AutheEnabled bits through the UI, escalation at
 * sign-in, a password beyond Latin-1, and the 403 an account without %Admin_Operate gets for its
 * own queued task. Creates only objects named ApertureProbe* (and /aperture-probe), and puts back
 * every existing value it changes, in `finally` blocks.
 *
 * Opt-in twice: IRIS_URL for the live run, LIVE_MUTATE=1 for this file (@mutate). Snapshot the
 * instance first. Also runs against the in-browser mock (VITE_DEMO=1) to rehearse the flow.
 *
 * Every request goes through the page (fetch from the app's origin), so the Vite proxy forwards it
 * to IRIS in a live run and the mock answers it in a rehearsal.
 */
test.skip(!process.env.IRIS_URL, 'IRIS_URL is not set: the live run is opt-in');

const PREFIX = process.env.IRIS_API_PREFIX ?? '/api/admin';
const P = 'ApertureProbe';
const results: Record<string, unknown> = {};
const note = (key: string, value: unknown) => {
  results[key] = value;
  console.log(`• ${key}: ${JSON.stringify(value).slice(0, 400)}`);
};

interface Answer {
  status: number;
  json: { result?: unknown; status?: { summary?: string; errors?: unknown } } | null;
  location: string | null;
}

/** One API call from the page, with Basic credentials encoded as Aperture encodes them (UTF-8). */
async function rest(
  page: Page,
  acct: Account,
  method: string,
  path: string,
  body?: unknown,
  latin1 = false,
): Promise<Answer> {
  return page.evaluate(
    async ({ user, password, method, url, body, latin1 }) => {
      const pair = `${user}:${password}`;
      const bytes = latin1
        ? Uint8Array.from([...pair].map((c) => c.charCodeAt(0) & 0xff))
        : new TextEncoder().encode(pair);
      const auth = btoa(String.fromCharCode(...bytes));
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* not JSON */
      }
      return { status: res.status, json, location: res.headers.get('location') };
    },
    { user: acct.user, password: acct.password, method, url: `${PREFIX}${path}`, body, latin1 },
  );
}

const result = <T = Record<string, unknown>>(a: Answer) => (a.json?.result ?? {}) as T;
const summary = (a: Answer) => `${a.status}${a.json?.status?.summary ? ` ${a.json.status.summary}` : ''}`;
const q = (name: string) => `name=${encodeURIComponent(name)}`;

/** Keys whose value differs between two reads, apart from the ones the write named. */
function drift(before: Record<string, unknown>, after: Record<string, unknown>, named: string[]): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => !named.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}

/** PUT only `patch`, read back, and report what the write changed that it did not name. */
async function partialPut(page: Page, admin: Account, path: string, patch: Record<string, unknown>) {
  const before = result((await rest(page, admin, 'GET', path)) as Answer);
  const put = await rest(page, admin, 'PUT', path, patch);
  const after = result(await rest(page, admin, 'GET', path));
  const named = Object.keys(patch);
  return {
    patch,
    put: summary(put),
    applied: named.every((k) => JSON.stringify(after[k]) === JSON.stringify(patch[k])),
    otherFieldsChanged: drift(before, after, named).map((k) => ({
      key: k,
      before: before[k],
      after: after[k],
    })),
  };
}

/** A password with letters beyond Latin-1 (ł, ż, ę) and one Latin-1 letter (ó), plus randomness. */
const unicodePassword = () => `Zażółć-gęślą-${randomBytes(6).toString('base64url')}`;
const plainPassword = () => `Probe-${randomBytes(9).toString('base64url')}`;

test.describe.serial('writes with read-back @mutate', () => {
  let browser: Browser;
  let page: Page;
  const admin = account('admin')!;
  const baseURL = () => test.info().project.use.baseURL;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await browser.newPage({ baseURL: baseURL() });
    await page.goto('/login');
  });

  test.afterAll(async () => {
    // Best-effort cleanup of everything this file may have created.
    for (const [method, path] of [
      ['DELETE', `/v2/security/user?${q(`${P}User`)}`],
      ['DELETE', `/v2/security/user?${q(`${P}Auditor`)}`],
      ['DELETE', `/v2/security/role?${q(`${P}Role`)}`],
      ['DELETE', `/v2/security/role?${q(`${P}Esc`)}`],
      ['DELETE', `/v2/security/role?${q(`${P}Secure`)}`],
      ['DELETE', `/v2/security/resource?${q(`${P}Res`)}`],
      ['DELETE', `/v2/web-app?${q('/aperture-probe')}`],
      ['DELETE', `/v2/security/ssl-configuration?${q(`${P}TLS`)}`],
    ] as const)
      await rest(page, admin, method, path).catch(() => undefined);
    const file = test.info().outputPath('writes.json');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`→ ${file}`);
    await page.close();
  });

  test('role: grants are [{Name, Permissions}] and a PUT names only what it changes', async () => {
    const path = `/v2/security/role?${q(`${P}Role`)}`;
    const created = await rest(page, admin, 'PUT', path, {
      Description: 'Aperture probe',
      Resources: [{ Name: '%DB_USER', Permissions: 'R' }],
      GrantedRoles: ['%Developer'],
      EscalationOnly: false,
    });
    const read = result(await rest(page, admin, 'GET', path));
    note('role.create', { put: summary(created), read });
    note(
      'role.resourcesOnly',
      await partialPut(page, admin, path, { Resources: [{ Name: '%DB_USER', Permissions: 'RW' }] }),
    );
    // Replace or merge? A second grant named alone tells whether the list is replaced.
    const other = await partialPut(page, admin, path, {
      Resources: [{ Name: '%DB_IRISSYS', Permissions: 'R' }],
    });
    note('role.resourcesReplaceOrMerge', {
      ...other,
      resourcesAfter: result(await rest(page, admin, 'GET', path)).Resources,
    });
    note(
      'role.descriptionOnly',
      await partialPut(page, admin, path, { Description: 'Aperture probe, renamed' }),
    );
    note('role.emptyResources', await partialPut(page, admin, path, { Resources: [] }));
    note('role.emptyGrantedRoles', await partialPut(page, admin, path, { GrantedRoles: [] }));
    note('role.delete', summary(await rest(page, admin, 'DELETE', path)));
  });

  test('resource: created with no public permission, then edited field by field', async () => {
    const path = `/v2/security/resource?${q(`${P}Res`)}`;
    const empty = await rest(page, admin, 'PUT', path, {
      Description: 'Aperture probe',
      PublicPermission: '',
    });
    note('resource.createEmptyPublic', { put: summary(empty), errors: empty.json?.status?.errors ?? null });
    if (empty.status >= 300) {
      const r = await rest(page, admin, 'PUT', path, {
        Description: 'Aperture probe',
        PublicPermission: 'R',
      });
      note('resource.createWithR', summary(r));
    }
    note(
      'resource.descriptionOnly',
      await partialPut(page, admin, path, { Description: 'Aperture probe, renamed' }),
    );
    note('resource.publicToNone', await partialPut(page, admin, path, { PublicPermission: '' }));
    note('resource.emptyBody', await partialPut(page, admin, path, {}));
    note('resource.delete', summary(await rest(page, admin, 'DELETE', path)));
  });

  test('user: partial PUT, escalation at sign-in, a password beyond Latin-1', async () => {
    const user = `${P}User`;
    const esc = `${P}Esc`;
    const path = `/v2/security/user?${q(user)}`;
    note(
      'escRole.create',
      summary(
        await rest(page, admin, 'PUT', `/v2/security/role?${q(esc)}`, {
          Description: 'Aperture probe escalation role',
          EscalationOnly: true,
          Resources: [{ Name: '%Admin_Secure', Permissions: 'U' }],
        }),
      ),
    );
    let password = unicodePassword();
    const created = await rest(page, admin, 'POST', `/v2/security/user?${q(user)}`, {
      User: {
        FullName: 'Aperture probe',
        Enabled: true,
        Roles: ['%Operator'],
        EscalationRoles: [esc],
        PasswordNeverExpires: true,
        ChangePassword: false,
        NameSpace: 'USER',
      },
      Password: password,
    });
    note('user.create', { status: summary(created), errors: created.json?.status?.errors ?? null });
    if (created.status >= 300) {
      password = plainPassword();
      const again = await rest(page, admin, 'POST', `/v2/security/user?${q(user)}`, {
        User: {
          FullName: 'Aperture probe',
          Enabled: true,
          Roles: ['%Operator'],
          EscalationRoles: [esc],
          PasswordNeverExpires: true,
          ChangePassword: false,
          NameSpace: 'USER',
        },
        Password: password,
      });
      note('user.createPlain', summary(again));
    }
    note('user.read', result(await rest(page, admin, 'GET', path)));
    note('user.fullNameOnly', await partialPut(page, admin, path, { FullName: 'Aperture probe, renamed' }));
    note('user.rolesOnly', await partialPut(page, admin, path, { Roles: ['%Operator', '%Developer'] }));
    note('user.commentOnly', await partialPut(page, admin, path, { Comment: 'probe' }));
    note('user.enabledOnly', await partialPut(page, admin, path, { Enabled: false }));
    await rest(page, admin, 'PUT', path, { Enabled: true, Roles: ['%Operator'] });

    const me: Account = { label: 'probe', user, password };
    const loginAs = (body: Record<string, unknown>) =>
      page.evaluate(
        async ({ url, body }) => {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          });
          const j = await r.json().catch(() => null);
          const t = j?.result ?? j;
          let secure: boolean | null = null;
          if (t?.access_token) {
            const info = await fetch(url.replace(/\/login$/, '/info'), {
              headers: { Authorization: `Bearer ${t.access_token}` },
            });
            const i = await info.json();
            secure = (i.result ?? i).privileges?.Secure?.use ?? null;
            await fetch(url.replace(/\/login$/, '/logout'), {
              method: 'POST',
              headers: { Authorization: `Bearer ${t.access_token}` },
            });
          }
          return { status: r.status, secure };
        },
        { url: `${PREFIX}/login`, body },
      );
    note('login.jwt', await loginAs({ user, password }));
    note('login.escalated', await loginAs({ user, password, role: esc }));
    note('login.notMyEscalationRole', await loginAs({ user, password, role: '%Manager' }));
    note('login.basicUtf8', (await rest(page, me, 'GET', '/info')).status);
    note('login.basicLatin1', (await rest(page, me, 'GET', '/info', undefined, true)).status);
    note(
      'login.passwordHasNonLatin1',
      [...password].some((c) => c.charCodeAt(0) > 0xff),
    );

    // The sign-in form, both ways, with the same password.
    for (const auth of ['Auto', 'Basic'] as const) {
      const ctx = await browser.newContext({ baseURL: baseURL() });
      const p = await ctx.newPage();
      await p.goto('/login');
      await p.getByLabel('Username').fill(user);
      await p.getByLabel('Password', { exact: true }).fill(password);
      if (auth === 'Basic') await p.getByText('Basic', { exact: true }).click();
      await p.getByRole('button', { name: 'Sign in' }).click();
      const landed = await p
        .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
        .then(
          () => true,
          () => false,
        );
      note(`ui.signIn.${auth}`, {
        landed,
        alert: landed ? null : await p.getByRole('alert').allInnerTexts(),
      });
      // Escalation through the form: the header's privileges should include Secure.
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ baseURL: baseURL() });
      const p = await ctx.newPage();
      await p.goto('/login');
      await p.getByLabel('Username').fill(user);
      await p.getByLabel('Password', { exact: true }).fill(password);
      await p.getByLabel('Escalation role').fill(esc);
      await p.getByRole('button', { name: 'Sign in' }).click();
      const landed = await p
        .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
        .then(
          () => true,
          () => false,
        );
      const usersLink = landed
        ? await p.getByRole('navigation').getByRole('link', { name: 'Users', exact: true }).count()
        : 0;
      note('ui.signIn.escalated', { landed, securityNavVisible: usersLink > 0 });
      await ctx.close();
    }
    note('user.delete', summary(await rest(page, admin, 'DELETE', path)));
    note('escRole.delete', summary(await rest(page, admin, 'DELETE', `/v2/security/role?${q(esc)}`)));
  });

  test('an account without %Admin_Operate: 403 for its own task, and the Job Center stops', async () => {
    const role = `${P}Secure`;
    const user = `${P}Auditor`;
    const password = plainPassword();
    await rest(page, admin, 'PUT', `/v2/security/role?${q(role)}`, {
      Description: 'Aperture probe: %Admin_Secure only',
      Resources: [{ Name: '%Admin_Secure', Permissions: 'U' }],
    });
    await rest(page, admin, 'POST', `/v2/security/user?${q(user)}`, {
      User: { Enabled: true, Roles: [role], PasswordNeverExpires: true, ChangePassword: false },
      Password: password,
    });
    const me: Account = { label: 'auditor', user, password };
    const queued = await rest(page, me, 'POST', '/v2/security/audit/records?maxRows=5');
    const id = queued.location ? new URL(queued.location, 'http://x').searchParams.get('id') : null;
    const own = id ? await rest(page, me, 'GET', `/v2/async-result?id=${encodeURIComponent(id)}`) : null;
    note('auditor.api', {
      queued: summary(queued),
      location: queued.location?.replace(/id=\d+/, 'id=<n>'),
      ownResult: own && summary(own),
    });

    // The same through the Explorer: the task lands in the Job Center, which must stop at the 403.
    const ctx = await browser.newContext({ baseURL: baseURL() });
    const p = await ctx.newPage();
    let polls = 0;
    p.on('request', (r) => {
      if (r.url().includes('/async-result?')) polls++;
    });
    await p.goto('/login');
    await p.getByLabel('Username').fill(user);
    await p.getByLabel('Password', { exact: true }).fill(password);
    await p.getByRole('button', { name: 'Sign in' }).click();
    const signedIn = await p
      .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
      .then(
        () => true,
        () => false,
      );
    if (!signedIn) {
      note('auditor.jobCenter', { signedIn, alert: await p.getByRole('alert').allInnerTexts() });
      await ctx.close();
      return;
    }
    await p.goto(
      `/explorer/${encodeURIComponent('/v2/security')}?op=${encodeURIComponent('POST /v2/security/audit/records')}`,
    );
    await p.getByRole('button', { name: 'Execute' }).first().click();
    await p.getByRole('dialog').getByRole('button', { name: 'Execute' }).click();
    await p.waitForTimeout(12_000);
    const afterFirst = polls;
    await p.waitForTimeout(8_000);
    await p.goto('/jobs');
    await p.waitForTimeout(1_000);
    note('auditor.jobCenter', {
      pollsIn12s: afterFirst,
      pollsInNext8s: polls - afterFirst,
      text: (await p.getByRole('main').innerText()).match(/Missing|needs %Admin_Operate[^.]*\./g),
    });
    await p.screenshot({ path: test.info().outputPath('auditor-job-center.png'), fullPage: true });
    await ctx.close();
    await rest(page, admin, 'DELETE', `/v2/security/user?${q(user)}`);
    await rest(page, admin, 'DELETE', `/v2/security/role?${q(role)}`);
  });

  test('web application: hidden AutheEnabled bits survive an edit of another field in the UI', async () => {
    const name = '/aperture-probe';
    const path = `/v2/web-app?${q(name)}`;
    // Password (shown) plus bits the form does not show: K5API (4), two-factor SMS (2^20) and TOTP (2^21).
    const wanted = 32 | 4 | (1 << 20) | (1 << 21);
    const created = await rest(page, admin, 'PUT', path, {
      Description: 'Aperture probe',
      NameSpace: 'USER',
      Enabled: false,
      AutheEnabled: wanted,
    });
    const stored = result(await rest(page, admin, 'GET', path)).AutheEnabled as number;
    note('webapp.create', { put: summary(created), wanted, stored });
    note(
      'webapp.descriptionOnly',
      await partialPut(page, admin, path, { Description: 'Aperture probe (API partial)' }),
    );

    const ctx = await browser.newContext({ baseURL: baseURL() });
    const p = await ctx.newPage();
    const sent: string[] = [];
    p.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/v2/web-app')) sent.push(r.postData() ?? '');
    });
    await p.goto('/login');
    await p.getByLabel('Username').fill(admin.user);
    await p.getByLabel('Password', { exact: true }).fill(admin.password);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForURL((u) => !u.pathname.startsWith('/login'));
    await p.goto(`/security/web-apps/detail?${q(name)}`);
    await p.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = p.getByRole('dialog');
    await dialog.getByLabel('Description').fill('Aperture probe (edited in the UI)');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await p.getByRole('button', { name: 'Apply changes' }).click();
    await p.waitForTimeout(2_000);
    const read = result(await rest(page, admin, 'GET', path));
    const after = read.AutheEnabled as number;
    const body = sent[0] ? (JSON.parse(sent[0]) as Record<string, unknown>) : null;
    note('webapp.uiEdit', {
      storedBefore: stored,
      after,
      identical: after === stored,
      saved: read.Description === 'Aperture probe (edited in the UI)',
      sentKeys: body ? Object.keys(body).length : null,
      sentAutheEnabled: body?.AutheEnabled ?? null,
    });
    await ctx.close();
    note('webapp.delete', summary(await rest(page, admin, 'DELETE', path)));
    expect(read.Description, 'the UI edit reached the server').toBe('Aperture probe (edited in the UI)');
    expect(after, 'AutheEnabled after an unrelated edit in the UI').toBe(stored);
  });

  test('service: hidden AutheEnabled bits survive an edit in the UI; partial PUT', async () => {
    // A disabled service nobody connects through: changing and restoring it affects no client.
    const list = result<{ Name: string; Enabled: unknown }[]>(
      await rest(page, admin, 'GET', '/v2/security/services'),
    );
    const rows = Array.isArray(list) ? list : [];
    const name = ['%Service_Weblink', '%Service_CacheDirect', '%Service_DocDB', '%Service_Bindings']
      .map((n) => rows.find((r) => r.Name === n))
      .find((r) => r && (r.Enabled === false || r.Enabled === 'No'))?.Name;
    test.skip(!name, 'no disabled service to probe');
    const path = `/v2/security/service?${q(name!)}`;
    const original = result(await rest(page, admin, 'GET', path));
    try {
      const wanted = ((original.AutheEnabled as number) ?? 64) | 1024 | (1 << 25);
      const set = await rest(page, admin, 'PUT', path, { AutheEnabled: wanted });
      const stored = result(await rest(page, admin, 'GET', path)).AutheEnabled as number;
      note('service.setHiddenBits', { put: summary(set), original: original.AutheEnabled, wanted, stored });
      if (set.status >= 300) return;
      note(
        'service.clientSystemsOnly',
        await partialPut(page, admin, path, { ClientSystems: ['127.0.0.1'] }),
      );

      const ctx = await browser.newContext({ baseURL: baseURL() });
      const p = await ctx.newPage();
      const sent: string[] = [];
      p.on('request', (r) => {
        if (r.method() === 'PUT' && r.url().includes('/v2/security/service')) sent.push(r.postData() ?? '');
      });
      await p.goto('/login');
      await p.getByLabel('Username').fill(admin.user);
      await p.getByLabel('Password', { exact: true }).fill(admin.password);
      await p.getByRole('button', { name: 'Sign in' }).click();
      await p.waitForURL((u) => !u.pathname.startsWith('/login'));
      await p.goto('/security/services');
      await p
        .getByRole('row', { name: new RegExp(name!) })
        .getByRole('button', { name: 'Edit' })
        .click();
      const dialog = p.getByRole('dialog');
      const ips = dialog.getByRole('textbox', { name: 'Allowed client IPs / CIDRs' });
      await ips.fill('127.0.0.2');
      await ips.press('Enter');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await p.getByRole('button', { name: 'Apply changes' }).click();
      await p.waitForTimeout(2_000);
      const after = result(await rest(page, admin, 'GET', path));
      note('service.uiEdit', {
        stored,
        after: after.AutheEnabled,
        identical: after.AutheEnabled === stored,
        clientSystems: after.ClientSystems,
        sent: sent[0] ? JSON.parse(sent[0]) : null,
      });
      // The list's Enabled column against the service's real state.
      const sw = p.getByRole('row', { name: new RegExp(name!) }).getByRole('switch');
      note('service.listSwitch', {
        enabled: original.Enabled,
        switchChecked: await sw.isChecked().catch(() => null),
      });
      await ctx.close();
    } finally {
      note(
        'service.restore',
        summary(
          await rest(page, admin, 'PUT', path, {
            AutheEnabled: original.AutheEnabled,
            ClientSystems: original.ClientSystems ?? [],
            Enabled: original.Enabled,
          }),
        ),
      );
    }
  });

  test('TLS configuration, database and journal settings: partial PUT', async () => {
    const tls = `/v2/security/ssl-configuration?${q(`${P}TLS`)}`;
    note(
      'tls.create',
      summary(await rest(page, admin, 'PUT', tls, { Description: 'Aperture probe', Type: 0, Enabled: true })),
    );
    note(
      'tls.descriptionOnly',
      await partialPut(page, admin, tls, { Description: 'Aperture probe, renamed' }),
    );
    note('tls.delete', summary(await rest(page, admin, 'DELETE', tls)));

    const dirs = result<{ Directory: string }[]>(await rest(page, admin, 'GET', '/v2/database-dirs'));
    const userDir = (Array.isArray(dirs) ? dirs : []).find((d) => /\/user\/?$/i.test(d.Directory))?.Directory;
    if (userDir) {
      const dpath = `/v2/database-dir?dir=${encodeURIComponent(userDir)}`;
      const orig = result(await rest(page, admin, 'GET', dpath));
      try {
        note(
          'databaseDir.expansionOnly',
          await partialPut(page, admin, dpath, { ExpansionSize: ((orig.ExpansionSize as number) ?? 0) + 1 }),
        );
      } finally {
        await rest(page, admin, 'PUT', dpath, { ExpansionSize: orig.ExpansionSize });
      }
    }
    const cpath = `/v2/database?${q('USER')}`;
    const corig = result(await rest(page, admin, 'GET', cpath));
    try {
      note(
        'database.mountAtStartupOnly',
        await partialPut(page, admin, cpath, { MountAtStartup: !corig.MountAtStartup }),
      );
    } finally {
      await rest(page, admin, 'PUT', cpath, { MountAtStartup: corig.MountAtStartup });
    }
    const jpath = '/v2/journal/settings';
    const jorig = result(await rest(page, admin, 'GET', jpath));
    try {
      note(
        'journal.daysBeforePurgeOnly',
        await partialPut(page, admin, jpath, {
          DaysBeforePurge: ((jorig.DaysBeforePurge as number) ?? 2) + 1,
        }),
      );
    } finally {
      await rest(page, admin, 'PUT', jpath, { DaysBeforePurge: jorig.DaysBeforePurge });
    }
  });
});
