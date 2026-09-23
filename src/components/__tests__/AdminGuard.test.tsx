import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { confirmDanger } from '../ConfirmDanger';
import type { GuardOutcome } from '../AdminGuard';

function open(outcome: GuardOutcome) {
  render(
    <MantineProvider>
      <ModalsProvider>
        <div />
      </ModalsProvider>
    </MantineProvider>,
  );
  act(() =>
    confirmDanger({
      title: 'Disable account',
      message: 'Disable alice?',
      confirmLabel: 'Disable',
      guard: async () => outcome,
      onConfirm: () => undefined,
    }),
  );
}

const button = () => screen.getByRole('button', { name: 'Disable' });

describe('a dialog guarded against locking everyone out', () => {
  it('keeps the action disabled when the change would leave no administrator', async () => {
    open({ status: 'locks-out', before: ['alice'] });
    expect(await screen.findByText('This would lock everyone out')).toBeInTheDocument();
    expect(button()).toBeDisabled();
  });

  it('lets the action run, and says who still administers security', async () => {
    open({ status: 'ok', after: ['bob', 'carol'] });
    expect(await screen.findByText(/Security stays administered by bob, carol/)).toBeInTheDocument();
    expect(button()).toBeEnabled();
  });

  it('says who loses what', async () => {
    open({
      status: 'ok',
      after: ['bob'],
      impact: {
        report: {
          changes: [{ user: 'operator', lost: ['%Admin_Journal:U'], gained: ['%DB_USER:R'] }],
          checked: 3,
          more: 0,
        },
      },
    });
    expect(await screen.findByText('Who loses what')).toBeInTheDocument();
    expect(screen.getByText('%Admin_Journal:U').closest('p')).toHaveTextContent(
      'operator loses %Admin_Journal:U; gains %DB_USER:R',
    );
    expect(button()).toBeEnabled();
  });

  it('asks for the name to be typed when it cannot tell', async () => {
    open({ status: 'unknown', error: 'HTTP 500' });
    const input = await screen.findByLabelText(/to go on/);
    expect(button()).toBeDisabled();
    fireEvent.change(input, { target: { value: 'confirm' } });
    expect(button()).toBeEnabled();
  });
});
