import { useState } from 'react';
import { ChevronDown, ChevronUp, Send, Trash2 } from 'lucide-react';
import type { Recipient } from '@/search/resultsView';

interface Props {
  recipients: Recipient[];
  onRemove: (email: string) => void;
  onClear: () => void;
  onCompose: () => void;
}

export default function OutreachCart({ recipients, onRemove, onClear, onCompose }: Props) {
  // Starts collapsed: an open panel covers the results, and on a phone it covers the search form too.
  const [open, setOpen] = useState(false);
  if (recipients.length === 0) return null;
  const piCount = recipients.filter((r) => r.isPI).length;

  return (
    <div className="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2 sm:right-6 sm:bottom-6">
      {open && (
        <div className="flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl ring-2 ring-teal-500/50 dark:bg-slate-800 dark:text-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <Send size={16} className="text-teal-500" />
              <span className="text-base font-bold">Outreach list</span>
            </div>
            <button type="button" onClick={onClear} className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 transition-colors hover:text-red-500">
              <Trash2 size={11} />
              Clear all
            </button>
          </div>

          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
            {recipients.length} address{recipients.length === 1 ? '' : 'es'}, {piCount} belonging to a PI
          </div>

          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
            {recipients.map((r) => (
              <li key={r.email} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{r.name ?? r.email}</span>
                    {r.isPI && (
                      <span className="shrink-0 rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400">PI</span>
                    )}
                  </p>
                  {r.name && <p className="mt-0.5 truncate text-xs text-slate-500">{r.email}</p>}
                  {r.trials.length > 0 && (
                    <p className="truncate text-xs text-slate-400 dark:text-white/40">
                      {r.trials[0].facility}
                      {r.trials.length > 1 && ` and ${r.trials.length - 1} more trial${r.trials.length === 2 ? '' : 's'}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(r.email)}
                  aria-label={`Remove ${r.email}`}
                  className="mt-0.5 shrink-0 cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-400/10"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <button
              type="button"
              onClick={onCompose}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-base font-bold text-white shadow-lg shadow-teal-500/20 transition-colors hover:bg-teal-500"
            >
              <Send size={16} />
              Compose email
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2.5 rounded-full bg-slate-900 py-3 pr-4 pl-5 text-sm font-semibold text-white shadow-2xl ring-2 ring-teal-500/40 transition-all hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
      >
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-teal-500 px-1.5 text-xs font-bold">{recipients.length}</span>
        <span>Outreach list</span>
        {open ? <ChevronDown size={15} className="text-white/50" /> : <ChevronUp size={15} className="text-white/50" />}
      </button>
    </div>
  );
}
