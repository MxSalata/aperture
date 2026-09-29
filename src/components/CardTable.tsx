import { ScrollArea } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * A plain table inside a card: on a narrow screen it scrolls sideways within the card instead of
 * spilling out of it (and the page). Without buttons or links inside, the scroll area takes focus
 * so the keyboard can scroll it too (WCAG 2.1.1), as DataTable's does.
 */
export function CardTable({
  label,
  focusable = true,
  children,
}: {
  /** What the scroll area is called when it takes focus. */
  label: string;
  /** False when the table has buttons or links, which keyboard users reach anyway. */
  focusable?: boolean;
  children: ReactNode;
}) {
  return (
    <ScrollArea
      type="auto"
      offsetScrollbars="x"
      viewportProps={focusable ? { tabIndex: 0, role: 'group', 'aria-label': label } : undefined}
    >
      {children}
    </ScrollArea>
  );
}
