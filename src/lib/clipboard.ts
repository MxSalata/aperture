/**
 * Copying text to the clipboard. `navigator.clipboard` exists only in a secure context (HTTPS, or
 * localhost): the portal served by IRIS over plain HTTP on a network address, the usual way to run
 * it on a LAN, has none, and a copy button built on it does nothing there. So the text is copied
 * the older way when the API is missing or refuses: put in a hidden text area, selected, and copied
 * with the browser's copy command, which works in any context from a click.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* refused (permissions, focus): try the older way */
    }
  }
  return copyBySelection(text);
}

function copyBySelection(text: string): boolean {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // Beside the control that was clicked, so a dialog's focus trap does not take the focus back
  // before the text is selected.
  const host = active && active !== document.body ? (active.parentElement ?? document.body) : document.body;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.tabIndex = -1;
  Object.assign(area.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
  });
  const selection = document.getSelection();
  const kept = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  host.appendChild(area);
  area.focus({ preventScroll: true });
  area.select();
  let copied = false;
  try {
    copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  if (kept && selection) {
    selection.removeAllRanges();
    selection.addRange(kept);
  }
  active?.focus({ preventScroll: true });
  return copied;
}
