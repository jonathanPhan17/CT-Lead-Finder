import { useState } from 'react';
import { Trash2, Send, ChevronUp, ChevronDown } from 'lucide-react';
import type { ContactRow } from '../types';

interface Props {
  selected: ContactRow[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompose: () => void;
}

export default function OutreachCart({ selected, onRemove, onClear, onCompose }: Props) {
  const [open, setOpen] = useState(true);

  if (selected.length === 0) return null;

  const piCount    = selected.filter((c) => c.isPrincipalInvestigator).length;
  const emailCount = selected.filter((c) => c.contactEmail).length;

  return (
    <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">

      {/* Expanded cart panel */}
      {open && (
        <div className="w-96 rounded-2xl overflow-hidden flex flex-col max-h-[75vh] shadow-2xl ring-2 ring-teal-500/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <Send size={16} className="text-teal-500" />
              <span className="font-bold text-base">Outreach list</span>
            </div>
            <button
              onClick={onClear}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
            >
              <Trash2 size={11} />
              Clear all
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-500 dark:text-white/50">
            <span><span className="font-bold text-slate-900 dark:text-white text-base">{selected.length}</span> contacts</span>
            <span className="text-slate-300 dark:text-white/20">·</span>
            <span><span className="font-bold text-teal-500 text-base">{piCount}</span> PI{piCount !== 1 ? 's' : ''}</span>
            <span className="text-slate-300 dark:text-white/20">·</span>
            <span><span className="font-bold text-slate-900 dark:text-white text-base">{emailCount}</span> with email</span>
          </div>

          {/* Contact list */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-white/5">
            {selected.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold truncate">{c.contactName}</span>
                    {c.isPrincipalInvestigator && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-600 dark:text-teal-400 font-semibold shrink-0">
                        PI
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{c.contactEmail}</p>
                  <p className="text-xs text-slate-300 dark:text-white/25 truncate">{c.facility}</p>
                </div>
                <button
                  onClick={() => onRemove(c.id)}
                  className="mt-0.5 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-400/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Compose button */}
          <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
            <button
              onClick={onCompose}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-bold text-base transition-colors cursor-pointer shadow-lg shadow-teal-500/20"
            >
              <Send size={16} />
              Compose & Send
            </button>
          </div>
        </div>
      )}

      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-5 pr-4 py-3 rounded-full bg-slate-900 dark:bg-slate-700 text-white ring-2 ring-teal-500/40 shadow-2xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all cursor-pointer text-sm font-semibold"
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-500 text-white text-xs font-bold shrink-0">
          {selected.length}
        </span>
        <span>Outreach list</span>
        {piCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-400 font-semibold">
            {piCount} PI{piCount !== 1 ? 's' : ''}
          </span>
        )}
        {open
          ? <ChevronDown size={15} className="text-white/50" />
          : <ChevronUp size={15} className="text-white/50" />
        }
      </button>
    </div>
  );
}
