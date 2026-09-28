import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { api, run, useApiMutation } from '@/api/hooks';
import type { Schemas } from '@/api/types';
import { secKeys } from './keys';
import { fullSecretName, SECRET_TYPES, USAGES, type SecretType } from './wallet';

/** Where a secret goes: its collection, and the secret it replaces (none: a new one). */
export interface SecretTarget {
  collection: string;
  replace?: string;
}

/**
 * Adds a secret to a collection, or replaces one (the API answers names and types only, never a
 * value, so a secret is replaced whole). Mounted afresh for every opening (a new key).
 */
export function WalletSecretDialog({
  opened,
  onClose,
  target,
}: {
  opened: boolean;
  onClose: () => void;
  target: SecretTarget | null;
}) {
  const form = useForm({
    initialValues: {
      name: target?.replace ?? '',
      Type: '%Wallet.KeyValue' as SecretType,
      entries: [{ key: 'user', value: '' }] as { key: string; value: string }[],
      Usage: ['HTTP'] as string[],
      RequireTLS: true,
      AllowedHosts: [] as string[],
      configJson: '{\n  \n}',
    },
    validate: {
      name: (v) => (/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v) ? null : 'Letters, digits, _ . and -'),
      entries: {
        key: (v, values) => (values.Type !== '%Wallet.KeyValue' || v.trim() ? null : 'Required'),
      },
      configJson: (v, values) => {
        if (values.Type === '%Wallet.KeyValue') return null;
        try {
          const parsed = JSON.parse(v) as unknown;
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? null : 'A JSON object';
        } catch {
          return 'Not valid JSON';
        }
      },
    },
  });
  const putSecret = useApiMutation(
    (v: typeof form.values & { collection: string }) => {
      const config: Record<string, unknown> =
        v.Type === '%Wallet.KeyValue'
          ? {
              Secret: Object.fromEntries(
                v.entries.filter((e) => e.key.trim()).map((e) => [e.key.trim(), e.value]),
              ),
              Usage: v.Usage,
              RequireTLS: v.RequireTLS,
              AllowedHosts: v.AllowedHosts,
            }
          : (JSON.parse(v.configJson) as Record<string, unknown>);
      return run(
        api().PUT('/v2/wallet/secret', {
          params: { query: { name: fullSecretName(v.collection, v.name) } },
          body: { Type: v.Type, WalletSecretConfig: config as Schemas['WalletSecret']['WalletSecretConfig'] },
        }),
        'PUT',
      );
    },
    {
      success: (_d, v) =>
        `Wallet secret ${fullSecretName(v.collection, v.name)} ${target?.replace ? 'replaced' : 'created'}`,
      invalidate: [secKeys.walletCollections, ['security', 'wallet', 'secrets']],
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        target?.replace
          ? `Replace ${target.collection}.${target.replace}`
          : `Add a secret to ${target?.collection ?? ''}`
      }
      centered
      size="lg"
    >
      <form onSubmit={form.onSubmit((v) => putSecret.mutate({ ...v, collection: target?.collection ?? '' }))}>
        <Stack gap="sm">
          <Group grow>
            <TextInput
              label="Secret name"
              description={`Stored as ${target?.collection ?? ''}.<name>`}
              disabled={!!target?.replace}
              data-autofocus
              {...form.getInputProps('name')}
            />
            <Select label="Type" data={SECRET_TYPES} allowDeselect={false} {...form.getInputProps('Type')} />
          </Group>
          {form.values.Type === '%Wallet.KeyValue' ? (
            <>
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Values
                </Text>
                {form.values.entries.map((_, i) => (
                  <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
                    <TextInput
                      placeholder="key, e.g. user"
                      aria-label={`Key ${i + 1}`}
                      style={{ flex: 1 }}
                      {...form.getInputProps(`entries.${i}.key`)}
                    />
                    <PasswordInput
                      placeholder="value"
                      aria-label={`Value ${i + 1}`}
                      autoComplete="new-password"
                      style={{ flex: 2 }}
                      {...form.getInputProps(`entries.${i}.value`)}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Remove entry"
                      disabled={form.values.entries.length === 1}
                      onClick={() => form.removeListItem('entries', i)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                ))}
                <Button
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<IconPlus size={12} />}
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => form.insertListItem('entries', { key: '', value: '' })}
                >
                  Another entry
                </Button>
              </Stack>
              <Group grow align="flex-start">
                <MultiSelect label="Usage" data={USAGES} {...form.getInputProps('Usage')} />
                <TagsInput
                  label="Allowed hosts"
                  description="Hosts the secret may be sent to over HTTP"
                  placeholder="host, Enter"
                  {...form.getInputProps('AllowedHosts')}
                />
              </Group>
              <Checkbox
                label="Require TLS when the secret is sent in an HTTP request"
                {...form.getInputProps('RequireTLS', { type: 'checkbox' })}
              />
            </>
          ) : (
            <Textarea
              label="WalletSecretConfig (JSON)"
              description="Passed as it is to the Create or Modify method of the secret's class"
              autosize
              minRows={4}
              className="mono"
              {...form.getInputProps('configJson')}
            />
          )}
          <Text size="xs" c="dimmed">
            The value is sent once, over this session's connection, and never shown again anywhere in
            Aperture.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={putSecret.isPending}>
              {target?.replace ? 'Replace' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
