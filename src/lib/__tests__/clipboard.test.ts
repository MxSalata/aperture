import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../clipboard';

describe('copyText', () => {
  const secure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  let copied: string[];

  beforeEach(() => {
    copied = [];
    // jsdom has no copy command: record what is selected when it is asked to copy.
    document.execCommand = vi.fn((command: string) => {
      const active = document.activeElement as HTMLTextAreaElement | null;
      if (command === 'copy' && active?.tagName === 'TEXTAREA') copied.push(active.value);
      return command === 'copy';
    }) as typeof document.execCommand;
  });
  afterEach(() => {
    if (secure) Object.defineProperty(window, 'isSecureContext', secure);
    else delete (window as { isSecureContext?: boolean }).isSecureContext;
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
    else delete (navigator as { clipboard?: unknown }).clipboard;
    vi.restoreAllMocks();
  });

  it('uses the clipboard API in a secure context', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copyText('GET /info')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('GET /info');
    expect(copied).toEqual([]);
  });

  it('copies by selection over plain HTTP, where there is no clipboard API, and gives the focus back', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(await copyText('curl -u _SYSTEM http://192.168.0.10:52773/api/admin/info')).toBe(true);
    expect(copied).toEqual(['curl -u _SYSTEM http://192.168.0.10:52773/api/admin/info']);
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('textarea')).toBeNull();
    button.remove();
  });

  it('falls back when the clipboard API refuses, and reports a copy the browser refuses too', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    expect(await copyText('one')).toBe(true);
    expect(copied).toEqual(['one']);
    document.execCommand = vi.fn(() => false) as typeof document.execCommand;
    expect(await copyText('two')).toBe(false);
  });
});
