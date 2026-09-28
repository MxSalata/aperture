import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHoldToReorder } from '../useHoldToReorder';

const KEYS = ['a', 'b', 'c'];

function List({
  onMove,
  onClick,
}: {
  onMove: (key: string, before: string | null) => void;
  onClick: () => void;
}) {
  const { listRef, handle, rowStyle, onClickCapture } = useHoldToReorder({
    rowsOf: () => '[data-row]',
    keysOf: () => KEYS,
    onMove: (_, key, before) => onMove(key, before),
    slide: [['[data-row]', KEYS.join(' ')]],
  });
  return (
    <div ref={listRef} onClickCapture={onClickCapture}>
      {KEYS.map((key, i) => (
        <button
          key={key}
          data-row=""
          data-flip={key}
          onClick={onClick}
          {...handle('rows', key, i)}
          style={{ ...handle('rows', key, i).style, ...rowStyle('rows', i) }}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

const pointer = { pointerId: 1, button: 0, clientX: 10, clientY: 10 };

/** jsdom has no PointerEvent: a mouse event with an id, which is all the hook reads. */
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

describe('useHoldToReorder', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lets a short press through as a click and moves nothing', () => {
    const onMove = vi.fn();
    const onClick = vi.fn();
    render(<List onMove={onMove} onClick={onClick} />);
    const a = screen.getByRole('button', { name: 'a' });
    fireEvent.pointerDown(a, pointer);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerUp(a, pointer);
    fireEvent.click(a);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('lifts a held row, drops it where it was dragged, swallows the click that ends the drag, and frees touch scrolling', () => {
    const onMove = vi.fn();
    const onClick = vi.fn();
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    render(<List onMove={onMove} onClick={onClick} />);
    const a = screen.getByRole('button', { name: 'a' });
    fireEvent.pointerDown(a, pointer);
    act(() => vi.advanceTimersByTime(350));
    expect(document.body.style.userSelect).toBe('none');
    // jsdom lays nothing out, so every row sits at 0: any move down passes them all.
    fireEvent.pointerMove(a, { ...pointer, clientY: 60 });
    fireEvent.pointerUp(a, { ...pointer, clientY: 60 });
    expect(onMove).toHaveBeenCalledWith('a', null);
    fireEvent.click(a);
    expect(onClick).not.toHaveBeenCalled();
    expect(document.body.style.userSelect).toBe('');

    // The listener that blocks touch scrolling during the drag is the one removed after it.
    const blocker = added.mock.calls.find(([type]) => type === 'touchmove')?.[1];
    expect(blocker).toBeDefined();
    expect(removed.mock.calls.some(([type, fn]) => type === 'touchmove' && fn === blocker)).toBe(true);

    // The next click is a click again.
    fireEvent.click(a);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('gives up the hold when the pointer wanders first (a scroll or a sloppy click)', () => {
    const onMove = vi.fn();
    render(<List onMove={onMove} onClick={() => {}} />);
    const b = screen.getByRole('button', { name: 'b' });
    fireEvent.pointerDown(b, pointer);
    fireEvent.pointerMove(b, { ...pointer, clientY: 30 });
    act(() => vi.advanceTimersByTime(350));
    expect(document.body.style.userSelect).toBe('');
    fireEvent.pointerUp(b, { ...pointer, clientY: 30 });
    expect(onMove).not.toHaveBeenCalled();
  });
});
