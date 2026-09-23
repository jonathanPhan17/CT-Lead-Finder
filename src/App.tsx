import { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Header from './components/Header';
import OutreachCart from './components/OutreachCart';
import OutreachComposer from './components/OutreachComposer';
import OutreachHistory from './components/OutreachHistory';
import ResultsView from './components/results/ResultsView';
import SearchForm from './components/search/SearchForm';
import SearchStatus from './components/search/SearchStatus';
import { ensureHistoryLoaded, useHistory } from './outreach/historyStore';
import { buildRecipientIndex, type Recipient } from './search/resultsView';
import { paramsToQuery, QUERY_PROBLEM_MESSAGES, queryKey, queryToParams, type SearchQuery } from './search/searchQuery';
import { useTrialSearch } from './search/useTrialSearch';

const THEME_KEY = 'ct-theme';
const LAST_SEARCH_KEY = 'ct-last-search';

function getInitialTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored === 'dark';
  } catch {
    // Storage blocked: fall through to the system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readLastSearch(): string {
  try {
    const v = sessionStorage.getItem(LAST_SEARCH_KEY);
    return v && v.startsWith('/?') ? v : '/';
  } catch {
    return '/';
  }
}

export default function App() {
  const [isDark, setIsDark] = useState(getInitialTheme);
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname, search } = useLocation();
  const history = useHistory();

  const urlQuery = useMemo(() => paramsToQuery(searchParams), [searchParams]);
  const urlKey = urlQuery ? queryKey(urlQuery) : '';
  // Retry counter scoped to the current search, so a new search always starts from attempt 0.
  const [attempt, setAttempt] = useState({ key: '', n: 0 });
  const attemptN = attempt.key === urlKey ? attempt.n : 0;
  const { state, cancel } = useTrialSearch(urlQuery, attemptN);

  const [selected, setSelected] = useState<Map<string, Recipient>>(() => new Map());
  const [composing, setComposing] = useState(false);
  const result = state.phase === 'done' ? state.result : null;
  const recipientIndex = useMemo(() => (result ? buildRecipientIndex(result.sites) : new Map<string, Recipient>()), [result]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Theme just will not persist.
    }
  }, [isDark]);

  useEffect(() => {
    ensureHistoryLoaded();
  }, []);

  useEffect(() => {
    if (pathname !== '/' || !search) return;
    try {
      sessionStorage.setItem(LAST_SEARCH_KEY, `/${search}`);
    } catch {
      // The Search tab will fall back to a blank search.
    }
  }, [pathname, search]);

  const retry = useCallback(() => setAttempt({ key: urlKey, n: attemptN + 1 }), [urlKey, attemptN]);

  function handleSubmit(q: SearchQuery) {
    if (queryKey(q) === urlKey) retry();
    else setSearchParams(queryToParams(q));
  }

  const toggle = useCallback(
    (email: string) =>
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(email)) next.delete(email);
        else {
          const r = recipientIndex.get(email);
          if (r) next.set(email, r);
        }
        return next;
      }),
    [recipientIndex],
  );

  const selectMany = useCallback(
    (emails: string[], on: boolean) =>
      setSelected((prev) => {
        const next = new Map(prev);
        for (const e of emails) {
          const r = recipientIndex.get(e);
          if (on && r) next.set(e, r);
          if (!on) next.delete(e);
        }
        return next;
      }),
    [recipientIndex],
  );

  const removeSent = useCallback((emails: string[]) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const e of emails) next.delete(e);
      return next;
    });
  }, []);

  const selectedKeys = useMemo(() => new Set(selected.keys()), [selected]);
  const recipients = useMemo(() => [...selected.values()], [selected]);
  const searchHref = pathname === '/' ? `/${search}` : readLastSearch();

  const searchPage = (
    <div className="space-y-6">
      <div className={urlQuery ? '' : 'py-8'}>
        <SearchForm key={urlKey} initialQuery={urlQuery} busy={state.phase === 'loading'} hero={urlQuery === null} onSubmit={handleSubmit} />
      </div>

      {state.phase === 'invalid' && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>This link does not describe a complete search. {QUERY_PROBLEM_MESSAGES[state.problem]}</p>
        </div>
      )}

      {(state.phase === 'loading' || state.phase === 'error' || state.phase === 'cancelled') && (
        <SearchStatus state={state} onCancel={cancel} onRetry={retry} />
      )}

      {result && (
        <ResultsView
          key={`${urlKey}#${attemptN}`}
          result={result}
          selected={selectedKeys}
          contacted={history.contacted}
          onToggle={toggle}
          onSelectMany={selectMany}
          onRetry={retry}
        />
      )}

      <OutreachCart
        recipients={recipients}
        onRemove={(email) => selectMany([email], false)}
        onClear={() => setSelected(new Map())}
        onCompose={() => setComposing(true)}
      />
      {composing && <OutreachComposer recipients={recipients} onClose={() => setComposing(false)} onSent={removeSent} />}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header isDark={isDark} onToggleTheme={() => setIsDark((v) => !v)} searchHref={searchHref} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Routes>
          <Route path="/" element={searchPage} />
          <Route path="/history" element={<OutreachHistory />} />
          <Route path="*" element={searchPage} />
        </Routes>
      </main>
    </div>
  );
}
