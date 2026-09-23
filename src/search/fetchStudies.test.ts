import { describe, expect, it } from 'vitest';
import type { StudiesPage } from './ctgovParse';
import { fetchAllStudies, MAX_STUDIES, type FetchDeps } from './fetchStudies';
import { SearchError } from './searchErrors';
import type { SearchQuery } from './searchQuery';
import { rawPage, rawStudy } from './testFixtures';

const q: SearchQuery = { mode: 'state', stateCode: 'CA', statuses: ['RECRUITING'], condition: '' };

type Step = Response | Error | ((url: string) => Response);

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function page(ids: string[], next?: string, total?: number): Response {
  return json(rawPage(ids.map((id) => rawStudy(id, [])), next, total));
}

function ids(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

function harness(steps: Step[], online = true) {
  const urls: string[] = [];
  const sleeps: number[] = [];
  const deps: FetchDeps = {
    fetch: async (input) => {
      const url = String(input);
      urls.push(url);
      const step = steps.shift();
      if (step === undefined) throw new Error('unexpected extra request');
      if (step instanceof Error) throw step;
      return typeof step === 'function' ? step(url) : step;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    isOnline: () => online,
  };
  const pages: StudiesPage[] = [];
  const progress: number[] = [];
  const run = (signal = new AbortController().signal) =>
    fetchAllStudies(q, null, (p) => pages.push(p), (p) => progress.push(p.studiesFetched), signal, deps);
  return { deps, urls, sleeps, pages, progress, run, remaining: steps };
}

describe('fetchAllStudies', () => {
  it('follows page tokens to the end and reports progress', async () => {
    const h = harness([page(['A', 'B'], 't1', 3), page(['C'])]);
    const out = await h.run();
    expect(out).toEqual({ studiesFetched: 3, totalStudies: 3, stopReason: 'complete', failure: null });
    expect(h.progress).toEqual([2, 3]);
    expect(h.urls[0]).toContain('countTotal=true');
    expect(h.urls[1]).toContain('pageToken=t1');
    expect(h.urls[1]).not.toContain('countTotal');
  });

  it('treats an empty first page as zero results', async () => {
    const out = await harness([page([], undefined, 0)]).run();
    expect(out).toMatchObject({ studiesFetched: 0, totalStudies: 0, stopReason: 'complete' });
  });

  it('waits for Retry-After on 429, then succeeds', async () => {
    const h = harness([json({}, 429, { 'Retry-After': '3' }), page(['A'])]);
    const out = await h.run();
    expect(out.stopReason).toBe('complete');
    expect(h.sleeps).toEqual([3000]);
  });

  it('caps an absurd Retry-After', async () => {
    const h = harness([json({}, 429, { 'Retry-After': '99999' }), page(['A'])]);
    await h.run();
    expect(h.sleeps).toEqual([30_000]);
  });

  it('retries 5xx and network errors with growing backoff', async () => {
    const h = harness([json({}, 503), new TypeError('Failed to fetch'), page(['A'])]);
    const out = await h.run();
    expect(out.studiesFetched).toBe(1);
    expect(h.sleeps).toHaveLength(2);
    expect(h.sleeps[1]).toBeGreaterThan(h.sleeps[0]);
  });

  it('gives up after four attempts with the last error kind', async () => {
    const h = harness([json({}, 502), json({}, 502), json({}, 502), json({}, 429)]);
    await expect(h.run()).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(h.urls).toHaveLength(4);
  });

  it('reports offline when the network fails and the browser is offline', async () => {
    const err = new TypeError('Failed to fetch');
    const h = harness([err, err, err, err], false);
    await expect(h.run()).rejects.toMatchObject({ kind: 'offline' });
  });

  it('does not retry a 400', async () => {
    const h = harness([json({ message: 'bad' }, 400)]);
    await expect(h.run()).rejects.toMatchObject({ kind: 'invalid_query' });
    expect(h.urls).toHaveLength(1);
  });

  it('does not retry other 4xx', async () => {
    const h = harness([json({}, 404)]);
    await expect(h.run()).rejects.toMatchObject({ kind: 'ctgov_unavailable' });
    expect(h.urls).toHaveLength(1);
  });

  it('rejects HTML or a non-studies payload as a bad response', async () => {
    await expect(harness([new Response('<!doctype html>', { status: 200 })]).run()).rejects.toMatchObject({ kind: 'bad_response' });
    await expect(harness([json({ studies: 'x' })]).run()).rejects.toMatchObject({ kind: 'bad_response' });
  });

  it('keeps earlier pages when a later page fails', async () => {
    const h = harness([page(['A', 'B'], 't1', 10), json({}, 400)]);
    const out = await h.run();
    expect(out).toEqual({ studiesFetched: 2, totalStudies: 10, stopReason: 'failed', failure: 'invalid_query' });
    expect(h.pages).toHaveLength(1);
  });

  it('stops with a partial-result notice when the server repeats a token', async () => {
    const h = harness([page(['A'], 't1', 5), page(['B'], 't2'), page(['C'], 't1')]);
    const out = await h.run();
    expect(out).toMatchObject({ studiesFetched: 3, stopReason: 'failed', failure: 'bad_response' });
    expect(h.urls).toHaveLength(3);
  });

  it('stops at the study cap', async () => {
    const pages: Step[] = [];
    for (let i = 0; i < 25; i++) pages.push(page(ids(`P${i}-`, 500), `t${i}`, 30_000));
    const h = harness(pages);
    const out = await h.run();
    expect(out).toMatchObject({ studiesFetched: MAX_STUDIES, totalStudies: 30_000, stopReason: 'cap' });
    expect(h.urls).toHaveLength(MAX_STUDIES / 500);
  });

  it('rethrows an abort instead of returning partial results', async () => {
    const ctrl = new AbortController();
    const h = harness([
      page(['A'], 't1'),
      () => {
        ctrl.abort();
        throw new DOMException('Aborted', 'AbortError');
      },
    ]);
    const err = await h.run(ctrl.signal).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect(err).not.toBeInstanceOf(SearchError);
  });
});
