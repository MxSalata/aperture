import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { api, run, useApiMutation } from '@/api/hooks';
import { reviewChanges } from '@/components/ReviewChanges';
import { secKeys } from './keys';
import { collectionRules, readCollection, resourceRules } from './wallet';

/** A collection the dialog edits, as read just before it opened. */
export interface CollectionEdit {
  name: string;
  UseResource: string;
  EditResource: string;
  /** The collection as read, for the review of the changes. */
  before: Record<string, unknown>;
}

/**
 * Creates a wallet collection (edit null), or changes the resources of one after a review of the
 * changes. Mounted afresh for every opening (a new key), so the form starts from `edit`.
 */
export function WalletCollectionDialog({
  opened,
  onClose,
  edit,
}: {
  opened: boolean;
  onClose: () => void;
  edit: CollectionEdit | null;
}) {
  const editing = edit?.name ?? null;
  const before = edit?.before;
  const form = useForm({
    initialValues: edit
      ? { Name: edit.name, UseResource: edit.UseResource, EditResource: edit.EditResource }
      : { Name: '', UseResource: '%Admin_Manage:USE', EditResource: '%Admin_Secure:USE' },
    validate: { Name: collectionRules, UseResource: resourceRules, EditResource: resourceRules },
  });
  const save = useApiMutation(
    (v: { Name: string; UseResource?: string; EditResource?: string }) =>
      run(
        api().PUT('/v2/wallet/collection', {
          params: { query: { name: v.Name } },
          body: {
            ...(v.UseResource !== undefined ? { UseResource: v.UseResource.trim() } : {}),
            ...(v.EditResource !== undefined ? { EditResource: v.EditResource.trim() } : {}),
          },
        }),
        'PUT',
      ),
    {
      success: (_d, v) => `Wallet collection ${v.Name} ${editing ? 'saved' : 'created'}`,
      invalidate: [secKeys.walletCollections],
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? `Edit ${editing}` : 'Create wallet collection'}
      centered
    >
      <form
        onSubmit={form.onSubmit((v) =>
          editing
            ? reviewChanges({
                title: `Review changes to ${editing}`,
                before,
                after: { UseResource: v.UseResource.trim(), EditResource: v.EditResource.trim() },
                refetch: () => readCollection(editing) as Promise<Record<string, unknown>>,
                onConfirm: () => save.mutateAsync(v),
              })
            : save.mutate(v),
        )}
      >
        <Stack gap="sm">
          <TextInput label="Name" disabled={!!editing} data-autofocus {...form.getInputProps('Name')} />
          <TextInput
            label="Resource required to use a secret"
            description="resource:permission, e.g. %Admin_Manage:USE (READ when the permission is omitted)"
            {...form.getInputProps('UseResource')}
          />
          <TextInput
            label="Resource required to add, edit or remove secrets"
            description="e.g. %Admin_Secure:USE (WRITE when the permission is omitted)"
            {...form.getInputProps('EditResource')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
