import { Spotlight, type SpotlightActionData, type SpotlightActionGroupData } from '@mantine/spotlight';
import { IconApi, IconSearch } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ALL_NAV_ITEMS } from './nav';
import { index, groupLabel } from '@/lib/openapi';
import { useSession } from '@/stores/session';
import { canUse } from '@/api/privileges';

/** Ctrl/⌘+K: jump to any screen or any of the 273 API operations. */
export function CommandPalette() {
  const navigate = useNavigate();
  const info = useSession((s) => s.info);

  const actions = useMemo<(SpotlightActionData | SpotlightActionGroupData)[]>(() => {
    const pages: SpotlightActionData[] = ALL_NAV_ITEMS.filter((n) => canUse(info, n.privileges)).map((n) => ({
      id: `nav:${n.to}`,
      label: n.label,
      description: n.description,
      keywords: n.keywords,
      leftSection: <n.icon size={18} stroke={1.6} />,
      onClick: () => navigate(n.to),
    }));
    const ops: SpotlightActionData[] = index.operations.map((op) => ({
      id: `op:${op.id}`,
      label: `${op.method} ${op.path}`,
      description: `${groupLabel(op.group)} · ${op.summary}`,
      keywords: [op.group, ...op.privileges],
      leftSection: <IconApi size={18} stroke={1.6} />,
      onClick: () => navigate(`/explorer/${encodeURIComponent(op.group)}?op=${encodeURIComponent(op.id)}`),
    }));
    return [
      { group: 'Screens', actions: pages },
      { group: 'API operations', actions: ops },
    ];
  }, [info, navigate]);

  return (
    <Spotlight
      actions={actions}
      shortcut={['mod + K', '/']}
      limit={12}
      nothingFound="Nothing found"
      highlightQuery
      scrollable
      maxHeight={420}
      searchProps={{ leftSection: <IconSearch size={18} stroke={1.5} />, placeholder: 'Jump to a screen or API operation…' }}
    />
  );
}
