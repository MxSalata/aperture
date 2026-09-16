import { Button, Checkbox, Grid, Group, Modal, NumberInput, Paper, Select, Stack, TagsInput, Text, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { Application } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { confirmDanger } from '@/components/ConfirmDanger';
import { BoolBadge } from '@/components/StatusBadge';
import { useSession } from '@/stores/session';
import { AUTHE_FLAGS, bitsToFlags, flagsToBits, secKeys } from './keys';

type FormValues = Application & { flags: string[] };

export default function WebAppDetailPage() {
  const [params] = useSearchParams();
  const name = params.get('name') ?? '';
  const navigate = useNavigate();
  const info = useSession((s) => s.info);
  const q = useQuery({ queryKey: secKeys.webApp(name), enabled: !!name, queryFn: () => result(api().GET('/v2/web-app', { params: { query: { name } } })) });
  const p = { params: { query: { name } } } as const;
  const [opened, { open, close }] = useDisclosure(false);
  const save = useApiMutation((v: FormValues) => { const { flags, ...body } = v; return run(api().PUT('/v2/web-app', { ...p, body: { ...body, AutheEnabled: flagsToBits(flags.map(Number)) } }), 'PUT'); }, { invalidate: [secKeys.webApps, secKeys.webApp(name)], onSuccess: close });
  const remove = useApiMutation(() => run(api().DELETE('/v2/web-app', p), 'DELETE'), { invalidate: [secKeys.webApps], onSuccess: () => navigate('/security/web-apps') });
  const form = useForm<FormValues>({ initialValues: { flags: [] } });
  // Populate the form once the record arrives; the form object itself is stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (q.data) form.setValues({ ...q.data, flags: bitsToFlags(q.data.AutheEnabled).map(String) }); }, [q.data]);
  const a = q.data;

  const groups: { title: string; keys: string[] }[] = [
    { title: 'General', keys: ['Description', 'Enabled', 'NameSpace', 'IsNameSpaceDefault', 'Resource', 'MatchRoles', 'Timeout', 'GroupById'] },
    { title: 'REST / CSP', keys: ['DispatchClass', 'Path', 'ServeFiles', 'ServeFilesTimeout', 'Recurse', 'CSPZENEnabled', 'AutoCompile', 'LoginPage', 'ErrorPage', 'ChangePasswordPage', 'EventClass', 'Package', 'SuperClass', 'PermittedClasses', 'LockCSPName', 'RedirectEmptyPath'] },
    { title: 'Authentication', keys: ['AutheEnabled', 'JWTAuthEnabled', 'JWTAccessTokenTimeout', 'JWTRefreshTokenTimeout', 'TwoFactorEnabled', 'UseCookies', 'UseSessionCookie', 'CookiePath', 'CSRFToken'] },
    { title: 'CORS', keys: ['CorsAllowlist', 'CorsCredentialsAllowed', 'CorsHeadersList'] },
    { title: 'Features', keys: ['DeepSeeEnabled', 'iKnowEnabled', 'InbndWebServicesEnabled'] },
  ];

  return (
    <>
      <Group gap="xs" mb="xs"><Button component={Link} to="/security/web-apps" variant="subtle" size="compact-sm" leftSection={<IconArrowLeft size={14} />}>Web applications</Button></Group>
      <PageHeader title={<Group gap="sm"><span className="mono">{name}</span>{a ? <BoolBadge value={a.Enabled} yes="Enabled" no="Disabled" /> : null}{a?.JWTAuthEnabled ? <BoolBadge value yes="JWT" color="cyan" /> : null}</Group>} description={a?.Description} privileges={['%Admin_Secure:U']}
        actions={<><Button size="xs" onClick={open}>Edit</Button><Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={() => confirmDanger({ title: 'Delete web application', message: <>Delete <b>{name}</b>?</>, confirmText: name, confirmLabel: 'Delete', onConfirm: () => remove.mutateAsync() })}>Delete</Button></>} />
      {q.isError ? <ErrorAlert error={q.error} onRetry={() => q.refetch()} /> : null}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          {a ? groups.map((g) => {
            const obj = Object.fromEntries(g.keys.filter((k) => k in a).map((k) => [k, (a as Record<string, unknown>)[k]]));
            if (!Object.keys(obj).length) return null;
            return <Paper key={g.title} p="md" mb="md"><Title order={5} mb="xs">{g.title}</Title><KeyValueList cols={3} items={objectToItems(obj, { labels: { AutheEnabled: 'Authentication flags', CSPZENEnabled: 'CSP/Zen enabled', iKnowEnabled: 'iKnow enabled' } })} /></Paper>;
          }) : <Text size="sm" c="dimmed">Loading…</Text>}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}><Paper p="md"><JsonViewer value={a} maxHeight={800} /></Paper></Grid.Col>
      </Grid>
      <Modal opened={opened} onClose={close} title={`Edit ${name}`} centered size="lg">
        <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Description" {...form.getInputProps('Description')} />
            <Group grow>
              <Select label="Namespace" data={info?.namespaces?.map((n) => n.name ?? '').filter(Boolean) ?? []} searchable {...form.getInputProps('NameSpace')} />
              <TextInput label="Resource required" {...form.getInputProps('Resource')} />
            </Group>
            <Group grow>
              <TextInput label="Dispatch class" {...form.getInputProps('DispatchClass')} />
              <TextInput label="Physical path" {...form.getInputProps('Path')} />
            </Group>
            <Group grow>
              <NumberInput label="Session timeout (s)" min={0} {...form.getInputProps('Timeout')} />
              <Select label="Serve files" data={['Always', 'No', 'Always and cached', 'Use IRIS security']} {...form.getInputProps('ServeFiles')} />
            </Group>
            <Checkbox.Group label="Authentication methods" {...form.getInputProps('flags')}>
              <Group gap="sm" mt={4}>{AUTHE_FLAGS.map((f) => <Checkbox key={f.bit} value={String(f.bit)} label={f.label} />)}</Group>
            </Checkbox.Group>
            <Group grow align="flex-end">
              <Checkbox label="JWT authentication" {...form.getInputProps('JWTAuthEnabled', { type: 'checkbox' })} />
              <NumberInput label="Access token TTL (s)" min={60} {...form.getInputProps('JWTAccessTokenTimeout')} />
              <NumberInput label="Refresh token TTL (s)" min={60} {...form.getInputProps('JWTRefreshTokenTimeout')} />
            </Group>
            <TagsInput label="CORS allow-list (origins)" placeholder="https://portal.example.org" {...form.getInputProps('CorsAllowlist')} />
            <TagsInput label="CORS allowed headers" {...form.getInputProps('CorsHeadersList')} />
            <Group>
              <Checkbox label="CORS credentials allowed" {...form.getInputProps('CorsCredentialsAllowed', { type: 'checkbox' })} />
              <Checkbox label="CSRF token" {...form.getInputProps('CSRFToken', { type: 'checkbox' })} />
              <Checkbox label="Enabled" {...form.getInputProps('Enabled', { type: 'checkbox' })} />
              <Checkbox label="Namespace default" {...form.getInputProps('IsNameSpaceDefault', { type: 'checkbox' })} />
            </Group>
            <Group justify="flex-end"><Button variant="default" onClick={close}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
