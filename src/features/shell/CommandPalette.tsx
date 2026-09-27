import { Spotlight, type SpotlightActionData, type SpotlightActionGroupData } from '@mantine/spotlight';
import { IconApi, IconSearch } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ALL_NAV_ITEMS } from './nav';
import { groupLabel, type IndexedOperation } from '@/lib/openapi';
import { useSession } from '@/stores/session';
import { canUse } from '@/api/privileges';

/** Ctrl/⌘+K: jump to any screen or any of the 273 API operations. */
export function CommandPalette() {
  const navigate = useNavigate();
  const info = useSession((s) => s.info);

  // The operation index (~175 KB) is not part of the entry bundle: it is fetched when the
  // browser is idle or on the first open, whichever comes first (see lib/specIndex.ts).
  const [operations, setOperations] = useState<IndexedOperation[] | null>(null);
  const loadOperations = useCallback(() => {
    void import('@/lib/specIndex').then((m) => setOperations((cur) => cur ?? m.index.operations));
  }, []);
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(loadOperations, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(loadOperations, 1500);
    return () => clearTimeout(t);
  }, [loadOperations]);

  const actions = useMemo<(SpotlightActionData | SpotlightActionGroupData)[]>(() => {
    const pages: SpotlightActionData[] = ALL_NAV_ITEMS.filter((n) => canUse(info, n.privileges)).map((n) => ({
      id: `nav:${n.to}`,
      label: n.label,
      description: n.description,
      keywords: n.keywords,
      leftSection: <n.icon size={18} stroke={1.6} />,
      onClick: () => navigate(n.to),
    }));
    const ops: SpotlightActionData[] = (operations ?? []).map((op) => ({
      id: `op:${op.id}`,
      label: `${op.method} ${op.path}`,
      description: `${groupLabel(op.group)} · ${op.summary}`,
      keywords: [op.group, ...op.privileges],
      leftSection: <IconApi size={18} stroke={1.6} />,
      onClick: () => navigate(`/explorer/${encodeURIComponent(op.group)}?op=${encodeURIComponent(op.id)}`),
    }));
    return [
      { group: 'Screens', actions: pages },
      ...(ops.length ? [{ group: 'API operations', actions: ops }] : []),
    ];
  }, [info, navigate, operations]);

  return (
    <Spotlight
      actions={actions}
      onSpotlightOpen={loadOperations}
      // The theme keeps modals open on a click outside so a half-filled form survives it; the
      // palette is a Modal too but holds nothing to lose, so its backdrop closes it.
      closeOnClickOutside
      shortcut={['mod + K', '/']}
      limit={12}
      nothingFound={operations ? 'Nothing found' : 'Loading the API operations…'}
      highlightQuery
      scrollable
      maxHeight={420}
      searchProps={{
        leftSection: <IconSearch size={18} stroke={1.5} />,
        placeholder: 'Jump to a screen or API operation…',
      }}
    />
  );
}
