import { NavLink, Stack, Text, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { NAV, type NavItem, type NavSection } from './nav';
import { isCustomOrder, orderNav, useNavOrder } from '@/stores/navOrder';
import { useHoldToReorder } from '@/components/useHoldToReorder';

/** The reorder groups: the sections, and the screens of each section (which stay in it). */
const SECTIONS = 'sections';
const itemsOf = (section: string) => `items:${section}`;
const sectionOf = (group: string) => group.slice('items:'.length);

interface Props {
  /** Whether the signed-in account may open a screen; the others are left out. */
  canUse(item: NavItem): boolean;
  /** Called when a screen was chosen (closes the drawer on small screens). */
  onNavigate(): void;
}

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

  const [announcement, setAnnouncement] = useState('');

  // When the order changes, the sections slide if they moved, otherwise the screens that moved.
  const sectionsKey = sections.map((s) => s.label).join('\n');
  const itemsKey = sections.map((s) => s.items.map((i) => i.to).join(' ')).join('\n');
  const { listRef, handle, rowStyle, onClickCapture, keepFocus } = useHoldToReorder({
    rowsOf: (group) =>
      group === SECTIONS
        ? '[data-nav-section]'
        : `[data-nav-item][data-section="${CSS.escape(sectionOf(group))}"]`,
    // As rendered, so "in front of" can be named for the store.
    keysOf: (group) =>
      group === SECTIONS
        ? sections.map((s) => s.label)
        : (sections.find((s) => s.label === sectionOf(group))?.items.map((i) => i.to) ?? []),
    onMove: (group, key, before) => {
      if (group === SECTIONS) moveSection(key, before);
      else moveItem(sectionOf(group), key, before);
    },
    slide: [
      ['[data-nav-section]', sectionsKey],
      ['[data-nav-item]', itemsKey],
    ],
  });

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, section: NavSection, item: NavItem) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const up = e.key === 'ArrowUp';
    if (e.shiftKey) {
      const labels = sections.map((s) => s.label);
      const i = labels.indexOf(section.label);
      const at = up ? i - 1 : i + 1;
      if (at < 0 || at >= labels.length) return;
      keepFocus(e.currentTarget);
      moveSection(section.label, up ? labels[at] : (labels[at + 1] ?? null));
      setAnnouncement(
        `${section.label} moved ${up ? 'up' : 'down'}, now group ${at + 1} of ${labels.length}`,
      );
    } else {
      const paths = section.items.map((x) => x.to);
      const i = paths.indexOf(item.to);
      const at = up ? i - 1 : i + 1;
      if (at < 0 || at >= paths.length) return;
      keepFocus(e.currentTarget);
      moveItem(section.label, item.to, up ? paths[at] : (paths[at + 1] ?? null));
      setAnnouncement(
        `${item.label} moved ${up ? 'up' : 'down'}, now ${at + 1} of ${paths.length} in ${section.label}`,
      );
    }
  };

  return (
    <div ref={listRef} onClickCapture={onClickCapture}>
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
            style={rowStyle(SECTIONS, si)}
          >
            <Text
              size="xs"
              c="dimmed"
              fw={600}
              tt="uppercase"
              px="sm"
              {...handle(SECTIONS, section.label, si)}
              style={{ ...handle(SECTIONS, section.label, si).style, letterSpacing: 0.5, cursor: 'grab' }}
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
                  {...handle(itemsOf(section.label), item.to, ii)}
                  style={{
                    ...handle(itemsOf(section.label), item.to, ii).style,
                    ...rowStyle(itemsOf(section.label), ii),
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
