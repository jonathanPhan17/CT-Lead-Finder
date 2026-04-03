import { useState } from 'react';
import type { FormEvent } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import LocationInput from '@/components/LocationInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  initialLocation = 'Massachusetts General Hospital, Boston, Massachusetts',
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
        <div className="flex-1 min-w-0">
          <LocationInput
            value={location}
            onChange={setLocation}
            placeholder="Hospital or location…"
          />
        </div>
        <Select value={String(distance)} onValueChange={(v) => setDistance(Number(v))}>
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DISTANCE_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d} mi
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!location.trim() || loading} className="shrink-0">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </Button>
      </form>
    );
  }

  /* ── Hero form ── */
  return (
    <div className="max-w-xl mx-auto">
      {/* Hero text */}
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          Find Clinical Trial Investigators
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto">
          Search ClinicalTrials.gov by location and extract PI contact info for outreach.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Location */}
            <LocationInput
              value={location}
              onChange={setLocation}
              placeholder="e.g. Massachusetts General Hospital, Boston, MA"
              inputClassName="h-11 text-sm"
            />

            {/* Radius */}
            <Select value={String(distance)} onValueChange={(v) => setDistance(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTANCE_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} mile{d !== 1 ? 's' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Submit */}
            <Button
              type="submit"
              disabled={!location.trim() || loading}
              className="w-full h-10"
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
            </Button>
          </form>
        </CardContent>
      </Card>

    </div>
  );
}
