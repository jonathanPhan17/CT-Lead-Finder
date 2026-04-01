import { useState } from 'react';
import type { FormEvent } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';

const DISTANCE_OPTIONS = [1, 5, 10, 25, 50, 100];

interface SearchPanelProps {
  loading: boolean;
  compact?: boolean;
  initialLocation?: string;
  initialDistance?: number;
  onSearch: (location: string, distance: number) => void;
}

export default function SearchPanel({
  loading,
  compact = false,
  initialLocation = '',
  initialDistance = 1,
  onSearch,
}: SearchPanelProps) {
  const [location, setLocation] = useState(initialLocation);
  const [distance, setDistance] = useState(initialDistance);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = location.trim();
    if (!trimmed || loading) return;
    onSearch(trimmed, distance);
  }

  /* ── Compact bar (shown after first search) ── */
  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Hospital or location…"
            className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>
        <select
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          className="h-9 pl-3 pr-10 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
        >
          {DISTANCE_OPTIONS.map((d) => (
            <option key={d} value={d}>{d} mi</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!location.trim() || loading}
          className="h-9 shrink-0 flex items-center gap-1.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </form>
    );
  }

  /* ── Hero form ── */
  return (
    <div className="max-w-xl mx-auto">
      {/* Hero text */}
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-3">
          Find Clinical Trial Investigators
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-base sm:text-lg max-w-md mx-auto">
          Search ClinicalTrials.gov by location and extract PI contact info for outreach.
        </p>
      </div>

      {/* Search card */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex flex-col gap-3"
      >
        {/* Row 1 — Location */}
        <div className="relative">
          <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Massachusetts General Hospital, Boston, MA"
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
            autoFocus
          />
        </div>

        {/* Row 2 — Radius */}
        <select
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          className="h-10 pl-3 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shrink-0 transition"
        >
          {DISTANCE_OPTIONS.map((d) => (
            <option key={d} value={d}>{d} mile{d !== 1 ? 's' : ''}</option>
          ))}
        </select>

        {/* Row 3 — Submit */}
        <button
          type="submit"
          disabled={!location.trim() || loading}
          className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <Search size={15} />
              Search Principal Investigators
            </>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-3">
        Data from ClinicalTrials.gov · Recruiting trials only
      </p>
    </div>
  );
}
