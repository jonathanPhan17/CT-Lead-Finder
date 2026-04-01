import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';
import Header from './components/Header';
import SearchPanel from './components/SearchPanel';
import ResultsTable from './components/ResultsTable';
import { geocodeLocation } from './services/geocoding';
import { searchTrials } from './services/clinicalTrials';
import type { ContactRow } from './types';

function getInitialTheme(): boolean {
  const stored = localStorage.getItem('ct-theme');
  if (stored) return stored === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function App() {
  const [isDark, setIsDark] = useState(getInitialTheme);
  const [searchParams, setSearchParams] = useSearchParams();

  const urlLocation = searchParams.get('loc') ?? '';
  const urlDistance = Number(searchParams.get('dist') ?? 1);

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [totalStudies, setTotalStudies] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedLocation, setSearchedLocation] = useState('');

  const hasSearched = !!urlLocation;

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('ct-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('ct-theme', 'light');
    }
  }, [isDark]);

  const runSearch = useCallback(
    async (location: string, distance: number, pageToken?: string) => {
      setError(null);
      if (!pageToken) {
        setLoading(true);
        setContacts([]);
        setTotalStudies(0);
        setNextPageToken(undefined);
        setSearchedLocation(location);
      } else {
        setLoadingMore(true);
      }
      try {
        const geo = await geocodeLocation(location);
        const result = await searchTrials({ lat: geo.lat, lng: geo.lng, distance, recruitingOnly: true, pageToken });
        if (!pageToken) {
          setContacts(result.contacts);
        } else {
          setContacts((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            return [...prev, ...result.contacts.filter((c) => !existingIds.has(c.id))];
          });
        }
        setTotalStudies(result.totalStudies);
        setNextPageToken(result.nextPageToken);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
        setError(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!urlLocation) return;
    runSearch(urlLocation, urlDistance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlLocation, urlDistance]);

  function handleSearch(location: string, distance: number) {
    setSearchParams({ loc: location, dist: String(distance) });
  }

  function handleLoadMore() {
    if (!nextPageToken) return;
    runSearch(urlLocation, urlDistance, nextPageToken);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Header isDark={isDark} onToggleTheme={() => setIsDark((v) => !v)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {hasSearched ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
            <SearchPanel
              loading={loading}
              compact
              initialLocation={urlLocation}
              initialDistance={urlDistance}
              onSearch={handleSearch}
            />
          </div>
        ) : (
          <div className="py-12">
            <SearchPanel loading={loading} onSearch={handleSearch} />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
              <X size={16} />
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-5 w-64 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-96 rounded-xl bg-slate-200 dark:bg-slate-800" />
          </div>
        )}

        {!loading && hasSearched && contacts.length > 0 && (
          <ResultsTable
            contacts={contacts}
            totalStudies={totalStudies}
            searchedLocation={searchedLocation}
            hasMore={!!nextPageToken}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        )}

        {!loading && hasSearched && !error && contacts.length === 0 && (
          <div className="text-center py-20 text-slate-400 dark:text-slate-600">
            <p className="text-lg font-medium mb-1">No contacts found</p>
            <p className="text-sm">Try a different location or a larger radius.</p>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 mt-16 py-6 text-center text-xs text-slate-400 dark:text-slate-600">
        CT Lead Finder · Data from{' '}
        <a
          href="https://clinicaltrials.gov"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-500 underline underline-offset-2"
        >
          ClinicalTrials.gov
        </a>{' '}
        · For authorized outreach use only
      </footer>
    </div>
  );
}
