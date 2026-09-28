import { Button, Menu, Text, VisuallyHidden } from '@mantine/core';
import { IconChartLine, IconCheck, IconGripVertical } from '@tabler/icons-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHoldToReorder } from '@/components/useHoldToReorder';
import {
  CHART_TITLES,
  isCustomChartOrder,
  orderCharts,
  useDashboard,
  type DashboardChart,
} from '@/stores/dashboard';

/** The one reorder group: the charts. */
const CHARTS = 'charts';

/**
 * The dashboard's Charts menu: tick the charts to show. They are listed, and shown, in the order
 * the user arranged, A to Z on a fresh device; as in the navigation menu, hold one and drag it, or
 * move the focused one with Alt+Up and Alt+Down, announced to screen readers.
 */
export function ChartPicker() {
  const { charts, order } = useDashboard(useShallow((s) => ({ charts: s.charts, order: s.order })));
  const toggle = useDashboard((s) => s.toggle);
  const move = useDashboard((s) => s.move);
  const resetOrder = useDashboard((s) => s.resetOrder);
  const ordered = useMemo(() => orderCharts(order), [order]);
  const [announcement, setAnnouncement] = useState('');

  const { listRef, handle, rowStyle, onClickCapture, keepFocus } = useHoldToReorder({
    rowsOf: () => '[data-chart-row]',
    keysOf: () => ordered,
    onMove: (_, key, before) => move(key as DashboardChart, before as DashboardChart | null),
    slide: [['[data-chart-row]', ordered.join(' ')]],
    // The menu's own background (the list inherits it), so the lifted row hides what it passes.
    liftedBackground: 'inherit',
  });

  // Caught before the menu's own arrow keys, which would move the focus instead.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLElement>) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-chart-row]');
    const id = row?.dataset.flip as DashboardChart | undefined;
    if (!row || !id) return;
    e.preventDefault();
    e.stopPropagation();
    const up = e.key === 'ArrowUp';
    const i = ordered.indexOf(id);
    const at = up ? i - 1 : i + 1;
    if (at < 0 || at >= ordered.length) return;
    keepFocus(row);
    move(id, up ? ordered[at] : (ordered[at + 1] ?? null));
    setAnnouncement(`${CHART_TITLES[id]} moved ${up ? 'up' : 'down'}, now ${at + 1} of ${ordered.length}`);
  };

  return (
    <>
      {/* Outside the menu, whose children may only be menu items. */}
      <VisuallyHidden aria-live="polite" aria-atomic="true">
        {announcement}
      </VisuallyHidden>
      <Menu shadow="md" width={320} position="bottom-end" withinPortal closeOnItemClick={false}>
        <Menu.Target>
          <Button size="xs" variant="light" leftSection={<IconChartLine size={14} />}>
            Choose charts
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Charts on this dashboard</Menu.Label>
          <Text component="div" size="xs" c="dimmed" px="sm" pb={6}>
            Hold a chart and drag it, or press Alt+Up or Alt+Down, to change the order.
          </Text>
          <div
            ref={listRef}
            onClickCapture={onClickCapture}
            onKeyDownCapture={onKeyDownCapture}
            style={{ background: 'inherit' }}
          >
            {ordered.map((id, index) => {
              const on = charts.includes(id);
              return (
                <Menu.Item
                  key={id}
                  data-chart-row=""
                  data-flip={id}
                  onClick={() => toggle(id)}
                  aria-label={`${CHART_TITLES[id]} (${on ? 'shown' : 'hidden'})`}
                  leftSection={<IconCheck size={14} style={{ visibility: on ? 'visible' : 'hidden' }} />}
                  rightSection={<IconGripVertical size={14} aria-hidden style={{ opacity: 0.45 }} />}
                  {...handle(CHARTS, id, index)}
                  style={{ ...handle(CHARTS, id, index).style, cursor: 'grab', ...rowStyle(CHARTS, index) }}
                >
                  {CHART_TITLES[id]}
                </Menu.Item>
              );
            })}
          </div>
          {isCustomChartOrder(order) ? (
            <>
              <Menu.Divider />
              <Menu.Item
                onClick={() => {
                  resetOrder();
                  setAnnouncement('Charts back in A to Z order');
                }}
              >
                Reset to A-Z
              </Menu.Item>
            </>
          ) : null}
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
