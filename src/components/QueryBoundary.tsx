import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorAlert } from './ErrorAlert';
import { PageSkeleton } from './PageSkeleton';

interface Props<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}

/** Render loading / error / data states of a query uniformly. */
export function QueryBoundary<T>({ query, children, loadingLabel }: Props<T>) {
  if (query.isPending) return <PageSkeleton label={loadingLabel} />;
  if (query.isError) return <ErrorAlert error={query.error} onRetry={() => query.refetch()} />;
  return <>{children(query.data)}</>;
}
