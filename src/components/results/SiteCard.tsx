import { memo, useState } from 'react';
import { Building2, ExternalLink, Mail, MapPin, Phone, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { roleLabel, statusLabel } from '@/search/resultsView';
import type { Person, Site } from '@/search/siteIndex';

const PEOPLE_PREVIEW = 6;

function place(site: Site): string {
  return [site.city, site.state, site.country === 'United States' ? null : site.country].filter(Boolean).join(', ');
}

interface Props {
  site: Site;
  selected: ReadonlySet<string>;
  contacted: ReadonlySet<string>;
  onToggle: (email: string) => void;
}

function SiteCard({ site, selected, contacted, onToggle }: Props) {
  const [showAllPeople, setShowAllPeople] = useState(false);
  const people = showAllPeople ? site.people : site.people.slice(0, PEOPLE_PREVIEW);
  const hidden = site.people.length - people.length;
  const where = place(site);

  return (
    <article className="rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-start gap-2 text-sm font-semibold">
            <Building2 size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span className="break-words">{site.facility}</span>
          </h3>
          {where && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin size={12} className="shrink-0" />
              {where}
              {site.distanceMiles !== null && <span>&middot; {site.distanceMiles.toFixed(1)} mi</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5 text-[11px] font-medium">
          <span className="rounded-full bg-muted px-2 py-0.5">
            {site.trials.length} trial{site.trials.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">
            {site.people.length} contact{site.people.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      {site.people.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          This site lists no contacts. The trial page on ClinicalTrials.gov may name a central contact instead.
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border">
          {people.map((p) => (
            <PersonRow key={p.key} person={p} selected={selected} contacted={contacted} onToggle={onToggle} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAllPeople(true)} className="mt-2 cursor-pointer text-xs font-medium text-primary hover:underline">
          Show {hidden} more contact{hidden === 1 ? '' : 's'}
        </button>
      )}
      {showAllPeople && site.people.length > PEOPLE_PREVIEW && (
        <button type="button" onClick={() => setShowAllPeople(false)} className="mt-2 cursor-pointer text-xs font-medium text-primary hover:underline">
          Show fewer contacts
        </button>
      )}

      <details className="group mt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          {site.trials.length === 1 ? 'Show the trial at this site' : `Show the ${site.trials.length} trials at this site`}
        </summary>
        <ul className="mt-2 space-y-2">
          {site.trials.map((t) => (
            <li key={t.nctId} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">{t.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                <a
                  href={`https://clinicaltrials.gov/study/${encodeURIComponent(t.nctId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-mono text-primary hover:underline"
                >
                  {t.nctId} <ExternalLink size={10} />
                </a>
                {t.phase && <span>{t.phase}</span>}
                <span>{statusLabel(t.siteStatus ?? t.studyStatus)}</span>
                {t.sponsor && <span className="truncate">Sponsor: {t.sponsor}</span>}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function PersonRow({
  person,
  selected,
  contacted,
  onToggle,
}: {
  person: Person;
  selected: ReadonlySet<string>;
  contacted: ReadonlySet<string>;
  onToggle: (email: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1.5 px-3 py-2.5">
      <div className="min-w-44 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <UserRound size={13} className="shrink-0 text-muted-foreground" />
          <span className={cn('font-medium', !person.name && 'text-muted-foreground italic')}>
            {person.name ?? 'Name not listed'}
          </span>
          {person.isPI && (
            <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">PI</span>
          )}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{person.roles.map(roleLabel).join(', ')}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {person.emails.map((email) => (
          <label key={email} className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selected.has(email)}
              onChange={() => onToggle(email)}
              aria-label={`Add ${email} to the outreach list`}
              className="size-3.5 cursor-pointer accent-primary"
            />
            <Mail size={12} className="shrink-0 text-muted-foreground" />
            <span className="break-all">{email}</span>
            {contacted.has(email) && (
              <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                Contacted
              </span>
            )}
          </label>
        ))}
        {person.phones.map((phone) => (
          <a key={phone} href={`tel:${phone.split(/ext/i)[0].replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <Phone size={12} className="ml-5.5 shrink-0" />
            {phone}
          </a>
        ))}
        {person.emails.length === 0 && person.phones.length === 0 && (
          <span className="text-xs text-muted-foreground">No email or phone listed</span>
        )}
      </div>
    </li>
  );
}

export default memo(SiteCard);
