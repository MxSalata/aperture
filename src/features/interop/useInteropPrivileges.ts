import { useQuery } from '@tanstack/react-query';
import { fetchInteropInfo, interopKeys } from '@/api/interop';

/** The interoperability privileges IRIS reports for the account (`GET /info`). */
export function useInteropPrivileges() {
  const info = useQuery({ queryKey: interopKeys.info, queryFn: fetchInteropInfo, staleTime: 60_000 });
  return info.data?.privileges;
}
