import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { reviewChanges } from '../ReviewChanges';
import { putBody, sendsOnlyChanges } from '@/api/partialPut';

type Settings = { MaxSize: number; ExpansionSize: number; ReadOnly: boolean };
const loaded: Settings = { MaxSize: 0, ExpansionSize: 10, ReadOnly: false };

function open(opts: { onlyChanges: boolean; server: Settings; onConfirm: (c: Partial<Settings>) => void }) {
  render(
    <MantineProvider>
      <ModalsProvider>
        <div />
      </ModalsProvider>
    </MantineProvider>,
  );
  act(() =>
    reviewChanges<Settings>({
      before: loaded,
      after: { ...loaded, ExpansionSize: 20 },
      refetch: async () => opts.server,
      onlyChanges: opts.onlyChanges,
      onConfirm: opts.onConfirm,
    }),
  );
}

const apply = () => screen.getByRole('button', { name: 'Apply changes' });

describe('the review of an edit', () => {
  it('hands the write only the fields that changed', async () => {
    const onConfirm = vi.fn();
    open({ onlyChanges: true, server: loaded, onConfirm });
    await waitFor(() => expect(apply()).toBeEnabled());
    fireEvent.click(apply());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ ExpansionSize: 20 }));
  });

  it('keeps a field changed on the server that the edit does not touch, when only changes are sent', async () => {
    const onConfirm = vi.fn();
    open({ onlyChanges: true, server: { ...loaded, ReadOnly: true }, onConfirm });
    expect(await screen.findByText(/kept as it is there/)).toHaveTextContent('Read Only');
    expect(apply()).toBeEnabled();
  });

  it('stops when the server changed a field the edit changes too', async () => {
    open({ onlyChanges: true, server: { ...loaded, ExpansionSize: 15 }, onConfirm: vi.fn() });
    expect(await screen.findByText('Changed on the server since you opened it')).toBeInTheDocument();
    expect(apply()).toBeDisabled();
  });

  it('stops on any server-side change when the whole object is sent', async () => {
    open({ onlyChanges: false, server: { ...loaded, ReadOnly: true }, onConfirm: vi.fn() });
    expect(await screen.findByText('Changed on the server since you opened it')).toBeInTheDocument();
    expect(apply()).toBeDisabled();
  });
});

describe('the body of an edit', () => {
  it('is the changes for a type whose PUT merges, the whole form otherwise', () => {
    const form = { a: 1, b: 2 };
    expect(sendsOnlyChanges('/v2/journal/settings')).toBe(true);
    expect(putBody('/v2/journal/settings', form, { b: 3 })).toEqual({ b: 3 });
    expect(sendsOnlyChanges('/v2/security/user')).toBe(false);
    expect(putBody('/v2/security/user', form, { b: 3 })).toBe(form);
  });
});
