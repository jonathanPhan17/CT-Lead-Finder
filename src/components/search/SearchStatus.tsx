import { AlertCircle, Loader2, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_STUDIES } from '@/search/fetchStudies';
import { SEARCH_ERROR_MESSAGES } from '@/search/searchErrors';
import type { SearchState } from '@/search/useTrialSearch';

interface Props {
  state: Extract<SearchState, { phase: 'loading' | 'error' | 'cancelled' }>;
  onCancel: () => void;
  onRetry: () => void;
}

export default function SearchStatus({ state, onCancel, onRetry }: Props) {
  if (state.phase === 'loading') {
    const { studiesFetched, totalStudies } = state.progress;
    const target = totalStudies === null ? null : Math.min(totalStudies, MAX_STUDIES);
    const pct = target ? Math.min(100, Math.round((studiesFetched / target) * 100)) : null;
    const label =
      state.step === 'locating'
        ? 'Finding that place on the map…'
        : totalStudies === null
          ? 'Contacting ClinicalTrials.gov…'
          : `Reading trials: ${studiesFetched.toLocaleString()} of ${(target ?? 0).toLocaleString()}`;
    return (
      <div role="status" aria-live="polite" className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
          <p className="flex-1 text-sm">{label}</p>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X size={13} /> Cancel
          </Button>
        </div>
        {state.center && <p className="mt-2 text-xs text-muted-foreground">Searching around {state.center.label}</p>}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={pct === null ? 'h-full w-1/3 animate-pulse rounded-full bg-primary/50' : 'h-full rounded-full bg-primary transition-all'}
            style={pct === null ? undefined : { width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (state.phase === 'cancelled') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <p className="flex-1 text-sm text-muted-foreground">Search cancelled.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw size={13} /> Run it again
        </Button>
      </div>
    );
  }

  const msg = SEARCH_ERROR_MESSAGES[state.kind];
  const canRetry = state.kind !== 'invalid_query' && state.kind !== 'place_not_found';
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{msg.title}</p>
        <p className="mt-0.5 text-sm">{msg.detail}</p>
      </div>
      {canRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw size={13} /> Try again
        </Button>
      )}
    </div>
  );
}
