import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, X, MapPin, FlaskConical } from 'lucide-react';
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

type LoadingStep = 'geocoding' | 'fetching' | null;

const STEP_LABEL: Record<NonNullable<LoadingStep>, string> = {
  geocoding: 'Finding location…',
  fetching:  'Fetching trials…',
};

const STEP_ICON: Record<NonNullable<LoadingStep>, React.ReactNode> = {
  geocoding: <MapPin size={16} className="animate-bounce" />,
  fetching:  <FlaskConical size={16} className="animate-pulse" />,
};

function LoadingSkeleton({ step }: { step: LoadingStep }) {
  return (
    <div className="space-y-4">
      {/* Step indicator */}
      {step && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {STEP_ICON[step]}
          <span>{STEP_LABEL[step]}</span>
          <span className="flex gap-0.5 ml-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-muted-foreground/50 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
        </div>
      )}

      {/* Skeleton table */}
      <div className="rounded-xl border overflow-hidden">
        {/* Header row */}
        <div className="flex gap-4 px-3 py-2.5 bg-muted/50 border-b">
          {[120, 80, 160, 100, 140, 180, 80, 60, 90].map((w, i) => (
            <div key={i} className="h-3 rounded bg-muted animate-pulse shrink-0" style={{ width: w }} />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: 8 }).map((_, row) => (
          <div
            key={row}
            className="flex gap-4 px-3 py-3 border-b last:border-b-0"
            style={{ opacity: 1 - row * 0.09 }}
          >
            {[120, 80, 160, 100, 140, 180, 80, 60, 90].map((w, i) => (
              <div
                key={i}
                className="h-3 rounded bg-muted animate-pulse shrink-0"
                style={{ width: w * (0.6 + Math.random() * 0.4), animationDelay: `${(row + i) * 40}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(getInitialTheme);
  const [searchParams, setSearchParams] = useSearchParams();

  const urlLocation = searchParams.get('loc') ?? '';
  const urlDistance = Number(searchParams.get('dist') ?? 1);

  // hasSearched is set immediately on click — doesn't wait for URL or API
  const [hasSearched, setHasSearched] = useState(!!urlLocation);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [totalStudies, setTotalStudies] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedLocation, setSearchedLocation] = useState(urlLocation);
  const abortRef = useRef<AbortController | null>(null);

  // Sync hasSearched back to false when URL clears (browser back to /)
  useEffect(() => {
    if (!urlLocation) {
      setHasSearched(false);
      setContacts([]);
      setError(null);
    }
  }, [urlLocation]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    localStorage.setItem('ct-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const runSearch = useCallback(
    async (location: string, distance: number, pageToken?: string) => {
      // Abort any in-flight search
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      if (!pageToken) {
        setContacts([]);
        setTotalStudies(0);
        setNextPageToken(undefined);
        setSearchedLocation(location);
      } else {
        setLoadingMore(true);
      }

      try {
        if (!pageToken) setLoadingStep('geocoding');
        const geo = await geocodeLocation(location, controller.signal);

        if (!pageToken) setLoadingStep('fetching');
        const result = await searchTrials({ lat: geo.lat, lng: geo.lng, distance, recruitingOnly: true, pageToken }, controller.signal);

        if (!pageToken) {
          setContacts(result.contacts);
          setTotalStudies(result.totalStudies);
        } else {
          setContacts((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const merged = [...prev, ...result.contacts.filter((c) => !existingIds.has(c.id))];
            setTotalStudies(new Set(merged.map((c) => c.nctId)).size);
            return merged;
          });
        }
        setNextPageToken(result.nextPageToken);
      } catch (err: unknown) {
        if (axios.isCancel(err)) return; // silently ignore cancelled requests
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
        setError(msg);
      } finally {
        setLoadingStep(null);
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
    // Immediately flip to results layout — no waiting
    setHasSearched(true);
    setSearchParams({ loc: location, dist: String(distance) });
  }

  function handleLoadMore() {
    if (!nextPageToken) return;
    runSearch(urlLocation, urlDistance, nextPageToken);
  }

  const isLoading = loadingStep !== null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header isDark={isDark} onToggleTheme={() => setIsDark((v) => !v)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {hasSearched ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
            <SearchPanel
              loading={isLoading}
              compact
              initialLocation={urlLocation}
              initialDistance={urlDistance}
              onSearch={handleSearch}
            />
          </div>
        ) : (
          <div className="py-12">
            <SearchPanel loading={isLoading} onSearch={handleSearch} />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 dark:hover:text-red-300 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {isLoading && <LoadingSkeleton step={loadingStep} />}

        {!isLoading && hasSearched && contacts.length > 0 && (
          <ResultsTable
            contacts={contacts}
            totalStudies={totalStudies}
            searchedLocation={searchedLocation}
            hasMore={!!nextPageToken}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        )}

        {!isLoading && hasSearched && !error && contacts.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-medium mb-1">No contacts found</p>
            <p className="text-sm">Try a different location or a larger radius.</p>
          </div>
        )}
      </main>
    </div>
  );
}
