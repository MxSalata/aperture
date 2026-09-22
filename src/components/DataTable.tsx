import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  Menu,
  Pagination,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
  IconArrowsSort,
  IconChevronDown,
  IconChevronUp,
  IconColumns,
  IconDownload,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type Row,
  type SortingState,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { toCsv } from '@/lib/csv';
import { redactDeep } from '@/lib/redact';
import { downloadText } from '@/lib/download';

export type { ColumnDef };

const PAGE_SIZES = [25, 50, 100, 250];

interface Props<T> {
  data: T[] | undefined;
  columns: ColumnDef<T, unknown>[];
  loading?: boolean;
  error?: unknown;
  /** Called when a row is clicked; rows get pointer cursor and become keyboard-activatable. */
  onRowClick?: (row: T) => void;
  /** Accessible name for a clickable row (announced instead of the concatenated cells). */
  getRowLabel?: (row: T) => string;
  /** Row key; defaults to index. */
  getRowId?: (row: T, index: number) => string;
  /** Shown when the server returned no rows at all (filtering to nothing has its own message). */
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
  /**
   * Makes the view shareable and durable: filter, sort and page go to the URL
   * (`?q=&sort=-Pid&page=2`, so Back and copied links restore the view) and column
   * choices plus page size are remembered per key in localStorage. One keyed table per page.
   */
  stateKey?: string;
  /** Adds an "Export CSV" button; the file gets this base name and contains the filtered, sorted, visible rows. */
  exportName?: string;
  /**
   * The most rows the server returns for this list. SysAdmin API lists stop at `maxRows`,
   * 1000 unless the request says otherwise, without saying there were more; a result that
   * reaches the limit is flagged. 0 turns the check off (data that is not a server list).
   */
  serverLimit?: number;
}

/** The spec's default `maxRows` for every SysAdmin API list. */
export const SERVER_LIST_LIMIT = 1000;

interface Prefs {
  columnVisibility?: VisibilityState;
  pageSize?: number;
}

function readPrefs(key: string | undefined): Prefs {
  if (!key) return {};
  try {
    const raw = localStorage.getItem(`aperture.table.${key}`);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(key: string | undefined, prefs: Prefs) {
  if (!key) return;
  try {
    localStorage.setItem(`aperture.table.${key}`, JSON.stringify(prefs));
  } catch {
    /* storage blocked: preferences simply do not persist */
  }
}

function parseSort(s: string | null): SortingState | null {
  if (!s) return null;
  const desc = s.startsWith('-');
  return [{ id: desc ? s.slice(1) : s, desc }];
}

function encodeSort(sorting: SortingState): string | null {
  const [first] = sorting;
  return first ? `${first.desc ? '-' : ''}${first.id}` : null;
}

/** Sort and page live in the URL when `stateKey` is set, otherwise in component state. */
function useTableNavigationState(fromUrl: boolean, initialSorting: SortingState) {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<{ sorting: SortingState; pageIndex: number }>({
    sorting: initialSorting,
    pageIndex: 0,
  });

  const sorting = fromUrl ? (parseSort(params.get('sort')) ?? initialSorting) : local.sorting;
  const pageIndex = fromUrl ? Math.max(0, (Number(params.get('page')) || 1) - 1) : local.pageIndex;
  const initialFilter = fromUrl ? (params.get('q') ?? '') : '';

  const write = useCallback(
    (patch: Record<string, string | number | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '' || (k === 'page' && Number(v) <= 1)) next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setSorting = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (fromUrl) write({ sort: encodeSort(next), page: null });
      else setLocal({ sorting: next, pageIndex: 0 });
    },
    [fromUrl, sorting, write],
  );
  const setPageIndex = useCallback(
    (i: number) => {
      if (fromUrl) write({ page: i + 1 });
      else setLocal((s) => ({ ...s, pageIndex: i }));
    },
    [fromUrl, write],
  );
  const setFilterParam = useCallback(
    (q: string) => {
      if (fromUrl) write({ q: q || null, page: null });
    },
    [fromUrl, write],
  );

  return { sorting, pageIndex, initialFilter, setSorting, setPageIndex, setFilterParam };
}

/**
 * The one table used everywhere: sorting, quick search, column chooser,
 * pagination, sticky header, loading and empty states, CSV export.
 */
export function DataTable<T>({
  data,
  columns,
  loading,
  error,
  onRowClick,
  getRowLabel,
  getRowId,
  emptyMessage = 'Nothing to show',
  searchable = true,
  searchPlaceholder = 'Filter…',
  toolbar,
  pageSize: defaultPageSize = 25,
  initialSorting = [],
  maxHeight,
  dense,
  rowProps,
  hideColumnMenu,
  stateKey,
  exportName,
  serverLimit = SERVER_LIST_LIMIT,
}: Props<T>) {
  const nav = useTableNavigationState(stateKey !== undefined, initialSorting);
  const [filterInput, setFilterInput] = useState(nav.initialFilter);
  const [globalFilter] = useDebouncedValue(filterInput, 200);
  const [prefs] = useState(() => readPrefs(stateKey));
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(prefs.columnVisibility ?? {});
  const [pageSize, setPageSize] = useState(prefs.pageSize ?? defaultPageSize);
  const rows = useMemo(() => data ?? [], [data]);

  // Mirror the (debounced) filter into the URL without re-navigating on every keystroke.
  const lastPushed = useRef(nav.initialFilter);
  const { setFilterParam } = nav;
  useEffect(() => {
    if (lastPushed.current !== globalFilter) {
      lastPushed.current = globalFilter;
      setFilterParam(globalFilter);
    }
  }, [globalFilter, setFilterParam]);

  useEffect(() => {
    writePrefs(stateKey, { columnVisibility, pageSize });
  }, [stateKey, columnVisibility, pageSize]);

  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: nav.pageIndex, pageSize }),
    [nav.pageIndex, pageSize],
  );
  const { setPageIndex } = nav;
  const onPaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      if (next.pageSize !== pagination.pageSize) setPageSize(next.pageSize);
      if (next.pageIndex !== pagination.pageIndex) setPageIndex(next.pageIndex);
    },
    [pagination, setPageIndex],
  );

  // TanStack Table hands out fresh functions on a stable object, which the React Compiler cannot
  // memoise; the build does not run the compiler, and this component must never be memoised by it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting: nav.sorting, globalFilter, columnVisibility, pagination },
    onSortingChange: nav.setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId,
    globalFilterFn: 'includesString',
    autoResetPageIndex: false,
  });

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const total = table.getFilteredRowModel().rows.length;
  const visibleRows = table.getRowModel().rows;

  // A stale page from the URL (or a shrinking result) must not show an empty table.
  useEffect(() => {
    if (pageCount > 0 && pageIndex >= pageCount) setPageIndex(pageCount - 1);
  }, [pageCount, pageIndex, setPageIndex]);

  const exportCsv = () => {
    const cols = table.getVisibleLeafColumns().filter((c) => c.accessorFn);
    const headers = cols.map((c) => (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id));
    const body = table
      .getPrePaginationRowModel()
      .rows.map((r) => cols.map((c) => redactDeep(r.getValue(c.id), c.id).value));
    downloadText(
      `${exportName}-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      toCsv(headers, body),
      'text/csv;charset=utf-8',
    );
  };

  const activate = (row: Row<T>) => onRowClick?.(row.original);

  return (
    <Stack gap="xs">
      {(searchable || toolbar || !hideColumnMenu || exportName) && (
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Group gap="xs" wrap="wrap" style={{ flex: 1 }}>
            {searchable ? (
              <TextInput
                size="xs"
                w={260}
                placeholder={searchPlaceholder}
                leftSection={<IconSearch size={14} />}
                rightSection={
                  filterInput ? (
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      aria-label="Clear"
                      onClick={() => setFilterInput('')}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null
                }
                value={filterInput}
                onChange={(e) => setFilterInput(e.currentTarget.value)}
                aria-label="Filter rows"
              />
            ) : null}
            {toolbar}
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed" className="tabular" role="status">
              {loading ? 'Loading…' : `${total} row${total === 1 ? '' : 's'}`}
            </Text>
            {serverLimit > 0 && rows.length === serverLimit ? (
              <Tooltip
                label={`The server returns at most ${serverLimit} rows for this list and returned exactly that many: the instance may hold more. Narrow the request (a filter) to see the rest.`}
                multiline
                w={300}
              >
                <Badge size="xs" color="yellow" variant="light" tabIndex={0}>
                  server limit reached
                </Badge>
              </Tooltip>
            ) : null}
            {exportName ? (
              <Tooltip label="Export the filtered rows as CSV">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Export CSV"
                  onClick={exportCsv}
                  disabled={!total}
                >
                  <IconDownload size={16} />
                </ActionIcon>
              </Tooltip>
            ) : null}
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
        <Table
          className="sticky-thead"
          striped
          withRowBorders
          verticalSpacing={dense ? 4 : 'xs'}
          horizontalSpacing="sm"
          style={{ minWidth: 640 }}
          aria-busy={loading || undefined}
        >
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
                      style={{
                        cursor: canSort ? 'pointer' : undefined,
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                        width: header.getSize() !== 150 ? header.getSize() : undefined,
                      }}
                      aria-sort={
                        sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                      }
                    >
                      <Group gap={4} wrap="nowrap">
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        {canSort ? (
                          sorted === 'asc' ? (
                            <IconChevronUp size={14} />
                          ) : sorted === 'desc' ? (
                            <IconChevronDown size={14} />
                          ) : (
                            <IconArrowsSort size={12} className="muted-soft" />
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
                  <Center py="xl" role="status" aria-label="Loading rows">
                    <Loader size="sm" />
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : error ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Center py="xl">
                    <Text c="red" size="sm" role="alert">
                      {error instanceof Error ? error.message : String(error)}
                    </Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : !visibleRows.length ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Center py="xl">
                    {rows.length === 0 ? (
                      <Text c="dimmed" size="sm" role="status">
                        {emptyMessage}
                      </Text>
                    ) : (
                      <Group gap="xs" role="status">
                        <Text c="dimmed" size="sm">
                          No rows match “{globalFilter}”
                        </Text>
                        <Button size="compact-xs" variant="subtle" onClick={() => setFilterInput('')}>
                          Clear filter
                        </Button>
                      </Group>
                    )}
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : (
              visibleRows.map((row: Row<T>) => (
                <Table.Tr
                  key={row.id}
                  className={onRowClick ? 'clickable-row' : undefined}
                  onClick={onRowClick ? () => activate(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  aria-label={onRowClick && getRowLabel ? getRowLabel(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                            e.preventDefault();
                            activate(row);
                          }
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

      {pageCount > 1 || rows.length > PAGE_SIZES[0] ? (
        <Group justify="flex-end" gap="sm">
          <Select
            size="xs"
            w={92}
            data={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} rows` }))}
            value={String(pageSize)}
            onChange={(v) => v && table.setPageSize(Number(v))}
            aria-label="Rows per page"
            allowDeselect={false}
          />
          {pageCount > 1 ? (
            <Pagination
              size="sm"
              total={pageCount}
              value={pageIndex + 1}
              onChange={(p) => table.setPageIndex(p - 1)}
            />
          ) : null}
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
