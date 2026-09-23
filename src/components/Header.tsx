import { Clock, FlaskConical, Moon, Search, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useHistory } from '@/outreach/historyStore';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  /** Where the Search tab leads: the last search the user ran, so switching tabs does not lose it. */
  searchHref: string;
}

const tabClass = (active: boolean) =>
  `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
    active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
  }`;

export default function Header({ isDark, onToggleTheme, searchHref }: HeaderProps) {
  const { pathname } = useLocation();
  const history = useHistory();
  const count = history.status === 'ready' ? history.records.length : 0;

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
            <FlaskConical size={15} className="text-primary-foreground" />
          </div>
          <span className="hidden font-semibold tracking-tight sm:inline">CT Lead Finder</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link to={searchHref} className={tabClass(pathname === '/')}>
            <Search size={14} />
            Search
          </Link>
          <Link to="/history" className={tabClass(pathname === '/history')}>
            <Clock size={14} />
            History
            {count > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">{count}</span>
            )}
          </Link>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
        </nav>
      </div>
      <Separator />
    </header>
  );
}
