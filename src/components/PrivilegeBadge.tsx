import { Badge, Tooltip } from '@mantine/core';
import { IconLock, IconLockOpen, IconShieldQuestion } from '@tabler/icons-react';
import { useSession } from '@/stores/session';
import { checkPrivileges } from '@/api/privileges';

interface Props {
  resources: readonly string[];
  size?: 'xs' | 'sm';
}

/** Shows which `%Admin_*` resource an action needs and whether the current user holds it. */
export function PrivilegeBadge({ resources, size = 'sm' }: Props) {
  const info = useSession((s) => s.info);
  const status = checkPrivileges(info, resources);
  const label = resources.map((r) => r.replace(/:U$/, '')).join(' or ');
  const color = status === 'granted' ? 'teal' : status === 'denied' ? 'red' : 'gray';
  const Icon = status === 'granted' ? IconLockOpen : status === 'denied' ? IconLock : IconShieldQuestion;
  const hint =
    status === 'granted'
      ? `You hold ${label}`
      : status === 'denied'
        ? `Requires ${label} - your account does not hold it`
        : `Requires ${label} - not reported by this server`;
  return (
    <Tooltip label={hint}>
      <Badge size={size} color={color} variant="light" leftSection={<Icon size={12} />} style={{ textTransform: 'none' }} tabIndex={0} aria-label={hint}>
        {label}
      </Badge>
    </Tooltip>
  );
}
