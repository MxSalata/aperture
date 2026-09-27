import { NavLink, Stack, Text, UnstyledButton, VisuallyHidden } from '@mantine/core';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useLocation } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { NAV, type NavItem, type NavSection } from './nav';
import { isCustomOrder, orderNav, useNavOrder } from '@/stores/navOrder';

/** How long a press must last before an entry lifts; a shorter press is a click. */
const HOLD_MS = 300;
/** Movement before the hold ends that makes it a scroll or a sloppy click instead. */
const SLOP_PX = 6;

type Kind = 'item' | 'section';

interface Pending {
  pointerId: number;
  x: number;
  y: number;
  timer: number;
  kind: Kind;
  section: string;
  key: string;
  index: number;
  target: HTMLElement;
}

interface Drag {
  pointerId: number;
  kind: Kind;
  section: string;
  key: string;
  /** Position among its siblings when lifted, and the slot it is over now. */
  index: number;
  to: number;
  /** Pointer travel since the lift, in px. */
  dy: number;
  startY: number;
  /** Sibling geometry at the lift, so a slot stays where it was while others slide. */
  tops: number[];
  heights: number[];
  gap: number;
}

interface Props {
  /** Whether the signed-in account may open a screen; the others are left out. */
  canUse(item: NavItem): boolean;
  /** Called when a screen was chosen (closes the drawer on small screens). */
  onNavigate(): void;
}

/** Text must not get selected while an entry is dragged across it. */
const setBodyUserSelect = (value: string) => {
  document.body.style.userSelect = value;
};

const rowSelector = (kind: Kind, section: string) =>
  kind === 'section' ? '[data-nav-section]' : `[data-nav-item][data-section="${CSS.escape(section)}"]`;

/**
 * The navigation menu, arranged the way the user wants it. Hold an entry (or a group's label) and
 * it lifts; drag it and the others slide out of its way; let go and the order is kept for this
 * device. A screen stays within its group. With the keyboard, Alt+Up and Alt+Down move the
 * focused entry and Alt+Shift+Up/Down move its whole group, announced to screen readers. A short
 * press is still a click, and a drag never navigates.
 */
export function NavList({ canUse, onNavigate }: Props) {
  const location = useLocation();
  const order = useNavOrder(useShallow((s) => ({ sections: s.sections, items: s.items })));
  const moveSection = useNavOrder((s) => s.moveSection);
  const moveItem = useNavOrder((s) => s.moveItem);
  const reset = useNavOrder((s) => s.reset);
  const sections = useMemo(
    () =>
      orderNav(NAV, order)
        .map((s) => ({ ...s, items: s.items.filter(canUse) }))
        .filter((s) => s.items.length),
    [order, canUse],
  );
  const custom = useMemo(() => isCustomOrder(NAV, order), [order]);

  const listRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const refocus = useRef<HTMLElement | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const clearPending = () => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  };

  /** Keys of the dragged entry's siblings as rendered, so "in front of" can be named for the store. */
  const siblingKeys = (kind: Kind, section: string): string[] =>
    kind === 'section'
      ? sections.map((s) => s.label)
      : (sections.find((s) => s.label === section)?.items.map((i) => i.to) ?? []);

  const place = useCallback(
    (kind: Kind, section: string, key: string, before: string | null) => {
      if (kind === 'section') moveSection(key, before);
      else moveItem(section, key, before);
    },
    [moveSection, moveItem],
  );

  const preventTouchScroll = (e: TouchEvent) => e.preventDefault();

  const lift = (pointerId: number) => {
    const p = pending.current;
    if (!p || p.pointerId !== pointerId) return;
    pending.current = null;
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(rowSelector(p.kind, p.section)) ?? [],
    );
    const rects = rows.map((r) => r.getBoundingClientRect());
    if (rects.length < 2) return;
    try {
      p.target.setPointerCapture(pointerId);
    } catch {
      /* the pointer is gone already */
    }
    document.addEventListener('touchmove', preventTouchScroll, { passive: false });
    setBodyUserSelect('none');
    const next: Drag = {
      pointerId,
      kind: p.kind,
      section: p.section,
      key: p.key,
      index: p.index,
      to: p.index,
      dy: 0,
      startY: p.y,
      tops: rects.map((r) => r.top),
      heights: rects.map((r) => r.height),
      gap: Math.max(0, rects[1].top - rects[0].bottom),
    };
    dragRef.current = next;
    setDrag(next);
  };

  const finish = (commit: boolean) => {
    clearPending();
    const d = dragRef.current;
    dragRef.current = null;
    document.removeEventListener('touchmove', preventTouchScroll);
    setBodyUserSelect('');
    if (!d) return;
    if (commit && d.to !== d.index) {
      const others = siblingKeys(d.kind, d.section).filter((k) => k !== d.key);
      place(d.kind, d.section, d.key, others[d.to] ?? null);
    }
    // The click that ends a drag must not open the screen underneath.
    if (commit) suppressClick.current = true;
    setDrag(null);
  };

  const onPointerDown = (
    e: ReactPointerEvent<HTMLElement>,
    kind: Kind,
    section: string,
    key: string,
    index: number,
  ) => {
    if (e.button !== 0 || dragRef.current) return;
    clearPending();
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    pending.current = {
      pointerId,
      x: e.clientX,
      y: e.clientY,
      kind,
      section,
      key,
      index,
      target,
      timer: window.setTimeout(() => lift(pointerId), HOLD_MS),
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const p = pending.current;
    if (p && (Math.abs(e.clientX - p.x) > SLOP_PX || Math.abs(e.clientY - p.y) > SLOP_PX)) clearPending();
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dy = e.clientY - d.startY;
    const centre = d.tops[d.index] + d.heights[d.index] / 2 + dy;
    let to = d.index;
    if (dy < 0) {
      for (let i = d.index - 1; i >= 0 && centre < d.tops[i] + d.heights[i] / 2; i--) to = i;
    } else {
      for (let i = d.index + 1; i < d.tops.length && centre > d.tops[i] + d.heights[i] / 2; i++) to = i;
    }
    if (to !== d.to || dy !== d.dy) {
      const next = { ...d, to, dy };
      dragRef.current = next;
      setDrag(next);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (d && e.pointerId === d.pointerId) finish(true);
    else clearPending();
  };

  const onPointerCancel = () => finish(false);

  /** The row's shift while one of its siblings is being dragged past it. */
  const rowStyle = (kind: Kind, section: string, index: number): CSSProperties | undefined => {
    if (!drag || drag.kind !== kind || (kind === 'item' && drag.section !== section)) return undefined;
    if (index === drag.index) {
      return {
        transform: `translateY(${drag.dy}px) scale(1.02)`,
        position: 'relative',
        zIndex: 2,
        boxShadow: 'var(--mantine-shadow-md)',
        background: 'var(--mantine-color-body)',
        borderRadius: 8,
        cursor: 'grabbing',
      };
    }
    const step = drag.heights[drag.index] + drag.gap;
    if (drag.to < drag.index && index >= drag.to && index < drag.index)
      return { transform: `translateY(${step}px)`, transition: 'transform 160ms ease' };
    if (drag.to > drag.index && index > drag.index && index <= drag.to)
      return { transform: `translateY(${-step}px)`, transition: 'transform 160ms ease' };
    return { transition: 'transform 160ms ease' };
  };

  // When the order changes (a drop, a keyboard move, a reset), every row that landed elsewhere
  // starts where it was and slides to its new place. Rows are measured on every render so the
  // "before" positions include the shifts a drag applied; nothing animates during the drag itself.
  const sectionsKey = sections.map((s) => s.label).join('\n');
  const itemsKey = sections.map((s) => s.items.map((i) => i.to).join(' ')).join('\n');
  const previous = useRef<{ rects: Map<string, number>; sectionsKey: string; itemsKey: string } | null>(null);
  useLayoutEffect(() => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-flip]') ?? []);
    const rects = new Map(rows.map((r) => [r.dataset.flip!, r.getBoundingClientRect().top]));
    const prev = previous.current;
    if (prev && !drag) {
      const movedSections = prev.sectionsKey !== sectionsKey;
      const movedItems = prev.itemsKey !== itemsKey;
      for (const row of rows) {
        const key = row.dataset.flip!;
        const isSection = row.hasAttribute('data-nav-section');
        if (isSection ? !movedSections : !movedItems || movedSections) continue;
        const before = prev.rects.get(key);
        const after = rects.get(key);
        if (before === undefined || after === undefined || Math.abs(before - after) < 1) continue;
        row.style.transition = 'none';
        row.style.transform = `translateY(${before - after}px)`;
        requestAnimationFrame(() => {
          row.style.transition = 'transform 180ms ease';
          row.style.transform = '';
          row.addEventListener('transitionend', () => (row.style.transition = ''), { once: true });
        });
      }
      if ((movedSections || movedItems) && refocus.current) {
        refocus.current.focus({ preventScroll: true });
        refocus.current = null;
      }
    }
    previous.current = { rects, sectionsKey, itemsKey };
  });

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, section: NavSection, item: NavItem) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const up = e.key === 'ArrowUp';
    refocus.current = e.currentTarget;
    if (e.shiftKey) {
      const labels = sections.map((s) => s.label);
      const i = labels.indexOf(section.label);
      const at = up ? i - 1 : i + 1;
      if (at < 0 || at >= labels.length) return;
      moveSection(section.label, up ? labels[at] : (labels[at + 1] ?? null));
      setAnnouncement(
        `${section.label} moved ${up ? 'up' : 'down'}, now group ${at + 1} of ${labels.length}`,
      );
    } else {
      const paths = section.items.map((x) => x.to);
      const i = paths.indexOf(item.to);
      const at = up ? i - 1 : i + 1;
      if (at < 0 || at >= paths.length) return;
      moveItem(section.label, item.to, up ? paths[at] : (paths[at + 1] ?? null));
      setAnnouncement(
        `${item.label} moved ${up ? 'up' : 'down'}, now ${at + 1} of ${paths.length} in ${section.label}`,
      );
    }
  };

  const handle = (kind: Kind, section: string, key: string, index: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(e, kind, section, key, index),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu: (e: ReactPointerEvent<HTMLElement> | React.MouseEvent) => {
      if (pending.current || dragRef.current) e.preventDefault();
    },
    style: { touchAction: 'pan-y', WebkitTouchCallout: 'none' } as CSSProperties,
  });

  return (
    <div
      ref={listRef}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <VisuallyHidden>
        Hold an entry to drag it to another place; a group moves by its heading. With the keyboard, Alt+Up or
        Alt+Down moves the entry, Alt+Shift+Up or Alt+Shift+Down moves its group.
      </VisuallyHidden>
      <VisuallyHidden aria-live="polite" aria-atomic="true">
        {announcement}
      </VisuallyHidden>
      <Stack gap="md">
        {sections.map((section, si) => (
          <Stack
            key={section.label}
            gap={2}
            data-nav-section=""
            data-flip={`section:${section.label}`}
            style={rowStyle('section', section.label, si)}
          >
            <Text
              size="xs"
              c="dimmed"
              fw={600}
              tt="uppercase"
              px="sm"
              {...handle('section', section.label, section.label, si)}
              style={{
                letterSpacing: 0.5,
                cursor: 'grab',
                ...handle('section', section.label, section.label, si).style,
              }}
            >
              {section.label}
            </Text>
            {section.items.map((item, ii) => {
              // By path segment: /security/users is not active on /security/users-audit.
              const active =
                item.to === '/'
                  ? location.pathname === '/'
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              return (
                <div
                  key={item.to}
                  data-nav-item=""
                  data-section={section.label}
                  data-flip={`item:${item.to}`}
                  {...handle('item', section.label, item.to, ii)}
                  style={{
                    ...handle('item', section.label, item.to, ii).style,
                    ...rowStyle('item', section.label, ii),
                  }}
                >
                  <NavLink
                    component={Link}
                    to={item.to}
                    draggable={false}
                    label={item.label}
                    leftSection={<item.icon size={18} stroke={1.6} />}
                    active={active}
                    onClick={onNavigate}
                    onKeyDown={(e: KeyboardEvent<HTMLElement>) => onKeyDown(e, section, item)}
                    style={{ borderRadius: 8 }}
                  />
                </div>
              );
            })}
          </Stack>
        ))}
        {custom ? (
          <UnstyledButton
            onClick={() => {
              reset();
              setAnnouncement('Menu order reset');
            }}
            px="sm"
            fz="xs"
            c="dimmed"
            style={{ textDecoration: 'underline' }}
          >
            Reset menu order
          </UnstyledButton>
        ) : null}
      </Stack>
    </div>
  );
}
