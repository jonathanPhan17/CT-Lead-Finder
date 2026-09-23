import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Building2, Crosshair, Loader2, Map as MapIcon, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DEFAULT_STATUSES,
  MAX_TEXT_LENGTH,
  QUERY_PROBLEM_MESSAGES,
  RADIUS_OPTIONS,
  SITE_STATUSES,
  SITE_STATUS_LABELS,
  validateQuery,
  type QueryProblem,
  type RadiusMiles,
  type SearchMode,
  type SearchQuery,
  type SiteStatus,
} from '@/search/searchQuery';
import { US_STATES } from '@/search/usStates';

interface Draft {
  mode: SearchMode;
  stateCode: string;
  city: string;
  institution: string;
  institutionState: string;
  place: string;
  miles: RadiusMiles;
  condition: string;
  statuses: SiteStatus[];
}

function draftFrom(q: SearchQuery | null): Draft {
  const d: Draft = {
    mode: q?.mode ?? 'state',
    stateCode: '',
    city: '',
    institution: '',
    institutionState: '',
    place: '',
    miles: 25,
    condition: q?.condition ?? '',
    statuses: q ? [...q.statuses] : [...DEFAULT_STATUSES],
  };
  if (!q) return d;
  switch (q.mode) {
    case 'state':
      return { ...d, stateCode: q.stateCode };
    case 'city':
      return { ...d, city: q.city, stateCode: q.stateCode };
    case 'institution':
      return { ...d, institution: q.institution, institutionState: q.stateCode ?? '' };
    case 'radius':
      return { ...d, place: q.place, miles: q.miles };
  }
}

function draftToQuery(d: Draft): SearchQuery {
  const filters = { statuses: d.statuses, condition: d.condition };
  switch (d.mode) {
    case 'state':
      return { mode: 'state', stateCode: d.stateCode, ...filters };
    case 'city':
      return { mode: 'city', city: d.city, stateCode: d.stateCode, ...filters };
    case 'institution':
      return { mode: 'institution', institution: d.institution, stateCode: d.institutionState || null, ...filters };
    case 'radius':
      return { mode: 'radius', place: d.place, miles: d.miles, ...filters };
  }
}

const MODES: { mode: SearchMode; label: string; icon: ReactNode; hint: string }[] = [
  {
    mode: 'state',
    label: 'State',
    icon: <MapIcon size={14} />,
    hint: 'Every trial site in the state. Large states such as California can take up to a minute.',
  },
  {
    mode: 'city',
    label: 'City',
    icon: <MapPin size={14} />,
    hint: 'Sites whose registered city matches exactly. Suburbs and neighborhoods count as separate cities.',
  },
  {
    mode: 'institution',
    label: 'Institution',
    icon: <Building2 size={14} />,
    hint: 'Matches whole words in the registered facility name. Each trial types the name its own way, so "UCLA" and "University of California, Los Angeles" find different sites. Search each common form.',
  },
  {
    mode: 'radius',
    label: 'Near a place',
    icon: <Crosshair size={14} />,
    hint: 'Distance is measured to the center of each site’s city, not to the building itself.',
  },
];

const fieldClass =
  'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30';

function problemField(p: QueryProblem | null): 'state' | 'city' | 'institution' | 'place' | 'status' | null {
  switch (p) {
    case null:
      return null;
    case 'missing_state':
      return 'state';
    case 'missing_city':
      return 'city';
    case 'missing_institution':
    case 'institution_too_short':
      return 'institution';
    case 'missing_place':
      return 'place';
    case 'no_status':
      return 'status';
  }
}

interface Props {
  initialQuery: SearchQuery | null;
  busy: boolean;
  hero: boolean;
  onSubmit: (q: SearchQuery) => void;
}

export default function SearchForm({ initialQuery, busy, hero, onSubmit }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initialQuery));
  const [problem, setProblem] = useState<QueryProblem | null>(null);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const bad = problemField(problem);
  const activeMode = MODES.find((m) => m.mode === draft.mode) ?? MODES[0];

  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setProblem(null);
  }

  function toggleStatus(s: SiteStatus) {
    setDraft((d) => ({
      ...d,
      statuses: d.statuses.includes(s) ? d.statuses.filter((x) => x !== s) : SITE_STATUSES.filter((x) => x === s || d.statuses.includes(x)),
    }));
    setProblem(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = draftToQuery(draft);
    const p = validateQuery(q);
    setProblem(p);
    if (!p) {
      onSubmit(q);
      return;
    }
    // Move focus to the field that needs fixing once it has rendered as invalid.
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>('input[aria-invalid="true"], select[aria-invalid="true"], fieldset[aria-invalid="true"] input')
        ?.focus();
    });
  }

  const stateSelect = (value: string, onChange: (v: string) => void, optional: boolean) => (
    <select
      id={`${id}-state`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={bad === 'state' || undefined}
      className={cn(fieldClass, 'cursor-pointer')}
    >
      <option value="">{optional ? 'Any state' : 'Choose a state'}</option>
      {US_STATES.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className={cn(hero && 'mx-auto max-w-2xl')}>
      {hero && (
        <div className="mb-8 text-center">
          <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">Find clinical trial sites and investigators</h1>
          <p className="mx-auto max-w-lg text-base text-muted-foreground">
            Search ClinicalTrials.gov by state, city, institution or distance. Results are grouped by site, with the people
            each site lists as contacts.
          </p>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div role="tablist" aria-label="Search by" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              role="tab"
              aria-selected={draft.mode === m.mode}
              onClick={() => update({ mode: m.mode })}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                draft.mode === m.mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {draft.mode === 'state' && (
            <Field label="State" htmlFor={`${id}-state`}>
              {stateSelect(draft.stateCode, (v) => update({ stateCode: v }), false)}
            </Field>
          )}

          {draft.mode === 'city' && (
            <>
              <Field label="City" htmlFor={`${id}-city`}>
                <input
                  id={`${id}-city`}
                  value={draft.city}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(e) => update({ city: e.target.value })}
                  placeholder="e.g. Boston"
                  aria-invalid={bad === 'city' || undefined}
                  className={fieldClass}
                />
              </Field>
              <Field label="State" htmlFor={`${id}-state`}>
                {stateSelect(draft.stateCode, (v) => update({ stateCode: v }), false)}
              </Field>
            </>
          )}

          {draft.mode === 'institution' && (
            <>
              <Field label="Institution name" htmlFor={`${id}-inst`}>
                <input
                  id={`${id}-inst`}
                  value={draft.institution}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(e) => update({ institution: e.target.value })}
                  placeholder="e.g. Mayo Clinic"
                  aria-invalid={bad === 'institution' || undefined}
                  className={fieldClass}
                />
              </Field>
              <Field label="State (optional)" htmlFor={`${id}-state`}>
                {stateSelect(draft.institutionState, (v) => update({ institutionState: v }), true)}
              </Field>
            </>
          )}

          {draft.mode === 'radius' && (
            <>
              <Field label="City, address or landmark" htmlFor={`${id}-place`}>
                <input
                  id={`${id}-place`}
                  value={draft.place}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(e) => update({ place: e.target.value })}
                  placeholder="e.g. Houston, TX"
                  aria-invalid={bad === 'place' || undefined}
                  className={fieldClass}
                />
              </Field>
              <Field label="Within" htmlFor={`${id}-miles`}>
                <select
                  id={`${id}-miles`}
                  value={draft.miles}
                  onChange={(e) => update({ miles: RADIUS_OPTIONS.find((r) => r === Number(e.target.value)) ?? 25 })}
                  className={cn(fieldClass, 'cursor-pointer')}
                >
                  {RADIUS_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r} miles
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <Field label="Condition (optional)" htmlFor={`${id}-cond`} className="sm:col-span-2">
            <input
              id={`${id}-cond`}
              value={draft.condition}
              maxLength={MAX_TEXT_LENGTH}
              onChange={(e) => update({ condition: e.target.value })}
              placeholder="e.g. breast cancer, type 2 diabetes"
              className={fieldClass}
            />
          </Field>
        </div>

        <fieldset aria-invalid={bad === 'status' || undefined}>
          <legend className="mb-2 text-sm font-medium">Site status</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {SITE_STATUSES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.statuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                  className="size-4 cursor-pointer accent-primary"
                />
                {SITE_STATUS_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-xs text-muted-foreground">{activeMode.hint}</p>

        {problem && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {QUERY_PROBLEM_MESSAGES[problem]}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {draft.mode === 'radius' ? (
            <p className="text-[11px] text-muted-foreground">
              Place lookup by{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
                OpenStreetMap contributors
              </a>
            </p>
          ) : (
            <span />
          )}
          <Button type="submit" className="h-9 px-4">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Search
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
