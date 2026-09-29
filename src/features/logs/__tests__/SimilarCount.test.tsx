import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimilarCount } from '../SimilarEntries';
import { refreshLogIndex } from '@/api/logSimilarity';
import { fetchLogSources, lineOffsets, readLogWindow } from '@/api/logs';
import { resetClients } from '@/api/client';
import { parseLogLines } from '@/lib/messagesLog';
import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useSession } from '@/stores/session';

const mount = (file: string, offset: number, onShow = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MantineProvider env="test">
        <SimilarCount file={file} offset={offset} onShow={onShow} />
      </MantineProvider>
    </QueryClientProvider>,
  );

/** An entry of the current messages.log whose message the demo's log repeats with other numbers. */
async function recurringEntry() {
  const file = (await fetchLogSources()).find((s) => s.kind === 'messages' && s.current)!;
  const window = await readLogWindow(file.id, 0, 65_536);
  const entry = parseLogLines(window.lines, lineOffsets(window)).find((e) => /expanded by/.test(e.message))!;
  return { file: file.id, offset: entry.offset! };
}

describe('SimilarCount (how often an opened entry was logged)', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    useMgmntAuth.getState().clear();
    await useSession.getState().login({
      connectionId: 't',
      baseUrl: 'http://iris.test',
      username: '_SYSTEM',
      password: 'SYS',
      auth: 'basic',
    });
  });

  it('says the index is not built yet, and leaves the building to the button', async () => {
    const { file, offset } = await recurringEntry();
    const onShow = vi.fn();
    mount(file, offset, onShow);
    expect(await screen.findByText(/The wording index is not built yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show similar entries' }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('counts the entries worded alike from the index as it stands', async () => {
    const { file, offset } = await recurringEntry();
    await refreshLogIndex();
    mount(file, offset);
    expect(await screen.findByText(/Seen (at least )?\d+ times since/)).toBeInTheDocument();
    expect(screen.getByText(/Found with IRIS Vector Search/)).toBeInTheDocument();
  });

  it('says when the message was not seen elsewhere, and when the newest lines wait for indexing', async () => {
    server.use(
      http.get('*/api/aperture/logs/index', () =>
        HttpResponse.json({ files: [], lines: 1200, stale: true, pendingBytes: 4096 }),
      ),
      http.get('*/api/aperture/logs/similar', () =>
        HttpResponse.json({
          entry: {},
          matches: [],
          summary: { similar: 1, of: 250, first: '', last: '', threshold: 0.9 },
          method: '',
        }),
      ),
    );
    mount('messages.log', 1024);
    expect(await screen.findByText('Not seen elsewhere in the indexed logs.')).toBeInTheDocument();
    expect(screen.getByText(/The newest .+ of the logs are not indexed yet/)).toBeInTheDocument();
  });
});
