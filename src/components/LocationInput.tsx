import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchSuggestions, type LocationSuggestion } from '@/services/geocoding';

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputClassName?: string;
}

export default function LocationInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  inputClassName = '',
}: LocationInputProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Only fetch/show suggestions when the user is actively typing in the field
  const isFocused = useRef(false);

  useEffect(() => {
    clearTimeout(debounceRef.current);

    // Never fetch if the input isn't focused — prevents auto-opening on mount
    // or when the parent re-renders with a new value (e.g. after search)
    if (!isFocused.current || value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      setFetching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setFetching(true);
      setOpen(true);
      try {
        const results = await fetchSuggestions(value);
        // Double-check focus hasn't been lost while we were fetching
        if (!isFocused.current) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setFetching(false);
      }
    }, 350);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function dismiss() {
    isFocused.current = false;
    setOpen(false);
    setSuggestions([]);
    setFetching(false);
    clearTimeout(debounceRef.current);
  }

  function select(s: LocationSuggestion) {
    onChange(s.shortName);
    dismiss();
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // Close and clear on submit — parent form will handle the search
      dismiss();
      if (open && activeIndex >= 0) {
        e.preventDefault();
        select(suggestions[activeIndex]);
      }
      return;
    }
    if (e.key === 'Escape') { dismiss(); return; }
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <MapPin
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
      />

      {fetching && (
        <Loader2
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin pointer-events-none z-10"
        />
      )}

      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => dismiss()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className={`pl-9 pr-8 ${inputClassName}`}
      />

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {fetching ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-3 py-2.5 flex items-start gap-2.5">
                <div className="mt-0.5 w-3.5 h-3.5 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div
                    className="h-3 rounded bg-muted animate-pulse"
                    style={{ width: `${60 + i * 12}%`, animationDelay: `${i * 80}ms` }}
                  />
                  <div
                    className="h-2.5 rounded bg-muted/60 animate-pulse"
                    style={{ width: `${80 + i * 5}%`, animationDelay: `${i * 80 + 40}ms` }}
                  />
                </div>
              </div>
            ))
          ) : (
            suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(s);
                }}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors cursor-pointer ${
                  i === activeIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.shortName}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.fullName}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
