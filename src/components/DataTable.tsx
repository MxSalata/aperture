import { ActionIcon, Box, Center, Group, Loader, Menu, Pagination, ScrollArea, Table, Text, TextInput, Tooltip, Checkbox, Stack } from '@mantine/core';
import { IconArrowsSort, IconChevronDown, IconChevronUp, IconColumns, IconSearch } from '@tabler/icons-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useMemo, useState, type ReactNode } from 'react';

export type { ColumnDef };

interface Props<T> {
  data: T[] | undefined;
  columns: ColumnDef<T, unknown>[];
  loading?: boolean;
  error?: unknown;
  /** Called when a row is clicked; rows get pointer cursor. */
  onRowClick?: (row: T) => void;
  /** Row key; defaults to index. */
  getRowId?: (row: T, index: number) => string;
  emptyMessage?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Extra toolbar content (filters, actions). */
  toolbar?: ReactNode;
  pageSize?: number;
  initialSorting?: SortingState;
  /** Height of the scroll area; the header stays sticky. */
  maxHeight?: number | string;
  dense?: boolean;
  rowProps?: (row: T) => Record<string, unknown>;
  /** Hide the column chooser. */
  hideColumnMenu?: boolean;
}

/**
 * The one table used everywhere: sorting, quick search, column chooser,
 * pagination, sticky header, loading and empty states.
 */
export function DataTable<T>({
  data,
  columns,
  loading,
  error,
  onRowClick,
  getRowId,
  emptyMessage = 'Nothing to show',
  searchable = true,
  searchPlaceholder = 'Filter…',
  toolbar,
  pageSize = 25,
  initialSorting = [],
  maxHeight,
  dense,
  rowProps,
  hideColumnMenu,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const rows = useMemo(() => data ?? [], [data]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId,
    initialState: { pagination: { pageSize } },
    globalFilterFn: 'includesString',
  });

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const total = table.getFilteredRowModel().rows.length;

  return (
    <Stack gap="xs">
      {(searchable || toolbar || !hideColumnMenu) && (
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Group gap="xs" wrap="wrap" style={{ flex: 1 }}>
            {searchable ? (
              <TextInput
                size="xs"
                w={260}
                placeholder={searchPlaceholder}
                leftSection={<IconSearch size={14} />}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.currentTarget.value)}
                aria-label="Filter rows"
              />
            ) : null}
            {toolbar}
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed" className="tabular">
              {loading ? 'Loading…' : `${total} row${total === 1 ? '' : 's'}`}
            </Text>
            {!hideColumnMenu ? (
              <Menu shadow="md" closeOnItemClick={false} withinPortal>
                <Menu.Target>
                  <Tooltip label="Columns">
                    <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Choose columns">
                      <IconColumns size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Columns</Menu.Label>
                  {table.getAllLeafColumns().map((col) => (
                    <Menu.Item key={col.id} onClick={() => col.toggleVisibility()}>
                      <Checkbox
                        size="xs"
                        readOnly
                        checked={col.getIsVisible()}
                        label={typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id}
                        styles={{ input: { cursor: 'pointer' }, label: { cursor: 'pointer' } }}
                      />
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            ) : null}
          </Group>
        </Group>
      )}

      <ScrollArea type="auto" style={{ maxHeight }} offsetScrollbars>
        <Table className="sticky-thead" striped withRowBorders verticalSpacing={dense ? 4 : 'xs'} horizontalSpacing="sm" style={{ minWidth: 640 }}>
          <Table.Thead>
            {table.getHeaderGroups().map((hg) => (
              <Table.Tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <Table.Th
                      key={header.id}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      style={{ cursor: canSort ? 'pointer' : undefined, whiteSpace: 'nowrap', userSelect: 'none', width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    >
                      <Group gap={4} wrap="nowrap">
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        {canSort ? (
                          sorted === 'asc' ? (
                            <IconChevronUp size={14} />
                          ) : sorted === 'desc' ? (
                            <IconChevronDown size={14} />
                          ) : (
                            <IconArrowsSort size={12} style={{ opacity: 0.35 }} />
                          )
                        ) : null}
                      </Group>
                    </Table.Th>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {loading && !rows.length ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Center py="xl">
                    <Loader size="sm" />
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : error ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Center py="xl">
                    <Text c="red" size="sm">
                      {error instanceof Error ? error.message : String(error)}
                    </Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : !table.getRowModel().rows.length ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Center py="xl">
                    <Text c="dimmed" size="sm">
                      {emptyMessage}
                    </Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : (
              table.getRowModel().rows.map((row: Row<T>) => (
                <Table.Tr
                  key={row.id}
                  className={onRowClick ? 'clickable-row' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter') onRowClick(row.original);
                        }
                      : undefined
                  }
                  {...(rowProps?.(row.original) ?? {})}
                >
                  {row.getVisibleCells().map((cell) => (
                    <Table.Td key={cell.id} style={{ verticalAlign: 'middle' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {pageCount > 1 ? (
        <Group justify="flex-end">
          <Pagination size="sm" total={pageCount} value={pageIndex + 1} onChange={(p) => table.setPageIndex(p - 1)} />
        </Group>
      ) : null}
      <Box />
    </Stack>
  );
}

/** Small helper to stop row-click navigation from firing when clicking an action inside the row. */
export function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}
