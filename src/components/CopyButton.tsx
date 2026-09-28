import { notifications } from '@mantine/notifications';
import { useEffect, useState, type ReactNode } from 'react';
import { copyText } from '@/lib/clipboard';

interface CopyState {
  copied: boolean;
  /** The browser refused both ways of copying: the control should say to select and copy by hand. */
  failed: boolean;
  copy(): void;
}

/**
 * Mantine's CopyButton, with the same render function, on `copyText`: it also copies where the
 * clipboard API is missing (the portal served by IRIS over plain HTTP), and every copy says so in
 * a short notice ("Copied to clipboard", or how to copy by hand when the browser refused), which
 * an icon-only button's tooltip alone would not.
 */
export function CopyButton({
  value,
  timeout = 2000,
  children,
}: {
  value: string;
  timeout?: number;
  children(state: CopyState): ReactNode;
}) {
  // A new object for every copy, so a second copy restarts the time the result is shown.
  const [result, setResult] = useState<{ ok: boolean } | null>(null);
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), result.ok ? timeout : 4000);
    return () => window.clearTimeout(timer);
  }, [result, timeout]);
  const copy = () => {
    void copyText(value).then((ok) => {
      setResult({ ok });
      notifications.show(
        ok
          ? { message: 'Copied to clipboard', color: 'teal', autoClose: 2000 }
          : {
              title: 'Could not copy',
              message: 'The browser refused: select the text and press Ctrl+C.',
              color: 'red',
              autoClose: 5000,
            },
      );
    });
  };
  return <>{children({ copied: result?.ok === true, failed: result?.ok === false, copy })}</>;
}
