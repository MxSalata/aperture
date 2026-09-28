import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/** How long a press must last before a row lifts; a shorter press is a click. */
const HOLD_MS = 300;
/** Movement before the hold ends that makes it a scroll or a sloppy click instead. */
const SLOP_PX = 6;

interface Pending {
  pointerId: number;
  x: number;
  y: number;
  timer: number;
  group: string;
  key: string;
  index: number;
  target: HTMLElement;
}

interface Drag {
  pointerId: number;
  group: string;
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

export interface HoldToReorderOptions {
  /**
   * A group is a set of rows that move among each other (the menu's sections, the screens of one
   * section, the charts). The selector finds a group's rows in the list, in the order of `keysOf`.
   */
  rowsOf(group: string): string;
  /** The keys of a group's rows, in the order they are rendered. */
  keysOf(group: string): string[];
  /** A drop: the row `key` goes in front of `before`, or to the end of its group when null. */
  onMove(group: string, key: string, before: string | null): void;
  /**
   * When the order changes (a drop, a keyboard move, a reset), rows slide from where they were to
   * their new place: the rows matching the selector of the first level whose order string
   * changed, so that rows nested in a moving row do not slide twice. Rows carry `data-flip`
   * with a key unique in the list.
   */
  slide: [selector: string, order: string][];
  /** Behind the lifted row, which must hide what it passes over: the list's own background. */
  liftedBackground?: string;
}

/** Text must not get selected while a row is dragged across it. */
const setBodyUserSelect = (value: string) => {
  document.body.style.userSelect = value;
};

/** Declared once, so the listener added at the lift is the one removed at the drop. */
const preventTouchScroll = (e: TouchEvent) => e.preventDefault();

const HANDLE_STYLE: CSSProperties = { touchAction: 'pan-y', WebkitTouchCallout: 'none' };

/**
 * A list the user arranges by hand. Hold a row and it lifts; drag it and its siblings slide out of
 * its way; let go and `onMove` says where it went. A short press is still a click, and the click
 * that ends a drag is swallowed (put `onClickCapture` on the list). Keyboard moves are the
 * caller's: it calls `keepFocus` with the focused row before changing the order, so focus stays
 * on it when the row moves in the DOM.
 */
export function useHoldToReorder<E extends HTMLElement = HTMLDivElement>({
  rowsOf,
  keysOf,
  onMove,
  slide,
  liftedBackground = 'var(--mantine-color-body)',
}: HoldToReorderOptions) {
  const listRef = useRef<E>(null);
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const refocus = useRef<HTMLElement | null>(null);

  const clearPending = () => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  };

  const lift = (pointerId: number) => {
    const p = pending.current;
    if (!p || p.pointerId !== pointerId) return;
    pending.current = null;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>(rowsOf(p.group)) ?? []);
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
      group: p.group,
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
      const others = keysOf(d.group).filter((k) => k !== d.key);
      onMove(d.group, d.key, others[d.to] ?? null);
    }
    // The click that ends a drag must not act on the row underneath.
    if (commit) suppressClick.current = true;
    setDrag(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, group: string, key: string, index: number) => {
    if (e.button !== 0 || dragRef.current) return;
    clearPending();
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    pending.current = {
      pointerId,
      x: e.clientX,
      y: e.clientY,
      group,
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

  /** Props for a row that can be held: the pointer handlers, and a style (merge it with yours). */
  const handle = (group: string, key: string, index: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(e, group, key, index),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu: (e: ReactMouseEvent) => {
      if (pending.current || dragRef.current) e.preventDefault();
    },
    style: HANDLE_STYLE,
  });

  /** The row's shift while one of its siblings is dragged past it, or its lift when it is the one. */
  const rowStyle = (group: string, index: number): CSSProperties | undefined => {
    if (!drag || drag.group !== group) return undefined;
    if (index === drag.index) {
      return {
        transform: `translateY(${drag.dy}px) scale(1.02)`,
        position: 'relative',
        zIndex: 2,
        boxShadow: 'var(--mantine-shadow-md)',
        background: liftedBackground,
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

  const onClickCapture = (e: ReactMouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // Rows are measured on every render, so the "before" positions include the shifts a drag
  // applied; nothing slides during the drag itself.
  const orders = slide.map(([, order]) => order);
  const previous = useRef<{ tops: Map<string, number>; orders: string[] } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const tops = new Map(
      Array.from(list.querySelectorAll<HTMLElement>('[data-flip]')).map((r) => [
        r.dataset.flip!,
        r.getBoundingClientRect().top,
      ]),
    );
    const prev = previous.current;
    const level = prev && !drag ? orders.findIndex((o, i) => o !== prev.orders[i]) : -1;
    if (prev && level >= 0) {
      for (const row of Array.from(list.querySelectorAll<HTMLElement>(slide[level][0]))) {
        const before = prev.tops.get(row.dataset.flip!);
        const after = tops.get(row.dataset.flip!);
        if (before === undefined || after === undefined || Math.abs(before - after) < 1) continue;
        row.style.transition = 'none';
        row.style.transform = `translateY(${before - after}px)`;
        requestAnimationFrame(() => {
          row.style.transition = 'transform 180ms ease';
          row.style.transform = '';
          row.addEventListener('transitionend', () => (row.style.transition = ''), { once: true });
        });
      }
      if (refocus.current) {
        refocus.current.focus({ preventScroll: true });
        refocus.current = null;
      }
    }
    previous.current = { tops, orders };
  });

  return {
    listRef,
    handle,
    rowStyle,
    onClickCapture,
    keepFocus: (row: HTMLElement) => {
      refocus.current = row;
    },
  };
}
