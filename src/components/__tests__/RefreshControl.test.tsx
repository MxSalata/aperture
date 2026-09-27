import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshControl } from '../RefreshControl';
import { useAutoRefresh } from '@/stores/autoRefresh';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const mount = (screenName: string, onRefresh: () => void) =>
  render(
    <MantineProvider env="test">
      <RefreshControl screen={screenName} onRefresh={onRefresh} />
    </MantineProvider>,
  );

describe('RefreshControl', () => {
  beforeEach(() => {
    localStorage.clear();
    useAutoRefresh.setState({ intervals: {} });
    setVisibility('visible');
  });
  afterEach(() => vi.useRealTimers());

  it('is off by default, shows the interval chosen for its screen, and Refresh still works by hand', () => {
    const onRefresh = vi.fn();
    mount('processes', onRefresh);
    expect(screen.getByRole('button', { name: 'Auto-refresh off' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // The menu itself is exercised in the browser (e2e/auto-refresh.spec.ts); here, the choice it makes.
    act(() => useAutoRefresh.getState().set('processes', 15));
    expect(screen.getByRole('button', { name: 'Auto-refresh every 15 seconds' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('aperture.refresh')!).state.intervals).toEqual({ processes: 15 });
    act(() => useAutoRefresh.getState().set('processes', 0));
    expect(screen.getByRole('button', { name: 'Auto-refresh off' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('aperture.refresh')!).state.intervals).toEqual({});
  });

  it('refreshes on the interval while the tab is visible, at once when it comes back, and stops on Off', () => {
    vi.useFakeTimers();
    useAutoRefresh.getState().set('users', 5);
    const onRefresh = vi.fn();
    mount('users', onRefresh);

    act(() => vi.advanceTimersByTime(5_000));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onRefresh).toHaveBeenCalledTimes(3);

    // A hidden tab does not poll the instance; a tab that comes back refreshes and counts again.
    act(() => setVisibility('hidden'));
    act(() => vi.advanceTimersByTime(20_000));
    expect(onRefresh).toHaveBeenCalledTimes(3);
    act(() => setVisibility('visible'));
    expect(onRefresh).toHaveBeenCalledTimes(4);
    act(() => vi.advanceTimersByTime(5_000));
    expect(onRefresh).toHaveBeenCalledTimes(5);

    act(() => useAutoRefresh.getState().set('users', 0));
    act(() => vi.advanceTimersByTime(30_000));
    expect(onRefresh).toHaveBeenCalledTimes(5);
  });
});
