import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { DataTable, type ColumnDef } from '../DataTable';

interface Row {
  name: string;
  n: number;
}
const rows: Row[] = [
  { name: 'alpha', n: 1 },
  { name: 'beta', n: 2 },
];
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'n', header: 'N' },
];

const mount = (ui: React.ReactNode, entries = ['/']) =>
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>
    </MantineProvider>,
  );

describe('DataTable', () => {
  it('tells "no rows at all" apart from "nothing matches the filter"', async () => {
    mount(<DataTable data={rows} columns={columns} emptyMessage="No locks held on this instance" />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter rows'), { target: { value: 'zzz' } });
    expect(await screen.findByText(/No rows match/)).toBeInTheDocument();
    expect(screen.queryByText('No locks held on this instance')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(await screen.findByText('alpha')).toBeInTheDocument();
  });

  it('shows the caller\'s empty message when the server returned nothing', () => {
    mount(<DataTable data={[]} columns={columns} emptyMessage="No locks held on this instance" />);
    expect(screen.getByText('No locks held on this instance')).toBeInTheDocument();
  });

  it('restores a shared view from the URL when keyed', () => {
    mount(<DataTable stateKey="t" data={rows} columns={columns} />, ['/?q=beta&sort=-n']);
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.queryByText('alpha')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'N' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('exposes clickable rows as buttons with an accessible name', () => {
    mount(<DataTable data={rows} columns={columns} onRowClick={() => {}} getRowLabel={(r) => `Open ${r.name}`} />);
    expect(screen.getByRole('button', { name: 'Open alpha' })).toHaveAttribute('tabindex', '0');
  });
});
