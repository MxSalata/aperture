/**
 * Browser download helpers. The anchor is attached to the document and the object
 * URL is revoked only after the click has been dispatched: revoking synchronously
 * or clicking a detached anchor makes some browsers silently download nothing.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type }));
}
