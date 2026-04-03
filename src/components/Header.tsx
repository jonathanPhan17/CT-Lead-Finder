import { Moon, Sun, FlaskConical, Clock, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getHistory } from '../services/outreachHistory';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export default function Header({ isDark, onToggleTheme }: HeaderProps) {
  const location  = useLocation();
  const historyCount = getHistory().length;

  // Remember the last search URL so the Search nav link returns to it
  if (location.pathname === '/' && location.search) {
    sessionStorage.setItem('ct-last-search', location.pathname + location.search);
  }
  const lastSearch = sessionStorage.getItem('ct-last-search') ?? '/';

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 cursor-pointer">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <FlaskConical size={15} className="text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">CT Lead Finder</span>
        </Link>

        {/* Nav */}
        <div className="flex items-center gap-1">
          <Link
            to={lastSearch}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
              location.pathname === '/'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Search size={14} />
            Search
          </Link>

          <Link
            to="/history"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
              location.pathname === '/history'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Clock size={14} />
            Outreach History
            {historyCount > 0 && (
              <span className="ml-0.5 text-[11px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                {historyCount}
              </span>
            )}
          </Link>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Toggle theme">
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
        </div>
      </div>
      <Separator />
    </header>
  );
}
